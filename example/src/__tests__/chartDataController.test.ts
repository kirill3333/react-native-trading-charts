import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('react-native-trading-charts', () => ({
  TradingCharts: {
    clear: jest.fn(),
    prependHistory: jest.fn(),
    setHistory: jest.fn(),
    updateCandle: jest.fn(),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn() },
}));

import { type BinanceMarketMessage, type BinanceTicker } from '../binance';
import {
  ChartDataController,
  chartIdFor,
  type ChartDataControllerOptions,
} from '../chartDataController';
import {
  type BinanceWebSocketEvent,
  type BinanceWebSocketListener,
} from '../binanceWebSocket';

const ticker: BinanceTicker = {
  symbol: 'BTCUSDT',
  lastPrice: 10,
  lastPriceText: '10',
  change24hPercent: 1,
  turnover24h: 1_000,
  precision: 2,
  minMove: 0.01,
};
const ethTicker: BinanceTicker = { ...ticker, symbol: 'ETHUSDT' };

const firstCandle = {
  timestamp: 1_000,
  open: 10,
  high: 12,
  low: 9,
  close: 11,
  volume: 2,
};
const secondCandle = {
  timestamp: 2_000,
  open: 11,
  high: 13,
  low: 10,
  close: 12,
  volume: 3,
};

function marketMessage(
  symbol: string,
  interval: '1s' | '1m',
  candle = secondCandle
): BinanceMarketMessage {
  return {
    kind: 'market',
    topic: `${symbol.toLowerCase()}@kline_${interval}`,
    data: {
      e: 'kline',
      s: symbol,
      k: {
        t: candle.timestamp,
        i: interval,
        o: String(candle.open),
        h: String(candle.high),
        l: String(candle.low),
        c: String(candle.close),
        v: String(candle.volume),
      },
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('ChartDataController with Binance native klines', () => {
  const charts = {
    setHistory: jest.fn(),
    prependHistory: jest.fn(),
    updateCandle: jest.fn(),
    clear: jest.fn(),
  };
  const subscribe =
    jest.fn<
      (topic: string, listener: BinanceWebSocketListener) => () => void
    >();
  const unsubscribe = jest.fn<(topic: string) => void>();
  const reportProtocolError = jest.fn();
  const fetchKlines =
    jest.fn<NonNullable<ChartDataControllerOptions['fetchKlines']>>();
  let listenersByTopic: Map<string, Set<BinanceWebSocketListener>>;

  function createController(cacheSize = 8) {
    return new ChartDataController({
      cacheSize,
      charts,
      fetchKlines,
      websocketClient: { subscribe, reportProtocolError },
    });
  }

  function emit(event: BinanceWebSocketEvent) {
    const listeners =
      event.type === 'state'
        ? new Set(
            [...listenersByTopic.values()].flatMap((values) => [...values])
          )
        : listenersByTopic.get(event.topic);
    if (listeners == null || listeners.size === 0) {
      throw new Error('WebSocket listener is not registered');
    }
    listeners.forEach((listener) => listener(event));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    listenersByTopic = new Map();
    subscribe.mockImplementation((topic, listener) => {
      const listeners = listenersByTopic.get(topic) ?? new Set();
      listeners.add(listener);
      listenersByTopic.set(topic, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByTopic.delete(topic);
        }
        unsubscribe(topic);
      };
    });
  });

  it('loads native 1s history directly instead of trades or 5m candles', async () => {
    fetchKlines.mockResolvedValue([firstCandle]);
    const controller = createController();
    expect(controller.prepare(ticker, '1s')).toBe('binance-spot-BTCUSDT-1s');
    await flushPromises();
    expect(fetchKlines).toHaveBeenCalledWith(
      'BTCUSDT',
      '1s',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(charts.setHistory).toHaveBeenCalledWith(
      chartIdFor('BTCUSDT', '1s'),
      [firstCandle]
    );
  });

  it('uses the Binance kline stream for the 1s interval', async () => {
    fetchKlines.mockResolvedValue([firstCandle]);
    const controller = createController();
    controller.activate(ticker, '1s');
    await flushPromises();
    expect(subscribe).toHaveBeenCalledWith(
      'btcusdt@kline_1s',
      expect.any(Function)
    );
  });

  it('buffers websocket candles until REST synchronization closes the gap', async () => {
    const initial = deferred<(typeof firstCandle)[]>();
    fetchKlines
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce([firstCandle]);
    const controller = createController();
    controller.activate(ticker, '1s');

    emit({
      type: 'message',
      topic: 'btcusdt@kline_1s',
      generation: 1,
      message: marketMessage('BTCUSDT', '1s'),
    });
    emit({ type: 'ready', topic: 'btcusdt@kline_1s', generation: 1 });
    expect(charts.updateCandle).not.toHaveBeenCalled();

    initial.resolve([firstCandle]);
    await flushPromises();
    expect(fetchKlines).toHaveBeenNthCalledWith(
      2,
      'BTCUSDT',
      '1s',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(charts.updateCandle).toHaveBeenCalledWith(
      chartIdFor('BTCUSDT', '1s'),
      secondCandle
    );
    expect(controller.getSnapshot(ticker, '1s').status).toBe('live');
  });

  it('applies live updates through updateCandle after synchronization', async () => {
    fetchKlines.mockResolvedValue([firstCandle]);
    const controller = createController();
    controller.activate(ticker, '1s');
    await flushPromises();
    emit({ type: 'ready', topic: 'btcusdt@kline_1s', generation: 1 });
    await flushPromises();
    charts.updateCandle.mockClear();
    emit({
      type: 'message',
      topic: 'btcusdt@kline_1s',
      generation: 1,
      message: marketMessage('BTCUSDT', '1s'),
    });
    expect(charts.updateCandle).toHaveBeenCalledWith(
      chartIdFor('BTCUSDT', '1s'),
      secondCandle
    );
  });

  it('loads and prepends a page before the oldest cached candle', async () => {
    const olderCandle = {
      timestamp: 0,
      open: 9,
      high: 11,
      low: 8,
      close: 10,
      volume: 1,
    };
    fetchKlines
      .mockResolvedValueOnce([firstCandle])
      .mockResolvedValueOnce([olderCandle]);
    const controller = createController();
    controller.activate(ticker, '1s');
    await flushPromises();

    controller.loadOlder(ticker, '1s');
    await flushPromises();

    expect(fetchKlines).toHaveBeenNthCalledWith(
      2,
      'BTCUSDT',
      '1s',
      expect.objectContaining({
        beforeTimestamp: firstCandle.timestamp,
        allowEmpty: true,
        signal: expect.any(AbortSignal),
      })
    );
    expect(charts.prependHistory).toHaveBeenCalledWith(
      chartIdFor('BTCUSDT', '1s'),
      [olderCandle]
    );
  });

  it('stops pagination when the provider returns no older candles', async () => {
    fetchKlines.mockResolvedValueOnce([firstCandle]).mockResolvedValueOnce([]);
    const controller = createController();
    controller.activate(ticker, '1s');
    await flushPromises();

    controller.loadOlder(ticker, '1s');
    await flushPromises();
    controller.loadOlder(ticker, '1s');
    await flushPromises();

    expect(fetchKlines).toHaveBeenCalledTimes(2);
    expect(charts.prependHistory).not.toHaveBeenCalled();
  });

  it('refetches the same native interval after reconnect', async () => {
    fetchKlines.mockResolvedValue([firstCandle]);
    const controller = createController();
    controller.activate(ticker, '1s');
    await flushPromises();
    emit({ type: 'ready', topic: 'btcusdt@kline_1s', generation: 1 });
    await flushPromises();
    emit({
      type: 'state',
      state: 'reconnecting',
      error: 'socket closed',
    });
    emit({ type: 'ready', topic: 'btcusdt@kline_1s', generation: 2 });
    await flushPromises();
    expect(fetchKlines.mock.calls.every((call) => call[1] === '1s')).toBe(true);
    expect(controller.getSnapshot(ticker, '1s').status).toBe('live');
  });

  it('replays cached native candles when a session is activated again', async () => {
    fetchKlines.mockResolvedValue([firstCandle]);
    const controller = createController();
    controller.activate(ticker, '1s');
    await flushPromises();
    emit({ type: 'ready', topic: 'btcusdt@kline_1s', generation: 1 });
    await flushPromises();
    emit({
      type: 'message',
      topic: 'btcusdt@kline_1s',
      generation: 1,
      message: marketMessage('BTCUSDT', '1s'),
    });
    controller.deactivate();
    charts.setHistory.mockClear();
    controller.activate(ticker, '1s');
    expect(charts.setHistory).toHaveBeenCalledWith(
      chartIdFor('BTCUSDT', '1s'),
      [firstCandle, secondCandle]
    );
  });

  it('keeps the previous topic alive until an interval handover settles', async () => {
    fetchKlines.mockResolvedValue([firstCandle]);
    const controller = createController();
    controller.activate(ticker, '1s');
    await flushPromises();
    emit({ type: 'ready', topic: 'btcusdt@kline_1s', generation: 1 });
    await flushPromises();
    controller.activate(ticker, '1m');
    await flushPromises();
    expect(listenersByTopic.has('btcusdt@kline_1s')).toBe(true);
    emit({ type: 'ready', topic: 'btcusdt@kline_1m', generation: 1 });
    await flushPromises();
    expect(listenersByTopic.has('btcusdt@kline_1s')).toBe(false);
  });

  it('evicts inactive cached sessions without clearing the active chart', async () => {
    fetchKlines.mockResolvedValue([firstCandle]);
    const controller = createController(1);
    controller.prepare(ticker, '1s');
    await flushPromises();
    controller.prepare(ethTicker, '1m');
    await flushPromises();
    expect(charts.clear).toHaveBeenCalledWith(chartIdFor('BTCUSDT', '1s'));
    expect(charts.clear).not.toHaveBeenCalledWith(chartIdFor('ETHUSDT', '1m'));
  });
});
