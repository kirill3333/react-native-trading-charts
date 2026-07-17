import {
  TradingCharts,
  type OhlcCandle,
  type TradeEvent,
} from 'react-native-trading-charts';

import {
  BybitNoDataError,
  compareBybitTrades,
  fetchRecentSpotTradesWithRetry,
  fetchSpotKlinesWithRetry,
  klineTopic,
  parseKlineMarketMessage,
  parseTradeMarketMessage,
  tradeTopic,
  type BybitInterval,
  type BybitTicker,
  type BybitTrade,
} from './bybit';
import {
  bybitWebSocketClient,
  type BybitWebSocketEvent,
  type BybitWebSocketListener,
} from './bybitWebSocket';

const DEFAULT_CACHE_SIZE = 8;
const MAX_CACHED_CANDLES = 300;
const MAX_BUFFERED_TRADES = 50_000;

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
}>;

type TradingChartsApi = Pick<
  typeof TradingCharts,
  'clear' | 'setHistory' | 'updateCandle' | 'updateTrades'
>;

type WebSocketClient = {
  subscribe(topic: string, listener: BybitWebSocketListener): () => void;
  reportProtocolError(generation: number, error: unknown): void;
};

export type ChartDataControllerOptions = {
  cacheSize?: number;
  charts?: TradingChartsApi;
  websocketClient?: WebSocketClient;
  fetchKlines?: typeof fetchSpotKlinesWithRetry;
  fetchTrades?: typeof fetchRecentSpotTradesWithRetry;
};

type SessionOptions = Required<Omit<ChartDataControllerOptions, 'cacheSize'>>;

type TransportStatus = 'connecting' | 'reconnecting' | 'paused' | 'offline';

const EMPTY_SNAPSHOT: ChartConnectionSnapshot = Object.freeze({
  status: 'loading',
  error: null,
});

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown network error';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function toTradeEvents(trades: ReadonlyArray<BybitTrade>): TradeEvent[] {
  return trades.map((trade) => trade.event);
}

export function chartSessionKey(
  symbol: string,
  interval: BybitInterval
): string {
  return `${symbol}:${interval}`;
}

export function chartIdFor(symbol: string, interval: BybitInterval): string {
  return `bybit-spot-${symbol}-${interval}`;
}

class ChartDataSession {
  readonly chartId: string;
  readonly key: string;
  private readonly symbol: string;
  private readonly interval: BybitInterval;
  private readonly topic: string;
  private readonly options: SessionOptions;
  private readonly listeners = new Set<() => void>();
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
  private unsubscribeLive: () => void = () => undefined;
  private readonly tradeBuffers = new Map<number, Map<string, BybitTrade>>();
  private readonly candleBuffers = new Map<number, Map<number, OhlcCandle>>();
  private recentTradeIds = new Set<string>();
  private recentTradeIdQueue: string[] = [];
  private readonly tradesById = new Map<string, BybitTrade>();
  private readonly candlesByTimestamp = new Map<number, OhlcCandle>();

  constructor(
    symbol: string,
    interval: BybitInterval,
    options: SessionOptions
  ) {
    this.symbol = symbol;
    this.interval = interval;
    this.key = chartSessionKey(symbol, interval);
    this.chartId = chartIdFor(symbol, interval);
    this.topic =
      interval === '1s' ? tradeTopic(symbol) : klineTopic(symbol, interval);
    this.options = options;
  }

  getSnapshot = (): ChartConnectionSnapshot => this.snapshot;

  isLiveActivationSettled(): boolean {
    return this.snapshot.status === 'live' || this.terminal;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
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
    this.unsubscribeLive();
    this.unsubscribeLive = () => undefined;
    this.synchronizedGeneration = null;
    this.tradeBuffers.clear();
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

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.deactivate();
    this.disposed = true;
    this.initialController?.abort();
    this.initialController = null;
    this.listeners.clear();
    this.options.charts.clear(this.chartId);
  }

  private setSnapshot(next: ChartConnectionSnapshot): void {
    if (
      this.snapshot.status === next.status &&
      this.snapshot.error === next.error
    ) {
      return;
    }
    this.snapshot = Object.freeze(next);
    this.listeners.forEach((listener) => listener());
  }

  private abortSynchronization(): void {
    this.synchronizationController?.abort();
    this.synchronizationController = null;
    this.activeGeneration = null;
  }

  private rememberTrade(trade: BybitTrade): boolean {
    if (this.recentTradeIds.has(trade.id)) {
      return false;
    }
    this.recentTradeIds.add(trade.id);
    this.recentTradeIdQueue.push(trade.id);
    this.tradesById.set(trade.id, trade);
    if (this.recentTradeIdQueue.length > MAX_BUFFERED_TRADES) {
      const expiredId = this.recentTradeIdQueue.shift();
      if (expiredId != null) {
        this.recentTradeIds.delete(expiredId);
        this.tradesById.delete(expiredId);
      }
    }
    return true;
  }

  private cacheCandles(candles: ReadonlyArray<OhlcCandle>): void {
    candles.forEach((candle) => {
      this.candlesByTimestamp.set(candle.timestamp, candle);
    });
    if (this.candlesByTimestamp.size <= MAX_CACHED_CANDLES) {
      return;
    }
    const timestamps = [...this.candlesByTimestamp.keys()].sort(
      (left, right) => left - right
    );
    timestamps
      .slice(0, timestamps.length - MAX_CACHED_CANDLES)
      .forEach((timestamp) => this.candlesByTimestamp.delete(timestamp));
  }

  private bufferTrades(generation: number, trades: BybitTrade[]): void {
    const buffer = this.tradeBuffers.get(generation) ?? new Map();
    trades.forEach((trade) => buffer.set(trade.id, trade));
    this.tradeBuffers.set(generation, buffer);
    if (buffer.size > MAX_BUFFERED_TRADES) {
      this.options.websocketClient.reportProtocolError(
        generation,
        new Error('Trade synchronization buffer exceeded 50,000 records')
      );
    }
  }

  private bufferCandles(generation: number, candles: OhlcCandle[]): void {
    const buffer = this.candleBuffers.get(generation) ?? new Map();
    candles.forEach((candle) => buffer.set(candle.timestamp, candle));
    this.candleBuffers.set(generation, buffer);
  }

  private replaceTrades(
    snapshot: ReadonlyArray<BybitTrade>,
    generation?: number
  ): void {
    const mergedById = new Map(
      snapshot.map((trade) => [trade.id, trade] as const)
    );
    if (generation != null) {
      for (const trade of this.tradeBuffers.get(generation)?.values() ?? []) {
        mergedById.set(trade.id, trade);
      }
    }
    const merged = [...mergedById.values()].sort(compareBybitTrades);
    this.tradesById.clear();
    this.recentTradeIds = new Set();
    this.recentTradeIdQueue = [];
    merged.forEach((trade) => this.rememberTrade(trade));
    this.options.charts.clear(this.chartId);
    this.options.charts.updateTrades(this.chartId, toTradeEvents(merged));
  }

  private replaceCandles(
    snapshot: ReadonlyArray<OhlcCandle>,
    generation?: number
  ): void {
    this.candlesByTimestamp.clear();
    this.cacheCandles(snapshot);
    this.options.charts.setHistory(this.chartId, snapshot);
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
    if (this.interval === '1s') {
      const trades = [...this.tradesById.values()].sort(compareBybitTrades);
      this.options.charts.clear(this.chartId);
      this.options.charts.updateTrades(this.chartId, toTradeEvents(trades));
      return;
    }
    const candles = [...this.candlesByTimestamp.values()].sort(
      (left, right) => left.timestamp - right.timestamp
    );
    this.options.charts.setHistory(this.chartId, candles);
  }

  private async loadInitialHistory(): Promise<void> {
    if (
      this.disposed ||
      this.hasHistory ||
      this.initialHistoryFailed ||
      this.initialController != null
    ) {
      return;
    }
    const controller = new AbortController();
    this.initialController = controller;
    this.setSnapshot({ status: 'loading', error: null });

    try {
      if (this.interval === '1s') {
        const snapshot = await this.options.fetchTrades(this.symbol, {
          signal: controller.signal,
        });
        if (
          this.disposed ||
          controller.signal.aborted ||
          this.initialController !== controller ||
          this.synchronizedGeneration != null
        ) {
          return;
        }
        this.replaceTrades(snapshot);
      } else {
        const snapshot = await this.options.fetchKlines(
          this.symbol,
          this.interval,
          { signal: controller.signal }
        );
        if (
          this.disposed ||
          controller.signal.aborted ||
          this.initialController !== controller ||
          this.synchronizedGeneration != null
        ) {
          return;
        }
        this.replaceCandles(snapshot);
      }
      this.initialController = null;
      this.hasHistory = true;
      this.setSnapshot({ status: 'historical', error: null });
      const generation = this.pendingReadyGeneration;
      this.pendingReadyGeneration = null;
      if (this.active && generation != null) {
        this.synchronize(generation).catch(() => undefined);
      }
    } catch (error) {
      if (
        this.disposed ||
        controller.signal.aborted ||
        this.initialController !== controller ||
        isAbortError(error)
      ) {
        return;
      }
      this.initialController = null;
      this.initialHistoryFailed = true;
      const generation = this.pendingReadyGeneration;
      this.pendingReadyGeneration = null;
      if (this.active && generation != null) {
        this.synchronize(generation).catch(() => undefined);
        return;
      }
      if (
        this.transportStatus !== 'offline' &&
        this.transportStatus !== 'paused'
      ) {
        this.setSnapshot({
          status: error instanceof BybitNoDataError ? 'no-data' : 'error',
          error: messageFromError(error),
        });
      }
    }
  }

  private handleMarketMessage(
    event: Extract<BybitWebSocketEvent, { type: 'message' }>
  ): void {
    if (!this.active || this.terminal || event.topic !== this.topic) {
      return;
    }
    try {
      if (this.interval === '1s') {
        const trades = parseTradeMarketMessage(event.message);
        if (this.synchronizedGeneration === event.generation) {
          const freshTrades = trades.filter((trade) =>
            this.rememberTrade(trade)
          );
          if (freshTrades.length > 0) {
            this.options.charts.updateTrades(
              this.chartId,
              toTradeEvents(freshTrades)
            );
          }
        } else {
          this.bufferTrades(event.generation, trades);
        }
      } else {
        const candles = parseKlineMarketMessage(event.message);
        if (this.synchronizedGeneration === event.generation) {
          candles.forEach((candle) => {
            this.cacheCandles([candle]);
            this.options.charts.updateCandle(this.chartId, candle);
          });
        } else {
          this.bufferCandles(event.generation, candles);
        }
      }
    } catch (error) {
      this.options.websocketClient.reportProtocolError(event.generation, error);
    }
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
    this.setSnapshot({
      status,
      error: null,
    });

    try {
      if (this.interval === '1s') {
        const snapshot = await this.options.fetchTrades(this.symbol, {
          signal: controller.signal,
        });
        if (
          !this.active ||
          this.disposed ||
          controller.signal.aborted ||
          this.activeGeneration !== generation
        ) {
          return;
        }
        this.replaceTrades(snapshot, generation);
      } else {
        const snapshot = await this.options.fetchKlines(
          this.symbol,
          this.interval,
          { signal: controller.signal }
        );
        if (
          !this.active ||
          this.disposed ||
          controller.signal.aborted ||
          this.activeGeneration !== generation
        ) {
          return;
        }
        this.replaceCandles(snapshot, generation);
      }

      this.synchronizationController = null;
      this.activeGeneration = null;
      this.synchronizedGeneration = generation;
      this.hasHistory = true;
      this.initialHistoryFailed = false;
      this.hadLiveData = true;
      this.tradeBuffers.clear();
      this.candleBuffers.clear();
      this.setSnapshot({ status: 'live', error: null });
    } catch (error) {
      if (
        !this.active ||
        this.disposed ||
        controller.signal.aborted ||
        this.activeGeneration !== generation ||
        isAbortError(error)
      ) {
        return;
      }
      this.synchronizationController = null;
      this.activeGeneration = null;
      this.terminal = true;
      this.unsubscribeLive();
      this.unsubscribeLive = () => undefined;
      this.setSnapshot({
        status: error instanceof BybitNoDataError ? 'no-data' : 'error',
        error: messageFromError(error),
      });
    }
  }

  private handleSocketEvent = (event: BybitWebSocketEvent): void => {
    if (!this.active || this.disposed || this.terminal) {
      return;
    }
    if (event.type === 'message') {
      this.handleMarketMessage(event);
      return;
    }
    if (event.type === 'ready') {
      if (event.topic === this.topic) {
        if (this.initialController != null && !this.hasHistory) {
          this.pendingReadyGeneration = event.generation;
        } else {
          this.synchronize(event.generation).catch(() => undefined);
        }
      }
      return;
    }

    if (event.state === 'paused' || event.state === 'offline') {
      this.transportStatus = event.state;
      this.pendingReadyGeneration = null;
      this.abortSynchronization();
      this.setSnapshot({ status: event.state, error: null });
    } else if (event.state === 'reconnecting') {
      this.transportStatus = 'reconnecting';
      this.pendingReadyGeneration = null;
      this.abortSynchronization();
      this.setSnapshot({ status: 'reconnecting', error: event.error });
    } else if (event.state === 'connecting') {
      this.transportStatus = this.hadLiveData ? 'reconnecting' : 'connecting';
      if (!this.hasHistory && !this.initialHistoryFailed) {
        this.loadInitialHistory().catch(() => undefined);
      }
      let status: ChartConnectionStatus = 'loading';
      if (this.hadLiveData) {
        status = this.transportStatus;
      } else if (this.hasHistory) {
        status = 'historical';
      }
      this.setSnapshot({
        status,
        error: null,
      });
    }
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

export class ChartDataController {
  private readonly cacheSize: number;
  private readonly sessionOptions: SessionOptions;
  private readonly sessions = new Map<string, ChartDataSession>();
  private activeKey: string | null = null;
  private handover: {
    fromKey: string;
    toKey: string;
    removeListener: () => void;
  } | null = null;

  constructor(options: ChartDataControllerOptions = {}) {
    this.cacheSize = Math.max(
      1,
      Math.floor(options.cacheSize ?? DEFAULT_CACHE_SIZE)
    );
    this.sessionOptions = {
      charts: options.charts ?? TradingCharts,
      websocketClient: options.websocketClient ?? bybitWebSocketClient,
      fetchKlines: options.fetchKlines ?? fetchSpotKlinesWithRetry,
      fetchTrades: options.fetchTrades ?? fetchRecentSpotTradesWithRetry,
    };
  }

  prepare(ticker: BybitTicker, interval: BybitInterval): string {
    const session = this.getOrCreate(ticker.symbol, interval);
    session.prepare();
    this.evictIfNeeded(session.key);
    return session.chartId;
  }

  activate(ticker: BybitTicker, interval: BybitInterval): string {
    const key = chartSessionKey(ticker.symbol, interval);
    const session = this.getOrCreate(ticker.symbol, interval);
    if (this.activeKey === key) {
      session.activate();
      this.evictIfNeeded(key);
      return session.chartId;
    }

    const previousKey = this.activeKey;
    const interruptedHandover = this.detachHandoverListener();
    this.activeKey = key;

    // Register the replacement topic before releasing the previous one. Bybit
    // supports dynamic subscriptions, so this keeps the physical socket open
    // while the new interval is acknowledged and synchronized.
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

  retry(ticker: BybitTicker, interval: BybitInterval): void {
    this.getOrCreate(ticker.symbol, interval).retry();
  }

  subscribe(
    ticker: BybitTicker,
    interval: BybitInterval,
    listener: () => void
  ): () => void {
    return (
      this.sessions
        .get(chartSessionKey(ticker.symbol, interval))
        ?.subscribe(listener) ?? (() => undefined)
    );
  }

  getSnapshot(
    ticker: BybitTicker,
    interval: BybitInterval
  ): ChartConnectionSnapshot {
    return (
      this.sessions
        .get(chartSessionKey(ticker.symbol, interval))
        ?.getSnapshot() ?? EMPTY_SNAPSHOT
    );
  }

  private getOrCreate(
    symbol: string,
    interval: BybitInterval
  ): ChartDataSession {
    const key = chartSessionKey(symbol, interval);
    const existing = this.sessions.get(key);
    if (existing != null) {
      this.sessions.delete(key);
      this.sessions.set(key, existing);
      return existing;
    }
    const session = new ChartDataSession(symbol, interval, this.sessionOptions);
    this.sessions.set(key, session);
    return session;
  }

  private startHandover(
    fromKey: string,
    toKey: string,
    session: ChartDataSession
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
