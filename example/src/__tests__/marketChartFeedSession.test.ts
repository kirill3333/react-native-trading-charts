import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';
import { type OhlcCandle } from 'react-native-trading-charts';

import { binanceMarketData } from '../api/marketData';
import { type MarketWebSocketEvent } from '../api/marketWebSocket';
import {
  MarketChartFeedSession,
  type ChartDataFeedApi,
  type ChartFeedSnapshot,
  type CandlePages,
} from '../api/MarketChartFeedSession';
import { mergeCandles } from '../api/mergeCandles';

function candle(timestamp: number, close = 10): OhlcCandle {
  return {
    timestamp,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const charts = {
    setHistory: jest.fn<ChartDataFeedApi['setHistory']>(),
    prependHistory: jest.fn<ChartDataFeedApi['prependHistory']>(),
    updateCandle: jest.fn<ChartDataFeedApi['updateCandle']>(),
  };
  const connection = {
    close: jest.fn(),
    retry: jest.fn(),
    reportProtocolError: jest.fn(),
  };
  let listener: ((event: MarketWebSocketEvent<OhlcCandle>) => void) | null =
    null;
  const connect = jest.fn(
    (
      _topic: string,
      next: (event: MarketWebSocketEvent<OhlcCandle>) => void
    ) => {
      listener = next;
      return connection;
    }
  );
  const fetchCandles = jest
    .fn<typeof binanceMarketData.fetchCandles>()
    .mockResolvedValue([candle(100)]);
  const publish = jest.fn<(snapshot: ChartFeedSnapshot) => void>();
  const session = new MarketChartFeedSession({
    adapter: {
      ...binanceMarketData,
      fetchCandles,
      parseMarketMessage: (message: OhlcCandle) => [message],
      websocket: { connect },
    },
    queryClient,
    chartId: 'chart',
    symbol: 'BTCUSDT',
    interval: '1m',
    lastPrice: 9,
    charts,
    publish,
  });
  const key = binanceMarketData.candlesQueryKey('BTCUSDT', '1m');
  cleanups.push(() => {
    session.dispose();
    queryClient.clear();
  });
  return {
    session,
    queryClient,
    key,
    charts,
    connection,
    connect,
    fetchCandles,
    publish,
    emit: (event: MarketWebSocketEvent<OhlcCandle>) => listener?.(event),
    ready: (generation = 1) =>
      listener?.({ type: 'ready', topic: 'topic', generation }),
    message: (value: OhlcCandle, generation = 1) =>
      listener?.({
        type: 'message',
        topic: 'topic',
        generation,
        message: value,
      }),
  };
}
async function flush() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('market chart feed sessions', () => {
  it('starts once and ignores all work after disposal', () => {
    const h = harness();
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.fetchCandles).not.toHaveBeenCalled();
    h.session.start();
    h.session.start();
    expect(h.connect).toHaveBeenCalledTimes(1);
    h.session.dispose();
    h.session.dispose();
    h.ready();
    h.message(candle(200));
    h.session.applyHistory([[candle(100)]]);
    h.session.retry();
    expect(h.connection.close).toHaveBeenCalledTimes(1);
    expect(h.charts.setHistory).not.toHaveBeenCalled();
    expect(h.fetchCandles).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });
  it('deduplicates and sorts buffered candles after the fresh REST snapshot', async () => {
    const h = harness();
    const request = deferred<OhlcCandle[]>();
    h.fetchCandles.mockReturnValueOnce(request.promise);
    h.session.start();
    h.ready();
    h.message(candle(102, 12));
    h.message(candle(99));
    h.message(candle(101, 11));
    h.message(candle(102, 13));
    expect(h.charts.updateCandle).not.toHaveBeenCalled();
    request.resolve([candle(100)]);
    await flush();
    expect(h.charts.updateCandle.mock.calls).toEqual([
      ['chart', candle(101, 11)],
      ['chart', candle(102, 13)],
    ]);
    expect(h.charts.setHistory.mock.invocationCallOrder[0]).toBeLessThan(
      h.charts.updateCandle.mock.invocationCallOrder[0]!
    );
    expect(h.publish).toHaveBeenLastCalledWith({
      status: 'live',
      error: null,
      lastPrice: 13,
      allTimeExtremes: { low: 9, high: 14 },
    });
  });
  it('bounds the synchronization buffer to the newest 1000 timestamps', async () => {
    const h = harness();
    const request = deferred<OhlcCandle[]>();
    h.fetchCandles.mockReturnValueOnce(request.promise);
    h.session.start();
    h.ready();
    for (let i = 0; i < 1005; i += 1) h.message(candle(101 + i));
    request.resolve([candle(100)]);
    await flush();
    expect(h.charts.updateCandle).toHaveBeenCalledTimes(1000);
    expect(h.charts.updateCandle.mock.calls[0]).toEqual(['chart', candle(106)]);
  });
  it.each(['paused', 'offline'] as const)(
    'invalidates pending resync on %s and resumes with a new generation',
    async (state) => {
      const h = harness();
      const request = deferred<OhlcCandle[]>();
      h.fetchCandles.mockReturnValueOnce(request.promise);
      h.session.start();
      h.ready();
      h.message(candle(110));
      h.emit({ type: 'state', state, error: null });
      request.resolve([candle(100)]);
      await flush();
      expect(h.charts.setHistory).not.toHaveBeenCalled();
      expect(h.publish.mock.lastCall?.[0].status).toBe(state);
      h.ready(2);
      await flush();
      expect(h.charts.setHistory).toHaveBeenCalledTimes(1);
      expect(h.charts.updateCandle).not.toHaveBeenCalled();
      expect(h.publish.mock.lastCall?.[0].status).toBe('live');
    }
  );
  it('reconnects with a new buffer while retaining older pages loaded during resync', async () => {
    const h = harness();
    h.queryClient.setQueryData<CandlePages>(h.key, {
      pages: [[candle(100)]],
      pageParams: [undefined],
    });
    h.session.applyHistory([[candle(100)]]);
    h.session.start();
    h.ready();
    await flush();
    const request = deferred<OhlcCandle[]>();
    h.fetchCandles.mockReturnValueOnce(request.promise);
    h.emit({ type: 'state', state: 'reconnecting', error: 'closed' });
    h.ready(2);
    expect(h.publish.mock.lastCall?.[0].status).toBe('reconnecting');
    const pages = [[candle(100)], [candle(50)]];
    h.queryClient.setQueryData<CandlePages>(h.key, {
      pages,
      pageParams: [undefined, 100],
    });
    h.session.applyHistory(pages);
    h.message(candle(102, 15), 2);
    request.resolve([candle(100, 11), candle(101, 12)]);
    await flush();
    expect(h.charts.prependHistory).toHaveBeenCalledWith('chart', [candle(50)]);
    expect(h.charts.setHistory).toHaveBeenLastCalledWith('chart', [
      candle(50),
      candle(100, 11),
      candle(101, 12),
    ]);
    expect(h.queryClient.getQueryData<CandlePages>(h.key)?.pages[1]).toEqual([
      candle(50),
    ]);
    h.session.applyHistory(
      h.queryClient.getQueryData<CandlePages>(h.key)?.pages
    );
    expect(h.charts.prependHistory).toHaveBeenCalledTimes(1);
    expect(h.publish.mock.lastCall?.[0].lastPrice).toBe(15);
  });
  it('does not write to the cache or chart when a disposed REST request completes', async () => {
    const h = harness();
    const request = deferred<OhlcCandle[]>();
    h.fetchCandles.mockReturnValueOnce(request.promise);
    h.session.start();
    h.ready();
    h.session.dispose();
    h.publish.mockClear();
    request.resolve([candle(100)]);
    await flush();
    expect(h.charts.setHistory).not.toHaveBeenCalled();
    expect(h.queryClient.getQueryData(h.key)).toBeUndefined();
    expect(h.publish).not.toHaveBeenCalled();
  });
  it('reports errors and resets them on explicit retry', async () => {
    const h = harness();
    h.fetchCandles.mockRejectedValueOnce(new Error('network failed'));
    h.session.start();
    h.ready();
    await flush();
    expect(h.publish.mock.lastCall?.[0]).toMatchObject({
      status: 'error',
      error: 'network failed',
    });
    h.session.retry();
    expect(h.connection.retry).toHaveBeenCalledTimes(1);
    expect(h.publish.mock.lastCall?.[0]).toMatchObject({
      status: 'loading',
      error: null,
    });
    h.ready(2);
    await flush();
    expect(h.publish.mock.lastCall?.[0].status).toBe('live');
  });
  it('merges history in timestamp order, keeping later-page duplicates and the newest limit', () => {
    expect(
      mergeCandles(
        [
          [candle(3), candle(1)],
          [candle(2), candle(3, 20)],
        ],
        2
      )
    ).toEqual([candle(2), candle(3, 20)]);
  });
});
