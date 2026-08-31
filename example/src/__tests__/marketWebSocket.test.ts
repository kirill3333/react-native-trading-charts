import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import { type BinanceWebSocketPayload } from '../api/binance';
import { type HyperliquidWebSocketPayload } from '../api/hyperliquid';
import { binanceProtocol, hyperliquidProtocol } from '../api/marketData';
import {
  MarketWebSocketClient,
  type MarketWebSocketEvent,
  type MarketWebSocketProtocol,
} from '../api/marketWebSocket';

type TestWebSocketPayload =
  BinanceWebSocketPayload | HyperliquidWebSocketPayload;
type ClientMessage = {
  id?: string;
  method?: string;
  params?: string[];
  subscription?: { coin?: string; interval?: string; type?: string };
};

class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
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

  message(payload: TestWebSocketPayload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  error() {
    this.onerror?.();
  }
}

class FakeLifecycle {
  focused = true;
  online = true;
  private readonly focusListeners = new Set<() => void>();
  private readonly onlineListeners = new Set<() => void>();

  options() {
    return {
      isFocused: () => this.focused,
      isOnline: () => this.online,
      subscribeFocused: (listener: () => void) => {
        this.focusListeners.add(listener);
        return () => this.focusListeners.delete(listener);
      },
      subscribeOnline: (listener: () => void) => {
        this.onlineListeners.add(listener);
        return () => this.onlineListeners.delete(listener);
      },
    };
  }

  setFocused(value: boolean) {
    this.focused = value;
    this.focusListeners.forEach((listener) => listener());
  }

  setOnline(value: boolean) {
    this.online = value;
    this.onlineListeners.forEach((listener) => listener());
  }
}

function setup<TMessage>(protocol: MarketWebSocketProtocol<TMessage>) {
  const sockets: FakeSocket[] = [];
  const lifecycle = new FakeLifecycle();
  const client = new MarketWebSocketClient(protocol, {
    ...lifecycle.options(),
    random: () => 0,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  return { client, lifecycle, sockets };
}

function sentMessages(socket: FakeSocket): ClientMessage[] {
  return socket.sent.map((message) => JSON.parse(message));
}

describe('MarketWebSocketClient', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses Binance request ids to acknowledge and route subscriptions', () => {
    const { client, sockets } = setup(binanceProtocol);
    const events: Array<MarketWebSocketEvent<unknown>> = [];
    client.subscribe('btcusdt@kline_1s', (event) => events.push(event));
    const socket = sockets[0]!;
    socket.open();
    const request = sentMessages(socket)[0]!;
    expect(request).toMatchObject({
      method: 'SUBSCRIBE',
      params: ['btcusdt@kline_1s'],
    });
    if (request.id == null) {
      throw new Error('Expected a Binance subscription request id');
    }
    socket.message({ result: null, id: request.id });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'ready',
        topic: 'btcusdt@kline_1s',
        generation: 1,
      })
    );

    socket.message({
      e: 'kline',
      s: 'BTCUSDT',
      k: { t: 1, i: '1s', o: '1', h: '1', l: '1', c: '1', v: '1' },
    });
    expect(events.at(-1)).toMatchObject({
      type: 'message',
      topic: 'btcusdt@kline_1s',
    });
  });

  it('uses Hyperliquid topics as subscription acknowledgements', () => {
    const { client, sockets } = setup(hyperliquidProtocol);
    const events: Array<MarketWebSocketEvent<unknown>> = [];
    client.subscribe('candle:xyz:MEME:1m', (event) => events.push(event));
    const socket = sockets[0]!;
    socket.open();
    expect(sentMessages(socket)[0]).toMatchObject({
      method: 'subscribe',
      subscription: { coin: 'xyz:MEME', interval: '1m', type: 'candle' },
    });
    socket.message({
      channel: 'subscriptionResponse',
      data: {
        method: 'subscribe',
        subscription: { coin: 'xyz:MEME', interval: '1m', type: 'candle' },
      },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'ready',
        topic: 'candle:xyz:MEME:1m',
      })
    );
  });

  it('reconnects, resubscribes, pauses and waits offline', () => {
    const { client, lifecycle, sockets } = setup(binanceProtocol);
    const events: Array<MarketWebSocketEvent<unknown>> = [];
    client.subscribe('btcusdt@kline_1s', (event) => events.push(event));
    sockets[0]!.open();
    sockets[0]!.error();
    jest.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(sentMessages(sockets[1]!)[0]).toMatchObject({
      method: 'SUBSCRIBE',
      params: ['btcusdt@kline_1s'],
    });

    lifecycle.setFocused(false);
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'paused' });
    lifecycle.setFocused(true);
    expect(sockets).toHaveLength(3);
    lifecycle.setOnline(false);
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'offline' });
    lifecycle.setOnline(true);
    expect(sockets).toHaveLength(4);
  });
});
