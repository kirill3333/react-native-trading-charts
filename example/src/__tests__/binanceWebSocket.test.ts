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
  BinanceWebSocketClient,
  type BinanceWebSocketEvent,
} from '../binanceWebSocket';

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
    return { remove: () => (this.listener = null) };
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
    return () => (this.listener = null);
  }

  emit(isConnected: boolean | null, isInternetReachable: boolean | null) {
    this.listener?.({ isConnected, isInternetReachable } as NetInfoState);
  }
}

function sentMessages(socket: FakeSocket) {
  return socket.sent.map(
    (message) => JSON.parse(message) as Record<string, unknown>
  );
}

function acknowledgeSubscriptions(socket: FakeSocket) {
  sentMessages(socket)
    .filter((message) => message.method === 'SUBSCRIBE')
    .forEach((message) => socket.message({ result: null, id: message.id }));
}

describe('BinanceWebSocketClient', () => {
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
    const client = new BinanceWebSocketClient({
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

  it('shares one socket and dynamically subscribes to native kline topics', () => {
    const { client, sockets } = setup();
    const firstEvents: BinanceWebSocketEvent[] = [];
    const secondEvents: BinanceWebSocketEvent[] = [];
    const removeFirst = client.subscribe('btcusdt@kline_1s', (event) =>
      firstEvents.push(event)
    );
    const removeSecond = client.subscribe('ethusdt@kline_1m', (event) =>
      secondEvents.push(event)
    );

    const socket = sockets[0]!;
    socket.open();
    expect(sentMessages(socket)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'SUBSCRIBE',
          params: ['btcusdt@kline_1s'],
        }),
        expect.objectContaining({
          method: 'SUBSCRIBE',
          params: ['ethusdt@kline_1m'],
        }),
      ])
    );
    acknowledgeSubscriptions(socket);
    expect(firstEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'ready' })])
    );
    expect(secondEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'ready' })])
    );

    removeFirst();
    expect(sentMessages(socket)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'UNSUBSCRIBE',
          params: ['btcusdt@kline_1s'],
        }),
      ])
    );
    expect(socket.readyState).toBe(1);
    removeSecond();
    expect(socket.readyState).toBe(3);
  });

  it('routes Binance kline messages to their topic listener', () => {
    const { client, sockets } = setup();
    const events: BinanceWebSocketEvent[] = [];
    client.subscribe('btcusdt@kline_1s', (event) => events.push(event));
    const socket = sockets[0]!;
    socket.open();
    acknowledgeSubscriptions(socket);
    socket.message({
      e: 'kline',
      s: 'BTCUSDT',
      k: { t: 1_000, i: '1s', o: '10', h: '11', l: '9', c: '10', v: '1' },
    });
    expect(events.at(-1)).toMatchObject({
      type: 'message',
      topic: 'btcusdt@kline_1s',
      generation: 1,
    });
  });

  it('reconnects and resubscribes after a transport error', () => {
    const { client, sockets } = setup();
    client.subscribe('btcusdt@kline_1s', () => undefined);
    sockets[0]!.open();
    acknowledgeSubscriptions(sockets[0]!);
    sockets[0]!.error();
    jest.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(sentMessages(sockets[1]!)).toEqual([
      expect.objectContaining({
        method: 'SUBSCRIBE',
        params: ['btcusdt@kline_1s'],
      }),
    ]);
  });

  it('pauses in background and resumes with a new socket', () => {
    const { client, sockets, appState } = setup();
    const events: BinanceWebSocketEvent[] = [];
    client.subscribe('btcusdt@kline_1s', (event) => events.push(event));
    sockets[0]!.open();
    appState.emit('background');
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'paused' });
    appState.emit('active');
    expect(sockets).toHaveLength(2);
  });

  it('waits offline and reconnects when network reachability returns', () => {
    const { client, sockets, netInfo } = setup();
    const events: BinanceWebSocketEvent[] = [];
    client.subscribe('btcusdt@kline_1s', (event) => events.push(event));
    netInfo.emit(false, false);
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'offline' });
    netInfo.emit(true, true);
    expect(sockets).toHaveLength(2);
  });

  it('does not send a provider-specific application heartbeat', () => {
    const { client, sockets } = setup();
    client.subscribe('btcusdt@kline_1s', () => undefined);
    const socket = sockets[0]!;
    socket.open();
    acknowledgeSubscriptions(socket);
    jest.advanceTimersByTime(120_000);
    expect(
      sentMessages(socket).every((message) => message.method !== 'PING')
    ).toBe(true);
  });
});
