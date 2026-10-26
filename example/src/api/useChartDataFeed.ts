import {
  useInfiniteQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TradingCharts, type OhlcCandle } from 'react-native-trading-charts';

import { type MarketDataAdapter } from './marketData';
import {
  MarketChartFeedSession,
  initialChartFeedSnapshot,
  type CandlePages,
  type ChartDataFeedApi,
} from './MarketChartFeedSession';

export type {
  ChartConnectionStatus,
  ChartDataFeedApi,
} from './MarketChartFeedSession';

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
  const target = useMemo(
    () => ({
      adapter,
      queryClient,
      symbol: ticker.symbol,
      lastPrice: ticker.lastPrice,
      interval,
      chartId,
      charts,
    }),
    [
      adapter,
      chartId,
      charts,
      interval,
      queryClient,
      ticker.lastPrice,
      ticker.symbol,
    ]
  );
  const [state, setState] = useState(() => ({
    target,
    snapshot: initialChartFeedSnapshot(ticker.lastPrice),
  }));
  // A new target must never commit the previous market's price or extremes.
  if (state.target !== target)
    setState({ target, snapshot: initialChartFeedSnapshot(ticker.lastPrice) });
  const sessionRef = useRef<MarketChartFeedSession<
    TTicker,
    TInterval,
    TMessage
  > | null>(null);

  const historyQuery = useInfiniteQuery<
    OhlcCandle[],
    Error,
    CandlePages,
    QueryKey,
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
      if (lastPage.length === 0 || candleCount >= adapter.maxCandles)
        return undefined;
      return lastPage[0]?.timestamp;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const session = new MarketChartFeedSession({
      ...target,
      publish: (snapshot) =>
        setState((current) =>
          current.target === target ? { target, snapshot } : current
        ),
    });
    sessionRef.current = session;
    return () => {
      session.dispose();
      sessionRef.current = null;
    };
  }, [target]);

  // Apply cached history before opening the socket, including after an effect replay.
  useEffect(() => {
    sessionRef.current?.applyHistory(historyQuery.data?.pages);
  }, [target, historyQuery.data]);
  useEffect(() => {
    if (historyQuery.data == null)
      sessionRef.current?.applyHistoryError(historyQuery.error);
  }, [target, historyQuery.data, historyQuery.error]);
  useEffect(() => {
    sessionRef.current?.start();
  }, [target]);

  const loadOlder = useCallback(() => {
    if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage)
      void historyQuery.fetchNextPage();
  }, [historyQuery]);
  const retry = useCallback(() => {
    // Start a missing initial query before asking the socket to reconnect.
    if (historyQuery.data == null) void historyQuery.refetch();
    sessionRef.current?.retry();
  }, [historyQuery]);

  return useMemo(
    () => ({ ...state.snapshot, loadOlder, retry }),
    [state.snapshot, loadOlder, retry]
  );
}
