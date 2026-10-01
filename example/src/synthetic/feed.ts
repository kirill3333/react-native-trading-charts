import {
  type OhlcCandle,
  type TradeEvent,
  type TradingCharts,
} from 'react-native-trading-charts';

import {
  extendAllTimeExtremes,
  type AllTimeExtremes,
} from '../allTimeExtremes';
import { SyntheticGenerator } from './generator';
import { type SyntheticSettings } from './settings';

export type SyntheticFeedApi = Pick<
  typeof TradingCharts,
  'setHistory' | 'updateTrades'
>;

export type SyntheticFeedSnapshot = {
  candleCount: number;
  lastPrice: number;
  allTimeExtremes: AllTimeExtremes | null;
  status: 'loading' | 'live' | 'paused' | 'error';
  error: string | null;
};

export function initialSyntheticSnapshot(
  settings: SyntheticSettings
): SyntheticFeedSnapshot {
  return {
    candleCount: 0,
    lastPrice: settings.minPrice + (settings.maxPrice - settings.minPrice) / 2,
    allTimeExtremes: null,
    status: 'loading',
    error: null,
  };
}

const HISTORY_CHUNK_SIZE = 1_000;
const PUMP_INTERVAL_MS = 20;
const PUBLISH_INTERVAL_MS = 100;

export class SyntheticFeed {
  private readonly generator: SyntheticGenerator;
  private history: OhlcCandle[] = [];
  private snapshot: SyntheticFeedSnapshot;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private disposed = false;
  private ready = false;
  private startedAt = 0;
  private epoch = 0;
  private sent = 0;
  private lastTimestamp = 0;
  private lastBucket = 0;
  private lastPublishedAt = 0;

  constructor(
    private readonly chartId: string,
    private readonly settings: SyntheticSettings,
    private readonly charts: SyntheticFeedApi,
    private readonly publish: (snapshot: SyntheticFeedSnapshot) => void,
    random: () => number = Math.random
  ) {
    this.generator = new SyntheticGenerator(settings, random);
    this.snapshot = initialSyntheticSnapshot(settings);
  }

  setActive(active: boolean) {
    if (
      this.disposed ||
      this.active === active ||
      this.snapshot.status === 'error'
    )
      return;
    this.active = active;
    this.cancelTimer();
    if (this.ready) {
      this.snapshot = { ...this.snapshot, status: active ? 'live' : 'paused' };
      this.publish(this.snapshot);
    }
    if (!active) return;
    this.startedAt = performance.now();
    this.lastPublishedAt = this.startedAt;
    this.epoch = Math.max(Date.now(), this.lastTimestamp);
    this.sent = 0;
    this.schedule(this.ready ? PUMP_INTERVAL_MS : 0);
  }

  dispose() {
    this.disposed = true;
    this.cancelTimer();
    this.history = [];
  }

  private cancelTimer() {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delay: number) {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.active || this.disposed) return;
      try {
        if (this.ready) this.pump();
        else this.prepareHistory();
      } catch (cause) {
        this.history = [];
        this.snapshot = {
          ...this.snapshot,
          status: 'error',
          error:
            cause instanceof Error ? cause.message : 'Could not generate data',
        };
        this.publish(this.snapshot);
      }
    }, delay);
  }

  private prepareHistory() {
    const end = Math.min(
      this.history.length + HISTORY_CHUNK_SIZE,
      this.settings.candleCount
    );
    while (this.history.length < end) {
      this.history.push(this.generator.nextCandle(this.history.length * 1_000));
    }
    if (this.history.length < this.settings.candleCount) {
      this.schedule(0);
      return;
    }
    const now = Date.now();
    this.lastBucket = Math.floor(now / 1_000) * 1_000;
    const offset = this.lastBucket - (this.history.length - 1) * 1_000;
    for (const candle of this.history) candle.timestamp += offset;
    this.charts.setHistory(this.chartId, this.history);
    this.snapshot = {
      candleCount: this.history.length,
      lastPrice: this.history.at(-1)?.close ?? this.snapshot.lastPrice,
      allTimeExtremes: extendAllTimeExtremes(null, this.history),
      status: 'live',
      error: null,
    };
    this.history = [];
    this.ready = true;
    this.lastTimestamp = now;
    this.epoch = now;
    this.startedAt = performance.now();
    this.lastPublishedAt = this.startedAt;
    this.publish(this.snapshot);
    this.schedule(PUMP_INTERVAL_MS);
  }

  private pump() {
    const now = performance.now();
    const due = Math.floor(
      ((now - this.startedAt) * this.settings.eventsPerSecond) / 1_000
    );
    const trades: TradeEvent[] = [];
    // Bound catch-up work after a stalled JS thread to one second of events.
    this.sent = Math.max(this.sent, due - this.settings.eventsPerSecond);
    while (this.sent < due) {
      this.sent += 1;
      const timestamp =
        this.epoch +
        Math.floor((this.sent * 1_000) / this.settings.eventsPerSecond);
      trades.push(this.generator.nextTrade(timestamp));
    }
    if (trades.length > 0) {
      this.charts.updateTrades(this.chartId, trades);
      this.recordTrades(trades);
    }
    if (now - this.lastPublishedAt >= PUBLISH_INTERVAL_MS) {
      this.publish(this.snapshot);
      this.lastPublishedAt = now;
    }
    this.schedule(PUMP_INTERVAL_MS);
  }

  private recordTrades(trades: ReadonlyArray<TradeEvent>) {
    let { candleCount, lastPrice } = this.snapshot;
    let high = this.snapshot.allTimeExtremes?.high ?? -Infinity;
    let low = this.snapshot.allTimeExtremes?.low ?? Infinity;
    for (const trade of trades) {
      const bucket = Math.floor(trade.timestamp / 1_000) * 1_000;
      if (bucket > this.lastBucket) candleCount += 1;
      this.lastBucket = bucket;
      this.lastTimestamp = trade.timestamp;
      lastPrice = trade.price;
      high = Math.max(high, trade.price);
      low = Math.min(low, trade.price);
    }
    const previous = this.snapshot.allTimeExtremes;
    const allTimeExtremes =
      previous?.high === high && previous.low === low
        ? previous
        : { high, low };
    this.snapshot = {
      ...this.snapshot,
      candleCount,
      lastPrice,
      allTimeExtremes,
    };
  }
}
