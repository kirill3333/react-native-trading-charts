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

import { hyperliquidCandleTopic } from '../hyperliquid';
import {
  HyperliquidWebSocketClient,
  type HyperliquidWebSocketEvent,
} from '../hyperliquidWebSocket';

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

  addEventListener(
    _event: 'change',
    listener: (state: AppStateStatus) => void
  ) {
    void listener;
    return { remove: () => undefined };
  }
}

class FakeNetInfo {
  addEventListener(listener: (state: NetInfoState) => void) {
    void listener;
    return () => undefined;
  }
}

function sentMessages(socket: FakeSocket) {
  return socket.sent.map(
    (message) => JSON.parse(message) as Record<string, unknown>
  );
}

describe('HyperliquidWebSocketClient', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function setup() {
    const sockets: FakeSocket[] = [];
    const client = new HyperliquidWebSocketClient({
      appState: new FakeAppState(),
      netInfo: new FakeNetInfo(),
      random: () => 0,
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    return { client, sockets };
  }

  it('subscribes, acknowledges and routes candle updates', () => {
    const { client, sockets } = setup();
    const events: HyperliquidWebSocketEvent[] = [];
    const topic = hyperliquidCandleTopic('xyz:MEME', '1m');
    const unsubscribe = client.subscribe(topic, (event) => events.push(event));
    const socket = sockets[0]!;

    socket.open();
    expect(sentMessages(socket)).toEqual([
      {
        method: 'subscribe',
        subscription: { type: 'candle', coin: 'xyz:MEME', interval: '1m' },
      },
    ]);
    socket.message({
      channel: 'subscriptionResponse',
      data: {
        method: 'subscribe',
        subscription: { type: 'candle', coin: 'xyz:MEME', interval: '1m' },
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ready', topic, generation: 1 }),
      ])
    );

    socket.message({
      channel: 'candle',
      data: {
        t: 1_000,
        T: 1_999,
        s: 'xyz:MEME',
        i: '1m',
        o: '1',
        h: '2',
        l: '1',
        c: '2',
        v: '3',
        n: 1,
      },
    });
    expect(events.at(-1)).toMatchObject({
      type: 'message',
      topic,
      generation: 1,
    });

    unsubscribe();
    expect(sentMessages(socket).at(-1)).toEqual({
      method: 'unsubscribe',
      subscription: { type: 'candle', coin: 'xyz:MEME', interval: '1m' },
    });
    expect(socket.readyState).toBe(3);
  });

  it('reconnects and resubscribes after a socket error', () => {
    const { client, sockets } = setup();
    client.subscribe(hyperliquidCandleTopic('SOL', '1m'), () => undefined);
    sockets[0]!.open();
    sockets[0]!.error();
    jest.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(sentMessages(sockets[1]!)).toEqual([
      expect.objectContaining({
        method: 'subscribe',
        subscription: { type: 'candle', coin: 'SOL', interval: '1m' },
      }),
    ]);
  });
});
