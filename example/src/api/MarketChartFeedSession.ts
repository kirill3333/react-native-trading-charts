import { type InfiniteData, type QueryClient } from '@tanstack/react-query';
import {
  type OhlcCandle,
  type TradingCharts,
} from 'react-native-trading-charts';

import {
  calculateAllTimeExtremes,
  extendAllTimeExtremes,
  type AllTimeExtremes,
} from '../allTimeExtremes';
import { type MarketDataAdapter } from './marketData';
import {
  type MarketWebSocketConnection,
  type MarketWebSocketEvent,
} from './marketWebSocket';
import { mergeCandles } from './mergeCandles';

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
export type ChartFeedSnapshot = {
  status: ChartConnectionStatus;
  error: string | null;
  lastPrice: number | null;
  allTimeExtremes: AllTimeExtremes | null;
};
export type CandlePages = InfiniteData<OhlcCandle[], number | undefined>;
type LiveSession = {
  generation: number;
  synchronized: boolean;
  bufferedCandles: Map<number, OhlcCandle>;
};
type FeedOptions<
  TTicker extends { symbol: string },
  TInterval extends string,
  TMessage,
> = {
  adapter: MarketDataAdapter<TTicker, TInterval, TMessage>;
  queryClient: QueryClient;
  symbol: string;
  interval: TInterval;
  chartId: string;
  lastPrice: number;
  charts: ChartDataFeedApi;
  publish: (snapshot: ChartFeedSnapshot) => void;
};

export function initialChartFeedSnapshot(lastPrice: number): ChartFeedSnapshot {
  return { status: 'loading', error: null, lastPrice, allTimeExtremes: null };
}
function messageFromError(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Unknown network error';
}
function latestPrice(candles: ReadonlyArray<OhlcCandle>): number | null {
  return candles.at(-1)?.close ?? null;
}

/** Owns one chart target. Construction is inert; disposal invalidates every pending resync. */
export class MarketChartFeedSession<
  TTicker extends { symbol: string },
  TInterval extends string,
  TMessage,
> {
  private snapshot: ChartFeedSnapshot;
  private appliedPageCount = 0;
  private liveHistoryApplied = false;
  private websocket: MarketWebSocketConnection | null = null;
  private liveSession: LiveSession | null = null;
  private hasBeenLive = false;
  private disposed = false;

  constructor(
    private readonly options: FeedOptions<TTicker, TInterval, TMessage>
  ) {
    this.snapshot = initialChartFeedSnapshot(options.lastPrice);
  }

  start() {
    if (this.disposed || this.websocket != null) return;
    const { adapter, symbol, interval } = this.options;
    this.websocket = adapter.websocket.connect(
      adapter.topicFor(symbol, interval),
      (event) => this.handleEvent(event)
    );
  }

  applyHistory(pages: CandlePages['pages'] | undefined) {
    if (this.disposed || pages == null || pages.length === 0) return;
    const { adapter, charts, chartId } = this.options;
    if (this.appliedPageCount === 0) {
      if (!this.liveHistoryApplied) {
        const candles = mergeCandles(pages, adapter.maxCandles);
        charts.setHistory(chartId, candles);
        this.update({
          status:
            this.snapshot.status === 'loading' ||
            this.snapshot.status === 'error'
              ? 'historical'
              : this.snapshot.status,
          error: null,
          lastPrice: latestPrice(candles) ?? this.snapshot.lastPrice,
          allTimeExtremes: calculateAllTimeExtremes(candles),
        });
      }
    } else if (pages.length > this.appliedPageCount) {
      const older = mergeCandles(
        pages.slice(this.appliedPageCount),
        adapter.maxCandles
      );
      if (older.length > 0) {
        charts.prependHistory(chartId, older);
        this.update({
          allTimeExtremes: extendAllTimeExtremes(
            this.snapshot.allTimeExtremes,
            older
          ),
        });
      }
    }
    this.appliedPageCount = Math.max(this.appliedPageCount, pages.length);
  }

  applyHistoryError(error: Error | null) {
    if (error != null)
      this.update({
        status: this.options.adapter.isNoDataError(error) ? 'no-data' : 'error',
        error: messageFromError(error),
      });
  }

  retry() {
    if (this.disposed) return;
    this.update({ status: 'loading', error: null });
    this.websocket?.retry();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.liveSession = null;
    this.websocket?.close();
    this.websocket = null;
  }

  private update(patch: Partial<ChartFeedSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.options.publish(this.snapshot);
  }

  private sessionFor(generation: number): LiveSession {
    if (this.liveSession?.generation === generation) return this.liveSession;
    this.liveSession = {
      generation,
      synchronized: false,
      bufferedCandles: new Map(),
    };
    return this.liveSession;
  }

  private async synchronize(generation: number) {
    const session = this.sessionFor(generation);
    session.synchronized = false;
    let status: ChartConnectionStatus = 'historical';
    if (this.hasBeenLive) status = 'reconnecting';
    else if (this.appliedPageCount === 0) status = 'loading';
    this.update({ status, error: null });
    const { adapter, queryClient, symbol, interval } = this.options;
    const queryKey = adapter.candlesQueryKey(symbol, interval);
    try {
      const snapshot = await queryClient.fetchQuery({
        queryKey: adapter.snapshotQueryKey(symbol, interval),
        queryFn: ({ signal }) =>
          adapter.fetchCandles(symbol, interval, { signal }),
        staleTime: 0,
        gcTime: 0,
      });
      if (this.liveSession !== session) return;
      await queryClient.cancelQueries({ queryKey, exact: true });
      if (this.liveSession !== session) return;
      this.applyLiveSnapshot(snapshot, session);
    } catch (cause) {
      if (this.liveSession !== session) return;
      this.update({
        status: adapter.isNoDataError(cause) ? 'no-data' : 'error',
        error: messageFromError(cause),
      });
    }
  }

  private applyLiveSnapshot(snapshot: OhlcCandle[], session: LiveSession) {
    const {
      adapter,
      queryClient,
      symbol,
      interval,
      charts,
      chartId,
      lastPrice,
    } = this.options;
    const queryKey = adapter.candlesQueryKey(symbol, interval);
    const cached = queryClient.getQueryData<CandlePages>(queryKey);
    const firstTimestamp = snapshot[0]?.timestamp ?? Infinity;
    const older = mergeCandles(
      cached?.pages.slice(1) ?? [],
      adapter.maxCandles
    ).filter((candle) => candle.timestamp < firstTimestamp);
    const merged = mergeCandles([older, snapshot], adapter.maxCandles);

    this.liveHistoryApplied = true;
    queryClient.setQueryData<CandlePages>(queryKey, (current) => ({
      pages: [snapshot, ...(current?.pages.slice(1) ?? [])],
      pageParams: current?.pageParams ?? [undefined],
    }));
    charts.setHistory(chartId, merged);
    this.appliedPageCount =
      queryClient.getQueryData<CandlePages>(queryKey)?.pages.length ?? 1;

    const latestTimestamp = snapshot.at(-1)?.timestamp ?? 0;
    const buffered = [...session.bufferedCandles.values()]
      .filter((candle) => candle.timestamp >= latestTimestamp)
      .sort((left, right) => left.timestamp - right.timestamp);
    buffered.forEach((candle) => charts.updateCandle(chartId, candle));
    session.bufferedCandles.clear();
    session.synchronized = true;
    this.hasBeenLive = true;
    this.update({
      status: 'live',
      error: null,
      lastPrice: latestPrice(buffered) ?? latestPrice(snapshot) ?? lastPrice,
      allTimeExtremes: calculateAllTimeExtremes([...merged, ...buffered]),
    });
  }

  private applyMessage(message: TMessage, generation: number) {
    const { adapter, charts, chartId } = this.options;
    try {
      const candles = adapter.parseMarketMessage(message);
      const session = this.sessionFor(generation);
      if (session.synchronized) {
        candles.forEach((candle) => charts.updateCandle(chartId, candle));
        this.update({
          allTimeExtremes: extendAllTimeExtremes(
            this.snapshot.allTimeExtremes,
            candles
          ),
        });
      } else {
        candles.forEach((candle) =>
          session.bufferedCandles.set(candle.timestamp, candle)
        );
        while (session.bufferedCandles.size > 1_000) {
          session.bufferedCandles.delete(
            Math.min(...session.bufferedCandles.keys())
          );
        }
      }
      const price = latestPrice(candles);
      if (price != null) this.update({ lastPrice: price });
    } catch (cause) {
      this.websocket?.reportProtocolError(generation, cause);
    }
  }

  private handleEvent(event: MarketWebSocketEvent<TMessage>) {
    if (this.disposed) return;
    if (event.type === 'message') {
      this.applyMessage(event.message, event.generation);
    } else if (event.type === 'ready') {
      void this.synchronize(event.generation);
    } else if (
      event.state === 'paused' ||
      event.state === 'offline' ||
      event.state === 'reconnecting'
    ) {
      this.liveSession = null;
      this.update({
        status: event.state,
        error: event.state === 'reconnecting' ? event.error : null,
      });
    } else if (event.state === 'connecting') {
      this.update({
        status: this.appliedPageCount === 0 ? 'loading' : 'connecting',
        error: null,
      });
    }
  }
}
