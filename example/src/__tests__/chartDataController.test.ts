import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('react-native-trading-charts', () => ({
  TradingCharts: {
    clear: jest.fn(),
    setHistory: jest.fn(),
    updateCandle: jest.fn(),
    updateTrades: jest.fn(),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn() },
}));

import { type BybitTicker, type BybitTrade } from '../bybit';
import {
  ChartDataController,
  chartIdFor,
  type ChartDataControllerOptions,
} from '../chartDataController';
import {
  type BybitWebSocketEvent,
  type BybitWebSocketListener,
} from '../bybitWebSocket';

const ticker: BybitTicker = {
  symbol: 'BTCUSDT',
  lastPrice: 10,
  lastPriceText: '10',
  change24hPercent: 1,
  turnover24h: 1_000,
  precision: 2,
  minMove: 0.01,
};

const ethTicker: BybitTicker = { ...ticker, symbol: 'ETHUSDT' };
const solTicker: BybitTicker = { ...ticker, symbol: 'SOLUSDT' };

function trade(
  id: string,
  timestamp: number,
  price: number,
  sequence = timestamp
): BybitTrade {
  return {
    id,
    sequence: String(sequence),
    event: { timestamp, price, size: 1 },
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
}

describe('ChartDataController', () => {
  const charts = {
    setHistory: jest.fn(),
    updateCandle: jest.fn(),
    updateTrades: jest.fn(),
    clear: jest.fn(),
  };
  const unsubscribe = jest.fn<(topic: string) => void>();
  const subscribe =
    jest.fn<(topic: string, listener: BybitWebSocketListener) => () => void>();
  const reportProtocolError = jest.fn();
  const fetchTrades =
    jest.fn<NonNullable<ChartDataControllerOptions['fetchTrades']>>();
  const fetchKlines =
    jest.fn<NonNullable<ChartDataControllerOptions['fetchKlines']>>();
  let listenersByTopic: Map<string, Set<BybitWebSocketListener>>;

  function createController(cacheSize = 8) {
    return new ChartDataController({
      cacheSize,
      charts,
      fetchKlines,
      fetchTrades,
      websocketClient: { subscribe, reportProtocolError },
    });
  }

  function emit(event: BybitWebSocketEvent) {
    const listeners =
      event.type === 'state'
        ? new Set(
            [...listenersByTopic.values()].flatMap((topicListeners) => [
              ...topicListeners,
            ])
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
    subscribe.mockImplementation((topic, nextListener) => {
      const listeners = listenersByTopic.get(topic) ?? new Set();
      listeners.add(nextListener);
      listenersByTopic.set(topic, listeners);
      let subscribed = true;
      return () => {
        if (!subscribed) {
          return;
        }
        subscribed = false;
        listeners.delete(nextListener);
        if (listeners.size === 0) {
          listenersByTopic.delete(topic);
        }
        unsubscribe(topic);
      };
    });
  });

  it('loads and applies history before React subscribes or the route activates', async () => {
    const history =
      deferred<
        Awaited<
          ReturnType<NonNullable<ChartDataControllerOptions['fetchKlines']>>
        >
      >();
    fetchKlines.mockReturnValue(history.promise);
    const controller = createController();

    controller.prepare(ticker, '1');
    controller.prepare(ticker, '1');
    expect(fetchKlines).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();

    const statusListener = jest.fn();
    const removeStatusListener = controller.subscribe(
      ticker,
      '1',
      statusListener
    );
    expect(fetchKlines).toHaveBeenCalledTimes(1);

    history.resolve([
      { timestamp: 0, open: 10, high: 12, low: 9, close: 11, volume: 2 },
    ]);
    await history.promise;
    await flushPromises();

    expect(charts.setHistory).toHaveBeenCalledWith(chartIdFor('BTCUSDT', '1'), [
      { timestamp: 0, open: 10, high: 12, low: 9, close: 11, volume: 2 },
    ]);
    expect(controller.getSnapshot(ticker, '1').status).toBe('historical');
    expect(statusListener).toHaveBeenCalled();
    removeStatusListener();
  });

  it('retries a failed history request without recreating the session', async () => {
    fetchKlines
      .mockRejectedValueOnce(new Error('History unavailable'))
      .mockResolvedValueOnce([
        { timestamp: 0, open: 2, high: 3, low: 1, close: 2 },
      ]);
    const controller = createController();

    controller.prepare(ticker, '1');
    await flushPromises();
    expect(controller.getSnapshot(ticker, '1')).toEqual({
      status: 'error',
      error: 'History unavailable',
    });

    controller.retry(ticker, '1');
    await flushPromises();

    expect(fetchKlines).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot(ticker, '1').status).toBe('historical');
    expect(charts.setHistory).toHaveBeenLastCalledWith(
      chartIdFor('BTCUSDT', '1'),
      [{ timestamp: 0, open: 2, high: 3, low: 1, close: 2 }]
    );
  });

  it('keeps initial history loading after the chart route deactivates', async () => {
    const history =
      deferred<
        Awaited<
          ReturnType<NonNullable<ChartDataControllerOptions['fetchKlines']>>
        >
      >();
    fetchKlines.mockReturnValue(history.promise);
    const controller = createController();

    controller.prepare(ticker, '1');
    controller.activate(ticker, '1');
    const signal = fetchKlines.mock.calls[0]?.[2]?.signal;
    controller.deactivate();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);

    history.resolve([{ timestamp: 0, open: 1, high: 1, low: 1, close: 1 }]);
    await history.promise;
    await flushPromises();
    expect(controller.getSnapshot(ticker, '1').status).toBe('historical');
  });

  it('keeps the previous topic until the replacement is live', async () => {
    fetchKlines.mockResolvedValue([
      { timestamp: 0, open: 1, high: 1, low: 1, close: 1 },
    ]);
    const controller = createController();

    controller.activate(ticker, '1');
    await flushPromises();
    emit({ type: 'ready', topic: 'kline.1.BTCUSDT', generation: 1 });
    await flushPromises();
    expect(controller.getSnapshot(ticker, '1').status).toBe('live');

    controller.activate(ticker, '5');
    expect(subscribe).toHaveBeenLastCalledWith(
      'kline.5.BTCUSDT',
      expect.any(Function)
    );
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(listenersByTopic.has('kline.1.BTCUSDT')).toBe(true);
    expect(listenersByTopic.has('kline.5.BTCUSDT')).toBe(true);

    await flushPromises();
    emit({ type: 'ready', topic: 'kline.5.BTCUSDT', generation: 1 });
    await flushPromises();

    expect(controller.getSnapshot(ticker, '5').status).toBe('live');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledWith('kline.1.BTCUSDT');
    expect(listenersByTopic.has('kline.1.BTCUSDT')).toBe(false);
    expect(listenersByTopic.has('kline.5.BTCUSDT')).toBe(true);
  });

  it('does not resubscribe when the active session is activated again', () => {
    fetchKlines.mockReturnValue(new Promise(() => undefined));
    const controller = createController();

    controller.activate(ticker, '1');
    controller.activate(ticker, '1');

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('retires an interrupted handover during rapid interval changes', async () => {
    fetchKlines.mockResolvedValue([
      { timestamp: 0, open: 1, high: 1, low: 1, close: 1 },
    ]);
    const controller = createController();

    controller.activate(ticker, '1');
    await flushPromises();
    emit({ type: 'ready', topic: 'kline.1.BTCUSDT', generation: 1 });
    await flushPromises();

    controller.activate(ticker, '5');
    controller.activate(ticker, '15');

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledWith('kline.1.BTCUSDT');
    expect(listenersByTopic.has('kline.5.BTCUSDT')).toBe(true);
    expect(listenersByTopic.has('kline.15.BTCUSDT')).toBe(true);

    await flushPromises();
    emit({ type: 'ready', topic: 'kline.15.BTCUSDT', generation: 1 });
    await flushPromises();

    expect(controller.getSnapshot(ticker, '15').status).toBe('live');
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenLastCalledWith('kline.5.BTCUSDT');
    expect(listenersByTopic.has('kline.15.BTCUSDT')).toBe(true);
  });

  it('merges buffered trades into the live synchronization snapshot', async () => {
    const initialSnapshot = deferred<BybitTrade[]>();
    const synchronizedSnapshot = deferred<BybitTrade[]>();
    fetchTrades
      .mockReturnValueOnce(initialSnapshot.promise)
      .mockReturnValueOnce(synchronizedSnapshot.promise);
    const controller = createController();

    controller.prepare(ticker, '1s');
    controller.activate(ticker, '1s');
    emit({
      type: 'message',
      topic: 'publicTrade.BTCUSDT',
      generation: 1,
      message: {
        kind: 'market',
        topic: 'publicTrade.BTCUSDT',
        data: [{ i: 'overlap', seq: 2, T: 2_000, p: '22', v: '1' }],
      },
    });
    emit({ type: 'ready', topic: 'publicTrade.BTCUSDT', generation: 1 });
    expect(fetchTrades).toHaveBeenCalledTimes(1);

    initialSnapshot.resolve([trade('history', 1_000, 10)]);
    await initialSnapshot.promise;
    await flushPromises();
    expect(fetchTrades).toHaveBeenCalledTimes(2);

    synchronizedSnapshot.resolve([
      trade('rest-only', 1_000, 10),
      trade('overlap', 2_000, 20),
    ]);
    await synchronizedSnapshot.promise;
    await flushPromises();

    expect(charts.updateTrades).toHaveBeenLastCalledWith(
      chartIdFor('BTCUSDT', '1s'),
      [
        { timestamp: 1_000, price: 10, size: 1 },
        { timestamp: 2_000, price: 22, size: 1 },
      ]
    );
    expect(controller.getSnapshot(ticker, '1s').status).toBe('live');
  });

  it('replays a buffered candle over the REST snapshot', async () => {
    fetchKlines.mockResolvedValue([
      { timestamp: 0, open: 10, high: 12, low: 9, close: 11, volume: 2 },
      {
        timestamp: 60_000,
        open: 11,
        high: 13,
        low: 10,
        close: 12,
        volume: 3,
      },
    ]);
    const controller = createController();
    controller.prepare(ticker, '1');
    controller.activate(ticker, '1');
    await flushPromises();

    emit({
      type: 'message',
      topic: 'kline.1.BTCUSDT',
      generation: 1,
      message: {
        kind: 'market',
        topic: 'kline.1.BTCUSDT',
        data: [
          {
            start: 60_000,
            open: '11',
            high: '14',
            low: '10',
            close: '13',
            volume: '4',
          },
        ],
      },
    });
    emit({ type: 'ready', topic: 'kline.1.BTCUSDT', generation: 1 });
    await flushPromises();

    expect(charts.updateCandle).toHaveBeenCalledWith(
      chartIdFor('BTCUSDT', '1'),
      {
        timestamp: 60_000,
        open: 11,
        high: 14,
        low: 10,
        close: 13,
        volume: 4,
      }
    );
    expect(controller.getSnapshot(ticker, '1').status).toBe('live');
  });

  it('aborts stale live synchronization and applies only the newest generation', async () => {
    const first =
      deferred<
        Awaited<
          ReturnType<NonNullable<ChartDataControllerOptions['fetchKlines']>>
        >
      >();
    const second =
      deferred<
        Awaited<
          ReturnType<NonNullable<ChartDataControllerOptions['fetchKlines']>>
        >
      >();
    fetchKlines
      .mockResolvedValueOnce([
        { timestamp: 0, open: 0, high: 0, low: 0, close: 0 },
      ])
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = createController();
    controller.prepare(ticker, '1');
    controller.activate(ticker, '1');
    await flushPromises();

    emit({ type: 'ready', topic: 'kline.1.BTCUSDT', generation: 1 });
    const firstSignal = fetchKlines.mock.calls[1]?.[2]?.signal;
    emit({ type: 'ready', topic: 'kline.1.BTCUSDT', generation: 2 });
    expect(firstSignal?.aborted).toBe(true);

    first.resolve([{ timestamp: 0, open: 1, high: 1, low: 1, close: 1 }]);
    second.resolve([{ timestamp: 0, open: 2, high: 2, low: 2, close: 2 }]);
    await Promise.all([first.promise, second.promise]);
    await flushPromises();

    expect(charts.setHistory).toHaveBeenLastCalledWith(
      chartIdFor('BTCUSDT', '1'),
      [{ timestamp: 0, open: 2, high: 2, low: 2, close: 2 }]
    );
  });

  it('reuses cached history and evicts only the least-recent inactive session', async () => {
    fetchKlines.mockResolvedValue([
      { timestamp: 0, open: 1, high: 1, low: 1, close: 1 },
    ]);
    const controller = createController(2);

    controller.prepare(ticker, '1');
    await flushPromises();
    controller.prepare(ticker, '1');
    expect(fetchKlines).toHaveBeenCalledTimes(1);

    controller.activate(ticker, '1');
    controller.prepare(ethTicker, '1');
    await flushPromises();
    controller.prepare(solTicker, '1');
    await flushPromises();

    expect(charts.clear).toHaveBeenCalledWith(chartIdFor('ETHUSDT', '1'));
    expect(charts.clear).not.toHaveBeenCalledWith(chartIdFor('BTCUSDT', '1'));
  });

  it('reports an overflowing trade synchronization buffer', () => {
    fetchTrades.mockReturnValue(new Promise(() => undefined));
    const controller = createController();
    controller.prepare(ticker, '1s');
    controller.activate(ticker, '1s');
    const data = Array.from({ length: 50_001 }, (_, index) => ({
      i: `trade-${index}`,
      seq: index,
      T: index,
      p: '1',
      v: '1',
    }));

    emit({
      type: 'message',
      topic: 'publicTrade.BTCUSDT',
      generation: 1,
      message: { kind: 'market', topic: 'publicTrade.BTCUSDT', data },
    });

    expect(reportProtocolError).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        message: 'Trade synchronization buffer exceeded 50,000 records',
      })
    );
  });
});
