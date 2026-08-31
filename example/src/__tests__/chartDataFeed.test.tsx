import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { type OhlcCandle } from 'react-native-trading-charts';

import { type MarketDataAdapter } from '../api/marketData';
import {
  createMarketWebSocketFactory,
  type MarketWebSocketProtocol,
} from '../api/marketWebSocket';
import {
  useChartDataFeed,
  type ChartDataFeedApi,
} from '../api/useChartDataFeed';

const mockCharts = {
  setHistory: jest.fn<ChartDataFeedApi['setHistory']>(),
  prependHistory: jest.fn<ChartDataFeedApi['prependHistory']>(),
  updateCandle: jest.fn<ChartDataFeedApi['updateCandle']>(),
} satisfies ChartDataFeedApi;

type TestTicker = { symbol: string; lastPrice: number };
type TestMessage = { candle: OhlcCandle };
type FeedResult = ReturnType<
  typeof useChartDataFeed<TestTicker, '1m', TestMessage>
>;

const initialCandle: OhlcCandle = {
  timestamp: 1_000,
  open: 10,
  high: 12,
  low: 9,
  close: 11,
  volume: 2,
};
const olderCandle: OhlcCandle = {
  timestamp: 0,
  open: 9,
  high: 11,
  low: 8,
  close: 10,
  volume: 1,
};

const protocol: MarketWebSocketProtocol<TestMessage> = {
  label: 'Test',
  url: () => 'wss://example.test',
  parse: () => ({ kind: 'control' }),
};

function createAdapter(
  fetchCandles: MarketDataAdapter<
    TestTicker,
    '1m',
    TestMessage
  >['fetchCandles'],
  websocket = createMarketWebSocketFactory(protocol, {
    isFocused: () => false,
    isOnline: () => true,
    subscribeFocused: () => () => undefined,
    subscribeOnline: () => () => undefined,
  })
): MarketDataAdapter<TestTicker, '1m', TestMessage> {
  return {
    provider: 'binance',
    maxCandles: 20_000,
    websocket,
    chartIdFor: (symbol, interval) => `${symbol}:${interval}`,
    topicFor: (symbol, interval) => `${symbol}:${interval}`,
    parseMarketMessage: (message) => [message.candle],
    isNoDataError: () => false,
    fetchTickers: () => Promise.resolve([]),
    fetchCandles,
    tickersQueryKey: ['market-data', 'binance', 'tickers'],
    candlesQueryKey: (symbol, interval) => [
      'market-data',
      'binance',
      'candles',
      symbol,
      interval,
    ],
    snapshotQueryKey: (symbol, interval) => [
      'market-data',
      'binance',
      'snapshot',
      symbol,
      interval,
    ],
  };
}

class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;

  send() {}

  close() {
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  message(data: 'ack' | 'market') {
    this.onmessage?.({ data });
  }
}

async function flushQueries(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('useChartDataFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notifyManager.setNotifyFunction((callback) => {
      act(callback);
    });
  });

  it('loads, prepends, stops empty pagination and restores cached history', async () => {
    const fetchCandles =
      jest.fn<
        MarketDataAdapter<TestTicker, '1m', TestMessage>['fetchCandles']
      >();
    fetchCandles
      .mockResolvedValueOnce([initialCandle])
      .mockResolvedValueOnce([olderCandle])
      .mockResolvedValueOnce([]);
    const adapter = createAdapter(fetchCandles);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Infinity, networkMode: 'always', retry: false },
      },
    });
    let feed: FeedResult | null = null;

    function Harness() {
      feed = useChartDataFeed(
        adapter,
        { symbol: 'BTCUSDT', lastPrice: 10 },
        '1m',
        'chart',
        mockCharts
      );
      return null;
    }

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>
      );
      await Promise.resolve();
    });
    await act(async () => {
      await flushQueries();
    });
    expect(mockCharts.setHistory).toHaveBeenCalledWith('chart', [
      initialCandle,
    ]);
    expect(feed!.allTimeExtremes).toEqual({ high: 12, low: 9 });

    await act(async () => {
      feed!.loadOlder();
      await flushQueries();
    });
    expect(mockCharts.prependHistory).toHaveBeenCalledWith('chart', [
      olderCandle,
    ]);
    expect(feed!.allTimeExtremes).toEqual({ high: 12, low: 8 });

    await act(async () => {
      feed!.loadOlder();
      await flushQueries();
    });
    await act(async () => {
      feed!.loadOlder();
      await flushQueries();
    });
    expect(fetchCandles).toHaveBeenCalledTimes(3);

    act(() => renderer!.unmount());
    mockCharts.setHistory.mockClear();
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>
      );
      await Promise.resolve();
    });
    await act(async () => {
      await flushQueries();
    });
    expect(mockCharts.setHistory).toHaveBeenCalledWith('chart', [
      olderCandle,
      initialCandle,
    ]);
    expect(fetchCandles).toHaveBeenCalledTimes(3);
    act(() => renderer!.unmount());
    queryClient.clear();
  });

  it('buffers live candles until the acknowledged REST resync completes', async () => {
    const liveCandle: OhlcCandle = {
      timestamp: 2_000,
      open: 11,
      high: 13,
      low: 10,
      close: 12,
      volume: 3,
    };
    const liveProtocol: MarketWebSocketProtocol<TestMessage> = {
      label: 'Test',
      url: () => 'wss://example.test',
      parse: (message) =>
        message === 'ack'
          ? { kind: 'ready', topic: 'BTCUSDT:1m' }
          : {
              kind: 'market',
              topic: 'BTCUSDT:1m',
              message: { candle: liveCandle },
            },
      subscribe: () => 'subscribe',
    };
    const sockets: FakeSocket[] = [];
    const websocket = createMarketWebSocketFactory(liveProtocol, {
      isFocused: () => true,
      isOnline: () => true,
      subscribeFocused: () => () => undefined,
      subscribeOnline: () => () => undefined,
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const fetchCandles = jest
      .fn<MarketDataAdapter<TestTicker, '1m', TestMessage>['fetchCandles']>()
      .mockResolvedValue([initialCandle]);
    const adapter = createAdapter(fetchCandles, websocket);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Infinity, networkMode: 'always', retry: false },
      },
    });
    let feed: FeedResult | null = null;

    function Harness() {
      feed = useChartDataFeed(
        adapter,
        { symbol: 'BTCUSDT', lastPrice: 10 },
        '1m',
        'chart',
        mockCharts
      );
      return <></>;
    }

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>
      );
      await Promise.resolve();
    });
    await act(async () => {
      await flushQueries();
      sockets[0]!.open();
      sockets[0]!.message('market');
      sockets[0]!.message('ack');
      await flushQueries();
    });

    expect(fetchCandles).toHaveBeenCalledTimes(2);
    expect(mockCharts.setHistory).toHaveBeenLastCalledWith('chart', [
      initialCandle,
    ]);
    expect(mockCharts.updateCandle).toHaveBeenCalledWith('chart', liveCandle);
    expect(feed).toMatchObject({
      status: 'live',
      lastPrice: 12,
      error: null,
      allTimeExtremes: { high: 13, low: 9 },
    });

    act(() => renderer!.unmount());
    queryClient.clear();
  });

  it('clears extremes immediately when the market session changes', async () => {
    const nextCandle: OhlcCandle = {
      timestamp: 2_000,
      open: 20,
      high: 24,
      low: 18,
      close: 22,
      volume: 4,
    };
    let resolveNextHistory!: (candles: OhlcCandle[]) => void;
    const nextHistory = new Promise<OhlcCandle[]>((resolve) => {
      resolveNextHistory = resolve;
    });
    const fetchCandles = jest
      .fn<MarketDataAdapter<TestTicker, '1m', TestMessage>['fetchCandles']>()
      .mockResolvedValueOnce([initialCandle])
      .mockReturnValueOnce(nextHistory);
    const adapter = createAdapter(fetchCandles);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Infinity, networkMode: 'always', retry: false },
      },
    });
    let symbol = 'BTCUSDT';
    let feed: FeedResult | null = null;

    function Harness() {
      feed = useChartDataFeed(
        adapter,
        { symbol, lastPrice: symbol === 'BTCUSDT' ? 10 : 20 },
        '1m',
        `${symbol}:1m`,
        mockCharts
      );
      return null;
    }

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>
      );
      await Promise.resolve();
    });
    await act(async () => {
      await flushQueries();
    });
    expect(feed!.allTimeExtremes).toEqual({ high: 12, low: 9 });

    symbol = 'ETHUSDT';
    await act(async () => {
      renderer.update(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>
      );
      await Promise.resolve();
    });
    expect(feed!.allTimeExtremes).toBeNull();

    await act(async () => {
      resolveNextHistory([nextCandle]);
      await flushQueries();
    });
    expect(feed!.allTimeExtremes).toEqual({ high: 24, low: 18 });

    act(() => renderer.unmount());
    queryClient.clear();
  });
});
