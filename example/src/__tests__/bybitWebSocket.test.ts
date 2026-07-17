import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { type NetInfoState } from '@react-native-community/netinfo';
import { type AppStateStatus } from 'react-native';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn() },
}));

import {
  BybitWebSocketClient,
  type BybitWebSocketEvent,
} from '../bybitWebSocket';

class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  readonly sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: 'test close' });
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  message(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  error() {
    this.onerror?.();
  }
}

class FakeAppState {
  currentState: AppStateStatus | null = 'active';
  private listener: ((state: AppStateStatus) => void) | null = null;

  addEventListener(
    _event: 'change',
    listener: (state: AppStateStatus) => void
  ) {
    this.listener = listener;
    return {
      remove: () => {
        if (this.listener === listener) {
          this.listener = null;
        }
      },
    };
  }

  emit(state: AppStateStatus) {
    this.currentState = state;
    this.listener?.(state);
  }
}

class FakeNetInfo {
  private listener: ((state: NetInfoState) => void) | null = null;

  addEventListener(listener: (state: NetInfoState) => void) {
    this.listener = listener;
    return () => {
      if (this.listener === listener) {
        this.listener = null;
      }
    };
  }

  emit(isConnected: boolean | null, isInternetReachable: boolean | null) {
    this.listener?.({
      isConnected,
      isInternetReachable,
    } as NetInfoState);
  }
}

function sentMessages(socket: FakeSocket) {
  return socket.sent.map(
    (message) => JSON.parse(message) as Record<string, unknown>
  );
}

function acknowledgeSubscriptions(socket: FakeSocket) {
  const subscriptions = sentMessages(socket).filter(
    (message) => message.op === 'subscribe'
  );
  subscriptions.forEach((message) => {
    socket.message({
      success: true,
      op: 'subscribe',
      req_id: message.req_id,
    });
  });
}

describe('BybitWebSocketClient', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup() {
    const sockets: FakeSocket[] = [];
    const appState = new FakeAppState();
    const netInfo = new FakeNetInfo();
    const client = new BybitWebSocketClient({
      appState,
      netInfo,
      random: () => 0,
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    return { client, sockets, appState, netInfo };
  }

  it('shares one physical socket and reference-counts topic subscriptions', () => {
    const { client, sockets } = setup();
    const firstEvents: BybitWebSocketEvent[] = [];
    const secondEvents: BybitWebSocketEvent[] = [];
    const unsubscribeFirst = client.subscribe('kline.1.BTCUSDT', (event) => {
      firstEvents.push(event);
    });
    const unsubscribeSecond = client.subscribe(
      'publicTrade.ETHUSDT',
      (event) => {
        secondEvents.push(event);
      }
    );

    expect(sockets).toHaveLength(1);
    const socket = sockets[0]!;
    socket.open();
    expect(
      sentMessages(socket).filter((message) => message.op === 'subscribe')
    ).toHaveLength(2);
    acknowledgeSubscriptions(socket);
    expect(firstEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ready', generation: 1 }),
      ])
    );
    expect(secondEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ready', generation: 1 }),
      ])
    );

    unsubscribeFirst();
    expect(socket.readyState).toBe(1);
    expect(sentMessages(socket)).toEqual(
      expect.arrayContaining([expect.objectContaining({ op: 'unsubscribe' })])
    );
    unsubscribeSecond();
    expect(socket.readyState).toBe(3);
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('switches interval topics on an open physical socket', () => {
    const { client, sockets } = setup();
    const unsubscribePrevious = client.subscribe(
      'kline.1.BTCUSDT',
      () => {}
    );
    const socket = sockets[0]!;
    socket.open();
    acknowledgeSubscriptions(socket);

    const unsubscribeReplacement = client.subscribe(
      'kline.5.BTCUSDT',
      () => {}
    );
    expect(sockets).toHaveLength(1);
    expect(sentMessages(socket).at(-1)).toMatchObject({
      op: 'subscribe',
      args: ['kline.5.BTCUSDT'],
    });

    acknowledgeSubscriptions(socket);
    unsubscribePrevious();

    expect(socket.readyState).toBe(1);
    expect(sockets).toHaveLength(1);
    expect(sentMessages(socket).at(-1)).toMatchObject({
      op: 'unsubscribe',
      args: ['kline.1.BTCUSDT'],
    });
    unsubscribeReplacement();
  });

  it('requires pong and reconnects with jittered exponential backoff', () => {
    const { client, sockets } = setup();
    const events: BybitWebSocketEvent[] = [];
    const unsubscribe = client.subscribe('publicTrade.BTCUSDT', (event) => {
      events.push(event);
    });
    const firstSocket = sockets[0]!;
    firstSocket.open();
    acknowledgeSubscriptions(firstSocket);

    jest.advanceTimersByTime(20_000);
    expect(sentMessages(firstSocket)).toEqual(
      expect.arrayContaining([expect.objectContaining({ op: 'ping' })])
    );
    jest.advanceTimersByTime(10_000);
    expect(firstSocket.readyState).toBe(3);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'state', state: 'reconnecting' }),
      ])
    );

    jest.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    firstSocket.message({
      topic: 'publicTrade.BTCUSDT',
      data: [{ i: 'stale', seq: 1, T: 1, p: '1', v: '1' }],
    });
    expect(
      events.filter(
        (event) => event.type === 'message' && event.generation === 1
      )
    ).toHaveLength(0);
    unsubscribe();
  });

  it('keeps a healthy socket open after the corresponding pong', () => {
    const { client, sockets } = setup();
    const unsubscribe = client.subscribe('publicTrade.BTCUSDT', () => {});
    const socket = sockets[0]!;
    socket.open();
    acknowledgeSubscriptions(socket);
    jest.advanceTimersByTime(20_000);
    const ping = sentMessages(socket).find((message) => message.op === 'ping');
    socket.message({
      success: true,
      op: 'ping',
      ret_msg: 'pong',
      req_id: ping?.req_id,
    });
    jest.advanceTimersByTime(10_000);
    expect(socket.readyState).toBe(1);
    expect(sockets).toHaveLength(1);
    unsubscribe();
  });

  it('stops while offline or backgrounded and resumes exactly once', () => {
    const { client, sockets, appState, netInfo } = setup();
    const events: BybitWebSocketEvent[] = [];
    const unsubscribe = client.subscribe('kline.1.BTCUSDT', (event) => {
      events.push(event);
    });
    sockets[0]!.open();
    acknowledgeSubscriptions(sockets[0]!);

    netInfo.emit(false, false);
    expect(sockets[0]!.readyState).toBe(3);
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'offline' });
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);

    netInfo.emit(true, true);
    expect(sockets).toHaveLength(2);
    netInfo.emit(true, true);
    expect(sockets).toHaveLength(2);

    appState.emit('background');
    expect(sockets[1]!.readyState).toBe(3);
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'paused' });
    appState.emit('active');
    expect(sockets).toHaveLength(3);
    unsubscribe();
  });

  it('reconnects after socket errors but not after intentional cleanup', () => {
    const { client, sockets } = setup();
    const unsubscribe = client.subscribe('kline.1.BTCUSDT', () => {});
    sockets[0]!.error();
    jest.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    unsubscribe();
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });
});
