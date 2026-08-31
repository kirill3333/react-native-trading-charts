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
  createMarketWebSocketFactory,
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

function setup<TMessage>(
  protocol: MarketWebSocketProtocol<TMessage>,
  topic: string
) {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const events: Array<MarketWebSocketEvent<TMessage>> = [];
  const lifecycle = new FakeLifecycle();
  const websocket = createMarketWebSocketFactory(protocol, {
    ...lifecycle.options(),
    random: () => 0,
    createSocket: (url) => {
      urls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  const connection = websocket.connect(topic, (event) => events.push(event));
  return { connection, events, lifecycle, sockets, urls };
}

function sentMessages(socket: FakeSocket): ClientMessage[] {
  return socket.sent.map((message) => JSON.parse(message));
}

describe('single-topic market WebSocket', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens a raw Binance stream and routes its candles', () => {
    const { connection, events, sockets, urls } = setup(
      binanceProtocol,
      'btcusdt@kline_1s'
    );
    expect(urls).toEqual(['wss://stream.binance.com:9443/ws/btcusdt@kline_1s']);
    const socket = sockets[0]!;
    socket.open();
    expect(socket.sent).toEqual([]);
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
    connection.close();
  });

  it('acknowledges Hyperliquid subscriptions and sends heartbeats', () => {
    const { connection, events, sockets } = setup(
      hyperliquidProtocol,
      'candle:xyz:MEME:1m'
    );
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
    socket.message({
      channel: 'subscriptionResponse',
      data: {
        method: 'subscribe',
        subscription: { coin: 'xyz:MEME', interval: '1m', type: 'candle' },
      },
    });
    expect(events.filter((event) => event.type === 'ready')).toHaveLength(1);
    jest.advanceTimersByTime(45_000);
    expect(sentMessages(socket).at(-1)).toEqual({ method: 'ping' });
    connection.close();
  });

  it('rejects unsupported Hyperliquid intervals in subscription topics', () => {
    expect(() => hyperliquidProtocol.subscribe?.('candle:BTC:2m')).toThrow(
      'Invalid Hyperliquid candle interval: 2m'
    );
  });

  it('reconnects, pauses and waits offline', () => {
    const { connection, events, lifecycle, sockets } = setup(
      binanceProtocol,
      'btcusdt@kline_1s'
    );
    sockets[0]!.open();
    sockets[0]!.error();
    jest.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(sockets[1]!.sent).toEqual([]);

    lifecycle.setFocused(false);
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'paused' });
    lifecycle.setFocused(true);
    expect(sockets).toHaveLength(3);
    lifecycle.setOnline(false);
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'offline' });
    lifecycle.setOnline(true);
    expect(sockets).toHaveLength(4);
    connection.close();
  });
});
