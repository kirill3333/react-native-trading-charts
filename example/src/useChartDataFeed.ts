import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TradingCharts, type OhlcCandle } from 'react-native-trading-charts';

import {
  calculateAllTimeExtremes,
  extendAllTimeExtremes,
  type AllTimeExtremes,
} from './allTimeExtremes';
import { type MarketDataAdapter } from './marketData';
import { type MarketWebSocketEvent } from './marketWebSocket';

export type ChartConnectionStatus =
  | 'loading'
  | 'historical'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'error'
  | 'no-data'
  | 'paused'
  | 'offline';

export type ChartDataFeedApi = Pick<
  typeof TradingCharts,
  'prependHistory' | 'setHistory' | 'updateCandle'
>;

type ChartConnectionSnapshot = {
  status: ChartConnectionStatus;
  error: string | null;
  lastPrice: number | null;
};

type CandlePages = InfiniteData<OhlcCandle[], unknown>;

const EMPTY_CONNECTION: ChartConnectionSnapshot = {
  status: 'loading',
  error: null,
  lastPrice: null,
};

function messageFromError(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Unknown network error';
}

function mergeCandles(
  pages: ReadonlyArray<ReadonlyArray<OhlcCandle>>,
  maxCandles: number
): OhlcCandle[] {
  const byTimestamp = new Map<number, OhlcCandle>();
  pages.forEach((page) =>
    page.forEach((candle) => byTimestamp.set(candle.timestamp, candle))
  );
  return [...byTimestamp.values()]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-maxCandles);
}

function latestPrice(candles: ReadonlyArray<OhlcCandle>): number | null {
  return candles.at(-1)?.close ?? null;
}

export function useChartDataFeed<
  TTicker extends { symbol: string; lastPrice: number },
  TInterval extends string,
  TMessage,
>(
  adapter: MarketDataAdapter<TTicker, TInterval, TMessage>,
  ticker: TTicker,
  interval: TInterval,
  chartId: string,
  charts: ChartDataFeedApi = TradingCharts
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => adapter.candlesQueryKey(ticker.symbol, interval),
    [adapter, interval, ticker.symbol]
  );
  const sessionKey = `${adapter.provider}:${ticker.symbol}:${interval}`;
  const topic = adapter.topicFor(ticker.symbol, interval);
  const [connection, setConnection] =
    useState<ChartConnectionSnapshot>(EMPTY_CONNECTION);
  const [allTimeExtremes, setAllTimeExtremes] =
    useState<AllTimeExtremes | null>(null);
  const appliedPageCountRef = useRef(0);
  const synchronizedGenerationRef = useRef<number | null>(null);
  const activeGenerationRef = useRef<number | null>(null);
  const buffersRef = useRef(new Map<number, Map<number, OhlcCandle>>());
  const hadLiveDataRef = useRef(false);
  const historyDataRef = useRef<CandlePages | undefined>(undefined);

  const historyQuery = useInfiniteQuery<
    OhlcCandle[],
    Error,
    CandlePages,
    readonly unknown[],
    number | undefined
  >({
    queryKey,
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) =>
      adapter.fetchCandles(ticker.symbol, interval, {
        signal,
        beforeTimestamp: pageParam,
        allowEmpty: pageParam != null,
      }),
    getNextPageParam: (lastPage, pages) => {
      const candleCount = pages.reduce((count, page) => count + page.length, 0);
      if (lastPage.length === 0 || candleCount >= adapter.maxCandles) {
        return undefined;
      }
      return lastPage[0]?.timestamp;
    },
    staleTime: Infinity,
  });
  historyDataRef.current = historyQuery.data;

  useEffect(() => {
    appliedPageCountRef.current = 0;
    synchronizedGenerationRef.current = null;
    activeGenerationRef.current = null;
    buffersRef.current.clear();
    hadLiveDataRef.current = false;
    setAllTimeExtremes(null);
    setConnection({ ...EMPTY_CONNECTION, lastPrice: ticker.lastPrice });
  }, [sessionKey, ticker.lastPrice]);

  useEffect(() => {
    const pages = historyQuery.data?.pages;
    if (pages == null || pages.length === 0) {
      return;
    }
    const appliedPageCount = appliedPageCountRef.current;
    if (appliedPageCount === 0) {
      if (synchronizedGenerationRef.current == null) {
        const candles = mergeCandles(pages, adapter.maxCandles);
        charts.setHistory(chartId, candles);
        setAllTimeExtremes(calculateAllTimeExtremes(candles));
        setConnection((current) => ({
          status:
            current.status === 'loading' || current.status === 'error'
              ? 'historical'
              : current.status,
          error: null,
          lastPrice: latestPrice(candles) ?? current.lastPrice,
        }));
      }
      appliedPageCountRef.current = pages.length;
      return;
    }
    if (pages.length > appliedPageCount) {
      const older = mergeCandles(
        pages.slice(appliedPageCount),
        adapter.maxCandles
      );
      if (older.length > 0) {
        charts.prependHistory(chartId, older);
        setAllTimeExtremes((current) =>
          extendAllTimeExtremes(current, older)
        );
      }
      appliedPageCountRef.current = pages.length;
    }
  }, [adapter.maxCandles, chartId, charts, historyQuery.data]);

  useEffect(() => {
    if (historyQuery.data != null || historyQuery.error == null) {
      return;
    }
    setConnection((current) => ({
      ...current,
      status: adapter.isNoDataError(historyQuery.error) ? 'no-data' : 'error',
      error: messageFromError(historyQuery.error),
    }));
  }, [adapter, historyQuery.data, historyQuery.error]);

  useEffect(() => {
    let active = true;

    const synchronize = async (generation: number) => {
      activeGenerationRef.current = generation;
      synchronizedGenerationRef.current = null;
      let synchronizationStatus: ChartConnectionStatus = 'historical';
      if (hadLiveDataRef.current) {
        synchronizationStatus = 'reconnecting';
      } else if (historyDataRef.current == null) {
        synchronizationStatus = 'loading';
      }
      setConnection((current) => ({
        ...current,
        status: synchronizationStatus,
        error: null,
      }));

      try {
        const snapshot = await queryClient.fetchQuery({
          queryKey: adapter.snapshotQueryKey(ticker.symbol, interval),
          queryFn: ({ signal }) =>
            adapter.fetchCandles(ticker.symbol, interval, { signal }),
          staleTime: 0,
          gcTime: 0,
        });
        if (!active || activeGenerationRef.current !== generation) {
          return;
        }

        const cached = queryClient.getQueryData<CandlePages>(queryKey);
        const olderPages = cached?.pages.slice(1) ?? [];
        const firstSnapshotTimestamp = snapshot[0]?.timestamp ?? Infinity;
        const preservedOlder = mergeCandles(
          olderPages,
          adapter.maxCandles
        ).filter((candle) => candle.timestamp < firstSnapshotTimestamp);
        const merged = mergeCandles(
          [preservedOlder, snapshot],
          adapter.maxCandles
        );

        queryClient.setQueryData<CandlePages>(queryKey, (current) => ({
          pages: [snapshot, ...(current?.pages.slice(1) ?? [])],
          pageParams: current?.pageParams ?? [undefined],
        }));
        charts.setHistory(chartId, merged);
        appliedPageCountRef.current =
          queryClient.getQueryData<CandlePages>(queryKey)?.pages.length ?? 1;

        const latestSnapshotTimestamp = snapshot.at(-1)?.timestamp ?? 0;
        const buffered = [
          ...(buffersRef.current.get(generation)?.values() ?? []),
        ]
          .filter((candle) => candle.timestamp >= latestSnapshotTimestamp)
          .sort((left, right) => left.timestamp - right.timestamp);
        buffered.forEach((candle) => charts.updateCandle(chartId, candle));
        setAllTimeExtremes(
          calculateAllTimeExtremes([...merged, ...buffered])
        );
        buffersRef.current.clear();
        synchronizedGenerationRef.current = generation;
        activeGenerationRef.current = null;
        hadLiveDataRef.current = true;
        setConnection({
          status: 'live',
          error: null,
          lastPrice:
            latestPrice(buffered) ?? latestPrice(snapshot) ?? ticker.lastPrice,
        });
      } catch (cause) {
        if (!active || activeGenerationRef.current !== generation) {
          return;
        }
        activeGenerationRef.current = null;
        setConnection((current) => ({
          ...current,
          status: adapter.isNoDataError(cause) ? 'no-data' : 'error',
          error: messageFromError(cause),
        }));
      }
    };

    const handleEvent = (event: MarketWebSocketEvent<TMessage>) => {
      if (event.type === 'message') {
        try {
          const candles = adapter.parseMarketMessage(event.message);
          if (synchronizedGenerationRef.current === event.generation) {
            candles.forEach((candle) => charts.updateCandle(chartId, candle));
            setAllTimeExtremes((current) =>
              extendAllTimeExtremes(current, candles)
            );
          } else {
            const buffer =
              buffersRef.current.get(event.generation) ?? new Map();
            candles.forEach((candle) => buffer.set(candle.timestamp, candle));
            while (buffer.size > 1_000) {
              const oldest = Math.min(...buffer.keys());
              buffer.delete(oldest);
            }
            buffersRef.current.set(event.generation, buffer);
          }
          const price = latestPrice(candles);
          if (price != null) {
            setConnection((current) => ({ ...current, lastPrice: price }));
          }
        } catch (cause) {
          adapter.websocket.reportProtocolError(event.generation, cause);
        }
        return;
      }
      if (event.type === 'ready') {
        void synchronize(event.generation);
        return;
      }
      if (event.state === 'paused' || event.state === 'offline') {
        activeGenerationRef.current = null;
        synchronizedGenerationRef.current = null;
        setConnection((current) => ({
          ...current,
          status: event.state === 'paused' ? 'paused' : 'offline',
          error: null,
        }));
      } else if (event.state === 'reconnecting') {
        setConnection((current) => ({
          ...current,
          status: 'reconnecting',
          error: event.error,
        }));
      } else if (event.state === 'connecting') {
        setConnection((current) => ({
          ...current,
          status: historyDataRef.current == null ? 'loading' : 'connecting',
          error: null,
        }));
      }
    };

    const unsubscribe = adapter.websocket.subscribe(topic, handleEvent);
    return () => {
      active = false;
      activeGenerationRef.current = null;
      synchronizedGenerationRef.current = null;
      unsubscribe();
    };
  }, [
    adapter,
    chartId,
    charts,
    interval,
    queryClient,
    queryKey,
    sessionKey,
    ticker.lastPrice,
    ticker.symbol,
    topic,
  ]);

  const loadOlder = useCallback(() => {
    if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
      void historyQuery.fetchNextPage();
    }
  }, [historyQuery]);

  const retry = useCallback(() => {
    setConnection((current) => ({
      ...current,
      status: 'loading',
      error: null,
    }));
    if (historyQuery.data == null) {
      void historyQuery.refetch();
    }
    adapter.websocket.retry();
  }, [adapter.websocket, historyQuery]);

  return useMemo(
    () => ({ ...connection, allTimeExtremes, loadOlder, retry }),
    [allTimeExtremes, connection, loadOlder, retry]
  );
}
