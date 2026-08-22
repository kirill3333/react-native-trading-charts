import { TradingCharts, type OhlcCandle } from 'react-native-trading-charts';

import {
  BinanceNoDataError,
  fetchSpotKlinesWithRetry,
  klineTopic,
  parseKlineMarketMessage,
  type BinanceInterval,
  type BinanceMarketMessage,
  type BinanceTicker,
} from './binance';
import { binanceWebSocketClient } from './binanceWebSocket';
import {
  fetchHyperliquidCandlesWithRetry,
  hyperliquidCandleTopic,
  HyperliquidNoDataError,
  parseHyperliquidCandleMarketMessage,
  type HyperliquidInterval,
  type HyperliquidMarketMessage,
  type HyperliquidTicker,
} from './hyperliquid';
import { hyperliquidWebSocketClient } from './hyperliquidWebSocket';

const DEFAULT_CACHE_SIZE = 8;
const DEFAULT_MAX_CACHED_CANDLES = 20_000;

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

export type ChartConnectionSnapshot = Readonly<{
  status: ChartConnectionStatus;
  error: string | null;
  lastPrice: number | null;
}>;

type ChartConnectionSnapshotUpdate = Readonly<{
  status: ChartConnectionStatus;
  error: string | null;
  lastPrice?: number | null;
}>;

type TradingChartsApi = Pick<
  typeof TradingCharts,
  'clear' | 'prependHistory' | 'setHistory' | 'updateCandle'
>;

type ChartWebSocketState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'paused' | 'offline';

type ChartWebSocketEvent<TMessage> =
  | { type: 'state'; state: ChartWebSocketState; error: string | null }
  | { type: 'ready'; topic: string; generation: number }
  | {
      type: 'message';
      topic: string;
      generation: number;
      message: TMessage;
    };

type ChartWebSocketListener<TMessage> = (
  event: ChartWebSocketEvent<TMessage>
) => void;

type WebSocketClient<TMessage> = {
  subscribe(
    topic: string,
    listener: ChartWebSocketListener<TMessage>
  ): () => void;
  reportProtocolError(generation: number, error: unknown): void;
};

type FetchKlines<TInterval extends string> = (
  symbol: string,
  interval: TInterval,
  options?: {
    signal?: AbortSignal;
    attempts?: number;
    baseDelayMs?: number;
    beforeTimestamp?: number;
    allowEmpty?: boolean;
  }
) => Promise<OhlcCandle[]>;

export type ChartDataControllerOptions<
  TInterval extends string = BinanceInterval,
  TMessage = BinanceMarketMessage,
> = {
  cacheSize?: number;
  maxCachedCandles?: number;
  charts?: TradingChartsApi;
  websocketClient?: WebSocketClient<TMessage>;
  fetchKlines?: FetchKlines<TInterval>;
  topicFor?: (symbol: string, interval: TInterval) => string;
  chartIdFor?: (symbol: string, interval: TInterval) => string;
  sessionKeyFor?: (symbol: string, interval: TInterval) => string;
  parseMarketMessage?: (message: TMessage) => OhlcCandle[];
  isNoDataError?: (error: unknown) => boolean;
};

type SessionOptions<TInterval extends string, TMessage> = Required<
  Omit<
    ChartDataControllerOptions<TInterval, TMessage>,
    'cacheSize' | 'maxCachedCandles'
  >
> & {
  maxCachedCandles: number;
};
type TransportStatus = 'connecting' | 'reconnecting' | 'paused' | 'offline';

const EMPTY_SNAPSHOT: ChartConnectionSnapshot = Object.freeze({
  status: 'loading',
  error: null,
  lastPrice: null,
});

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown network error';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function chartSessionKey(
  symbol: string,
  interval: BinanceInterval
): string {
  return `${symbol}:${interval}`;
}

export function chartIdFor(symbol: string, interval: BinanceInterval): string {
  return `binance-spot-${symbol}-${interval}`;
}

class ChartDataSession<TInterval extends string, TMessage> {
  readonly chartId: string;
  readonly key: string;
  private readonly symbol: string;
  private readonly interval: TInterval;
  private readonly topic: string;
  private readonly options: SessionOptions<TInterval, TMessage>;
  private readonly listeners = new Set<() => void>();
  private readonly candleBuffers = new Map<number, Map<number, OhlcCandle>>();
  private readonly candlesByTimestamp = new Map<number, OhlcCandle>();
  private snapshot: ChartConnectionSnapshot = EMPTY_SNAPSHOT;
  private active = false;
  private disposed = false;
  private terminal = false;
  private hasHistory = false;
  private initialHistoryFailed = false;
  private hadLiveData = false;
  private transportStatus: TransportStatus = 'connecting';
  private activeGeneration: number | null = null;
  private synchronizedGeneration: number | null = null;
  private pendingReadyGeneration: number | null = null;
  private initialController: AbortController | null = null;
  private synchronizationController: AbortController | null = null;
  private olderHistoryController: AbortController | null = null;
  private hasMoreHistory = true;
  private unsubscribeLive: () => void = () => undefined;

  constructor(
    symbol: string,
    interval: TInterval,
    options: SessionOptions<TInterval, TMessage>
  ) {
    this.symbol = symbol;
    this.interval = interval;
    this.key = options.sessionKeyFor(symbol, interval);
    this.chartId = options.chartIdFor(symbol, interval);
    this.topic = options.topicFor(symbol, interval);
    this.options = options;
  }

  getSnapshot = (): ChartConnectionSnapshot => this.snapshot;

  isLiveActivationSettled(): boolean {
    return this.snapshot.status === 'live' || this.terminal;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  prepare(): void {
    if (this.disposed) {
      return;
    }
    if (this.hasHistory) {
      this.replayCachedHistory();
      return;
    }
    this.loadInitialHistory().catch(() => undefined);
  }

  activate(): void {
    if (this.disposed || this.active) {
      return;
    }
    this.active = true;
    this.terminal = false;
    this.prepare();
    if (this.hasHistory) {
      this.replayCachedHistory();
    }
    this.subscribeToLiveData();
  }

  deactivate(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.pendingReadyGeneration = null;
    this.abortSynchronization();
    this.olderHistoryController?.abort();
    this.olderHistoryController = null;
    this.unsubscribeLive();
    this.unsubscribeLive = () => undefined;
    this.synchronizedGeneration = null;
    this.candleBuffers.clear();
    if (this.hasHistory) {
      this.setSnapshot({ status: 'historical', error: null });
    }
  }

  retry(): void {
    if (this.disposed) {
      return;
    }
    const wasActive = this.active;
    if (wasActive) {
      this.deactivate();
      this.active = true;
    }
    this.terminal = false;
    this.initialHistoryFailed = false;
    this.pendingReadyGeneration = null;
    if (!this.hasHistory) {
      this.setSnapshot({ status: 'loading', error: null });
      this.loadInitialHistory().catch(() => undefined);
    } else {
      this.replayCachedHistory();
      this.setSnapshot({ status: 'historical', error: null });
    }
    if (wasActive) {
      this.subscribeToLiveData();
    }
  }

  loadOlder(): void {
    this.loadOlderHistory().catch(() => undefined);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.deactivate();
    this.disposed = true;
    this.initialController?.abort();
    this.initialController = null;
    this.olderHistoryController?.abort();
    this.olderHistoryController = null;
    this.listeners.clear();
    this.options.charts.clear(this.chartId);
  }

  private setSnapshot(next: ChartConnectionSnapshotUpdate): void {
    const lastPrice =
      next.lastPrice === undefined ? this.snapshot.lastPrice : next.lastPrice;
    if (
      this.snapshot.status === next.status &&
      this.snapshot.error === next.error &&
      this.snapshot.lastPrice === lastPrice
    ) {
      return;
    }
    this.snapshot = Object.freeze({
      status: next.status,
      error: next.error,
      lastPrice,
    });
    this.listeners.forEach((listener) => listener());
  }

  private publishLatestPrice(candles: ReadonlyArray<OhlcCandle>): void {
    let latest: OhlcCandle | undefined;
    candles.forEach((candle) => {
      if (latest == null || candle.timestamp >= latest.timestamp) {
        latest = candle;
      }
    });
    if (latest == null) {
      return;
    }
    this.setSnapshot({
      status: this.snapshot.status,
      error: this.snapshot.error,
      lastPrice: latest.close,
    });
  }

  private abortSynchronization(): void {
    this.synchronizationController?.abort();
    this.synchronizationController = null;
    this.activeGeneration = null;
  }

  private cacheCandles(candles: ReadonlyArray<OhlcCandle>): void {
    candles.forEach((candle) =>
      this.candlesByTimestamp.set(candle.timestamp, candle)
    );
    if (this.candlesByTimestamp.size <= this.options.maxCachedCandles) {
      return;
    }
    const timestamps = [...this.candlesByTimestamp.keys()].sort(
      (left, right) => left - right
    );
    timestamps
      .slice(0, timestamps.length - this.options.maxCachedCandles)
      .forEach((timestamp) => this.candlesByTimestamp.delete(timestamp));
  }

  private bufferCandles(generation: number, candles: OhlcCandle[]): void {
    const buffer = this.candleBuffers.get(generation) ?? new Map();
    candles.forEach((candle) => buffer.set(candle.timestamp, candle));
    this.candleBuffers.set(generation, buffer);
  }

  private replaceCandles(
    snapshot: ReadonlyArray<OhlcCandle>,
    generation?: number
  ): void {
    const firstSnapshotTimestamp = snapshot[0]?.timestamp ?? Infinity;
    const preservedOlder =
      generation == null
        ? []
        : [...this.candlesByTimestamp.values()].filter(
            (candle) => candle.timestamp < firstSnapshotTimestamp
          );
    const merged = [...preservedOlder, ...snapshot]
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(-this.options.maxCachedCandles);
    this.candlesByTimestamp.clear();
    this.cacheCandles(merged);
    this.options.charts.setHistory(this.chartId, merged);
    if (generation == null) {
      return;
    }

    const latestSnapshotTimestamp = snapshot.at(-1)?.timestamp ?? 0;
    const bufferedCandles = [
      ...(this.candleBuffers.get(generation)?.values() ?? []),
    ]
      .filter((candle) => candle.timestamp >= latestSnapshotTimestamp)
      .sort((left, right) => left.timestamp - right.timestamp);
    bufferedCandles.forEach((candle) => {
      this.cacheCandles([candle]);
      this.options.charts.updateCandle(this.chartId, candle);
    });
  }

  private replayCachedHistory(): void {
    if (!this.hasHistory) {
      return;
    }
    const candles = [...this.candlesByTimestamp.values()].sort(
      (left, right) => left.timestamp - right.timestamp
    );
    this.options.charts.setHistory(this.chartId, candles);
  }

  private canLoadOlderHistory(): boolean {
    if (!this.active || this.disposed) {
      return false;
    }
    if (!this.hasHistory || !this.hasMoreHistory) {
      return false;
    }
    return this.olderHistoryController == null;
  }

  private async loadOlderHistory(): Promise<void> {
    if (!this.canLoadOlderHistory()) {
      return;
    }
    const oldestTimestamp = Math.min(...this.candlesByTimestamp.keys());
    if (!Number.isFinite(oldestTimestamp)) {
      return;
    }
    const remainingCapacity =
      this.options.maxCachedCandles - this.candlesByTimestamp.size;
    if (remainingCapacity <= 0) {
      this.hasMoreHistory = false;
      return;
    }

    const controller = new AbortController();
    this.olderHistoryController = controller;
    try {
      const page = await this.options.fetchKlines(this.symbol, this.interval, {
        signal: controller.signal,
        beforeTimestamp: oldestTimestamp,
        allowEmpty: true,
      });
      if (
        !this.active ||
        this.disposed ||
        controller.signal.aborted ||
        this.olderHistoryController !== controller
      ) {
        return;
      }
      const older = page
        .filter(
          (candle) =>
            candle.timestamp < oldestTimestamp &&
            !this.candlesByTimestamp.has(candle.timestamp)
        )
        .sort((left, right) => left.timestamp - right.timestamp)
        .slice(-remainingCapacity);
      if (older.length === 0) {
        this.hasMoreHistory = false;
        return;
      }
      this.cacheCandles(older);
      this.options.charts.prependHistory(this.chartId, older);
      if (this.candlesByTimestamp.size >= this.options.maxCachedCandles) {
        this.hasMoreHistory = false;
      }
    } catch (error) {
      if (!isAbortError(error)) {
        // A transient page failure can be retried after the viewport moves again.
        this.hasMoreHistory = true;
      }
    } finally {
      if (this.olderHistoryController === controller) {
        this.olderHistoryController = null;
      }
    }
  }

  private canLoadInitialHistory(): boolean {
    if (this.disposed || this.hasHistory) {
      return false;
    }
    if (this.initialHistoryFailed) {
      return false;
    }
    return this.initialController == null;
  }

  private isInitialHistoryResultStale(controller: AbortController): boolean {
    if (this.disposed || controller.signal.aborted) {
      return true;
    }
    if (this.initialController !== controller) {
      return true;
    }
    return this.synchronizedGeneration != null;
  }

  private shouldIgnoreInitialHistoryError(
    controller: AbortController,
    error: unknown
  ): boolean {
    if (this.disposed || controller.signal.aborted) {
      return true;
    }
    if (this.initialController !== controller) {
      return true;
    }
    return isAbortError(error);
  }

  private synchronizePendingReadyGeneration(): boolean {
    const generation = this.pendingReadyGeneration;
    this.pendingReadyGeneration = null;
    if (!this.active || generation == null) {
      return false;
    }
    this.synchronize(generation).catch(() => undefined);
    return true;
  }

  private handleInitialHistoryError(error: unknown): void {
    this.initialController = null;
    this.initialHistoryFailed = true;
    if (this.synchronizePendingReadyGeneration()) {
      return;
    }
    if (
      this.transportStatus === 'offline' ||
      this.transportStatus === 'paused'
    ) {
      return;
    }
    this.setSnapshot({
      status: this.options.isNoDataError(error) ? 'no-data' : 'error',
      error: messageFromError(error),
    });
  }

  private async loadInitialHistory(): Promise<void> {
    if (!this.canLoadInitialHistory()) {
      return;
    }
    const controller = new AbortController();
    this.initialController = controller;
    this.setSnapshot({ status: 'loading', error: null });

    try {
      const snapshot = await this.options.fetchKlines(
        this.symbol,
        this.interval,
        { signal: controller.signal }
      );
      if (this.isInitialHistoryResultStale(controller)) {
        return;
      }
      this.replaceCandles(snapshot);
      this.initialController = null;
      this.hasHistory = true;
      this.setSnapshot({ status: 'historical', error: null });
      this.synchronizePendingReadyGeneration();
    } catch (error) {
      if (this.shouldIgnoreInitialHistoryError(controller, error)) {
        return;
      }
      this.handleInitialHistoryError(error);
    }
  }

  private handleMarketMessage(
    event: Extract<ChartWebSocketEvent<TMessage>, { type: 'message' }>
  ): void {
    if (!this.active || this.terminal || event.topic !== this.topic) {
      return;
    }
    try {
      const candles = this.options.parseMarketMessage(event.message);
      if (this.synchronizedGeneration === event.generation) {
        candles.forEach((candle) => {
          this.cacheCandles([candle]);
          this.options.charts.updateCandle(this.chartId, candle);
        });
      } else {
        this.bufferCandles(event.generation, candles);
      }
      this.publishLatestPrice(candles);
    } catch (error) {
      this.options.websocketClient.reportProtocolError(event.generation, error);
    }
  }

  private isSynchronizationStale(
    controller: AbortController,
    generation: number
  ): boolean {
    if (!this.active || this.disposed) {
      return true;
    }
    if (controller.signal.aborted) {
      return true;
    }
    return this.activeGeneration !== generation;
  }

  private shouldIgnoreSynchronizationError(
    controller: AbortController,
    generation: number,
    error: unknown
  ): boolean {
    if (this.isSynchronizationStale(controller, generation)) {
      return true;
    }
    return isAbortError(error);
  }

  private async synchronize(generation: number): Promise<void> {
    if (!this.active || this.disposed) {
      return;
    }
    this.abortSynchronization();
    this.activeGeneration = generation;
    const controller = new AbortController();
    this.synchronizationController = controller;
    let status: ChartConnectionStatus = 'loading';
    if (this.hadLiveData) {
      status = 'reconnecting';
    } else if (this.hasHistory) {
      status = 'historical';
    }
    this.setSnapshot({ status, error: null });

    try {
      const snapshot = await this.options.fetchKlines(
        this.symbol,
        this.interval,
        { signal: controller.signal }
      );
      if (this.isSynchronizationStale(controller, generation)) {
        return;
      }
      this.replaceCandles(snapshot, generation);
      this.synchronizationController = null;
      this.activeGeneration = null;
      this.synchronizedGeneration = generation;
      this.hasHistory = true;
      this.initialHistoryFailed = false;
      this.hadLiveData = true;
      this.candleBuffers.clear();
      this.setSnapshot({ status: 'live', error: null });
    } catch (error) {
      if (
        this.shouldIgnoreSynchronizationError(controller, generation, error)
      ) {
        return;
      }
      this.synchronizationController = null;
      this.activeGeneration = null;
      this.terminal = true;
      this.unsubscribeLive();
      this.unsubscribeLive = () => undefined;
      this.setSnapshot({
        status: this.options.isNoDataError(error) ? 'no-data' : 'error',
        error: messageFromError(error),
      });
    }
  }

  private handleReadyEvent(
    event: Extract<ChartWebSocketEvent<TMessage>, { type: 'ready' }>
  ): void {
    if (event.topic !== this.topic) {
      return;
    }
    if (this.initialController != null && !this.hasHistory) {
      this.pendingReadyGeneration = event.generation;
      return;
    }
    this.synchronize(event.generation).catch(() => undefined);
  }

  private handleConnectingState(): void {
    this.transportStatus = this.hadLiveData ? 'reconnecting' : 'connecting';
    if (!this.hasHistory && !this.initialHistoryFailed) {
      this.loadInitialHistory().catch(() => undefined);
    }
    let nextStatus: ChartConnectionStatus = 'loading';
    if (this.hadLiveData) {
      nextStatus = this.transportStatus;
    } else if (this.hasHistory) {
      nextStatus = 'historical';
    }
    this.setSnapshot({ status: nextStatus, error: null });
  }

  private handleTransportStateEvent(
    event: Extract<ChartWebSocketEvent<TMessage>, { type: 'state' }>
  ): void {
    if (event.state === 'paused' || event.state === 'offline') {
      this.transportStatus = event.state;
      this.pendingReadyGeneration = null;
      this.abortSynchronization();
      this.setSnapshot({ status: event.state, error: null });
      return;
    }
    if (event.state === 'reconnecting') {
      this.transportStatus = 'reconnecting';
      this.pendingReadyGeneration = null;
      this.abortSynchronization();
      this.setSnapshot({ status: 'reconnecting', error: event.error });
      return;
    }
    if (event.state === 'connecting') {
      this.handleConnectingState();
    }
  }

  private handleSocketEvent = (event: ChartWebSocketEvent<TMessage>): void => {
    if (!this.active || this.disposed || this.terminal) {
      return;
    }
    if (event.type === 'message') {
      this.handleMarketMessage(event);
      return;
    }
    if (event.type === 'ready') {
      this.handleReadyEvent(event);
      return;
    }
    this.handleTransportStateEvent(event);
  };

  private subscribeToLiveData(): void {
    if (!this.active || this.disposed || this.terminal) {
      return;
    }
    this.unsubscribeLive();
    this.unsubscribeLive = this.options.websocketClient.subscribe(
      this.topic,
      this.handleSocketEvent
    );
  }
}

export class ChartDataController<
  TTicker extends { symbol: string } = BinanceTicker,
  TInterval extends string = BinanceInterval,
  TMessage = BinanceMarketMessage,
> {
  private readonly cacheSize: number;
  private readonly sessionOptions: SessionOptions<TInterval, TMessage>;
  private readonly sessions = new Map<
    string,
    ChartDataSession<TInterval, TMessage>
  >();
  private activeKey: string | null = null;
  private handover: {
    fromKey: string;
    toKey: string;
    removeListener: () => void;
  } | null = null;

  constructor(options: ChartDataControllerOptions<TInterval, TMessage> = {}) {
    this.cacheSize = Math.max(
      1,
      Math.floor(options.cacheSize ?? DEFAULT_CACHE_SIZE)
    );
    this.sessionOptions = {
      maxCachedCandles: Math.max(
        1,
        Math.floor(options.maxCachedCandles ?? DEFAULT_MAX_CACHED_CANDLES)
      ),
      charts: options.charts ?? TradingCharts,
      websocketClient:
        options.websocketClient ??
        (binanceWebSocketClient as WebSocketClient<TMessage>),
      fetchKlines:
        options.fetchKlines ??
        (fetchSpotKlinesWithRetry as FetchKlines<TInterval>),
      topicFor:
        options.topicFor ??
        ((symbol, interval) =>
          klineTopic(symbol, interval as unknown as BinanceInterval)),
      chartIdFor:
        options.chartIdFor ??
        ((symbol, interval) =>
          chartIdFor(symbol, interval as unknown as BinanceInterval)),
      sessionKeyFor:
        options.sessionKeyFor ??
        ((symbol, interval) =>
          chartSessionKey(symbol, interval as unknown as BinanceInterval)),
      parseMarketMessage:
        options.parseMarketMessage ??
        ((message) =>
          parseKlineMarketMessage(message as unknown as BinanceMarketMessage)),
      isNoDataError:
        options.isNoDataError ??
        ((error) => error instanceof BinanceNoDataError),
    };
  }

  prepare(ticker: TTicker, interval: TInterval): string {
    const session = this.getOrCreate(ticker.symbol, interval);
    session.prepare();
    this.evictIfNeeded(session.key);
    return session.chartId;
  }

  activate(ticker: TTicker, interval: TInterval): string {
    const key = this.sessionOptions.sessionKeyFor(ticker.symbol, interval);
    const session = this.getOrCreate(ticker.symbol, interval);
    if (this.activeKey === key) {
      session.activate();
      this.evictIfNeeded(key);
      return session.chartId;
    }

    const previousKey = this.activeKey;
    const interruptedHandover = this.detachHandoverListener();
    this.activeKey = key;

    // Keep the existing topic alive until the replacement interval is
    // acknowledged and synchronized by the active provider connector.
    session.activate();

    const obsoleteKey = interruptedHandover?.fromKey;
    if (
      obsoleteKey != null &&
      obsoleteKey !== key &&
      obsoleteKey !== previousKey
    ) {
      this.sessions.get(obsoleteKey)?.deactivate();
    }
    if (previousKey != null) {
      this.startHandover(previousKey, key, session);
    }
    this.evictIfNeeded(key);
    return session.chartId;
  }

  deactivate(): void {
    const activeKey = this.activeKey;
    const handover = this.detachHandoverListener();
    if (activeKey == null && handover == null) {
      return;
    }
    this.activeKey = null;
    if (activeKey != null) {
      this.sessions.get(activeKey)?.deactivate();
    }
    if (handover != null && handover.fromKey !== activeKey) {
      this.sessions.get(handover.fromKey)?.deactivate();
    }
  }

  retry(ticker: TTicker, interval: TInterval): void {
    this.getOrCreate(ticker.symbol, interval).retry();
  }

  loadOlder(ticker: TTicker, interval: TInterval): void {
    this.getOrCreate(ticker.symbol, interval).loadOlder();
  }

  subscribe(
    ticker: TTicker,
    interval: TInterval,
    listener: () => void
  ): () => void {
    return (
      this.sessions
        .get(this.sessionOptions.sessionKeyFor(ticker.symbol, interval))
        ?.subscribe(listener) ?? (() => undefined)
    );
  }

  getSnapshot(ticker: TTicker, interval: TInterval): ChartConnectionSnapshot {
    return (
      this.sessions
        .get(this.sessionOptions.sessionKeyFor(ticker.symbol, interval))
        ?.getSnapshot() ?? EMPTY_SNAPSHOT
    );
  }

  private getOrCreate(
    symbol: string,
    interval: TInterval
  ): ChartDataSession<TInterval, TMessage> {
    const key = this.sessionOptions.sessionKeyFor(symbol, interval);
    const existing = this.sessions.get(key);
    if (existing != null) {
      this.sessions.delete(key);
      this.sessions.set(key, existing);
      return existing;
    }
    const session = new ChartDataSession<TInterval, TMessage>(
      symbol,
      interval,
      this.sessionOptions
    );
    this.sessions.set(key, session);
    return session;
  }

  private startHandover(
    fromKey: string,
    toKey: string,
    session: ChartDataSession<TInterval, TMessage>
  ): void {
    const completeIfSettled = () => {
      if (
        this.activeKey !== toKey ||
        this.handover?.fromKey !== fromKey ||
        this.handover.toKey !== toKey ||
        !session.isLiveActivationSettled()
      ) {
        return;
      }
      const handover = this.detachHandoverListener();
      if (handover != null && handover.fromKey !== toKey) {
        this.sessions.get(handover.fromKey)?.deactivate();
      }
      this.evictIfNeeded(toKey);
    };

    this.handover = {
      fromKey,
      toKey,
      removeListener: session.subscribe(completeIfSettled),
    };
    completeIfSettled();
  }

  private detachHandoverListener(): {
    fromKey: string;
    toKey: string;
    removeListener: () => void;
  } | null {
    const handover = this.handover;
    this.handover = null;
    handover?.removeListener();
    return handover;
  }

  private evictIfNeeded(protectedKey: string): void {
    while (this.sessions.size > this.cacheSize) {
      const candidate = [...this.sessions.entries()].find(
        ([key]) =>
          key !== this.activeKey &&
          key !== this.handover?.fromKey &&
          key !== protectedKey
      );
      if (candidate == null) {
        return;
      }
      const [key, session] = candidate;
      this.sessions.delete(key);
      session.dispose();
    }
  }
}

export const chartDataController = new ChartDataController();

function hyperliquidChartIdFor(
  symbol: string,
  interval: HyperliquidInterval
): string {
  const safeSymbol = symbol.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `hyperliquid-perp-${safeSymbol}-${interval}`;
}

export const hyperliquidChartDataController = new ChartDataController<
  HyperliquidTicker,
  HyperliquidInterval,
  HyperliquidMarketMessage
>({
  maxCachedCandles: 6_000,
  websocketClient: hyperliquidWebSocketClient,
  fetchKlines: fetchHyperliquidCandlesWithRetry,
  topicFor: hyperliquidCandleTopic,
  chartIdFor: hyperliquidChartIdFor,
  sessionKeyFor: (symbol, interval) => `hyperliquid:${symbol}:${interval}`,
  parseMarketMessage: parseHyperliquidCandleMarketMessage,
  isNoDataError: (error) => error instanceof HyperliquidNoDataError,
});

export { hyperliquidChartIdFor };
