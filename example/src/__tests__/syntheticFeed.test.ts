import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import { SyntheticGenerator } from '../synthetic/generator';
import {
  SyntheticFeed,
  type SyntheticFeedApi,
  type SyntheticFeedSnapshot,
} from '../synthetic/feed';
import {
  DEFAULT_SYNTHETIC_SETTINGS,
  validateSyntheticSettings,
  type SyntheticSettings,
} from '../synthetic/settings';
import { useSyntheticSettingsStore } from '../stores/syntheticSettingsStore';

const NOW = 1_800_000_000_000;

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
}

function createSession(patch: Partial<SyntheticSettings> = {}) {
  const settings = { ...DEFAULT_SYNTHETIC_SETTINGS, candleCount: 5, ...patch };
  const charts = {
    setHistory: jest.fn<SyntheticFeedApi['setHistory']>(),
    updateTrades: jest.fn<SyntheticFeedApi['updateTrades']>(),
  };
  const publish = jest.fn<(snapshot: SyntheticFeedSnapshot) => void>();
  const feed = new SyntheticFeed(
    'synthetic-test',
    settings,
    charts,
    publish,
    () => 0.25
  );
  return { feed, charts, publish };
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('synthetic generation', () => {
  it.each([0, 25, 50, 75, 100])(
    'keeps OHLCV valid at intensity %i',
    (intensity) => {
      const generator = new SyntheticGenerator(
        { ...DEFAULT_SYNTHETIC_SETTINGS, intensity },
        seededRandom(42)
      );
      for (let index = 0; index < 100; index += 1) {
        const candle = generator.nextCandle(index * 1_000);
        expect(candle.timestamp).toBe(index * 1_000);
        expect(candle.low).toBeGreaterThanOrEqual(90);
        expect(candle.high).toBeLessThanOrEqual(110);
        expect(candle.open).toBeGreaterThanOrEqual(candle.low);
        expect(candle.open).toBeLessThanOrEqual(candle.high);
        expect(candle.close).toBeGreaterThanOrEqual(candle.low);
        expect(candle.close).toBeLessThanOrEqual(candle.high);
        expect(candle.volume).toBeGreaterThan(0);
      }
    }
  );

  it('has a constant midpoint at zero and exact alternating limits at 100', () => {
    const flat = new SyntheticGenerator({
      ...DEFAULT_SYNTHETIC_SETTINGS,
      intensity: 0,
    });
    expect(Array.from({ length: 8 }, () => flat.nextPrice())).toEqual(
      Array(8).fill(100)
    );
    const jumping = new SyntheticGenerator({
      ...DEFAULT_SYNTHETIC_SETTINGS,
      intensity: 100,
    });
    expect(Array.from({ length: 6 }, () => jumping.nextPrice())).toEqual([
      90, 110, 90, 110, 90, 110,
    ]);
  });

  it.each([1, 42, 12_345])(
    'generates connected trends, pullbacks and varied candle sizes with seed %i',
    (seed) => {
      const generator = new SyntheticGenerator(
        DEFAULT_SYNTHETIC_SETTINGS,
        seededRandom(seed)
      );
      const candles = Array.from({ length: 1_000 }, (_, index) =>
        generator.nextCandle(index * 1_000)
      );
      for (let index = 1; index < candles.length; index += 1) {
        expect(candles[index]!.open).toBe(candles[index - 1]!.close);
      }
      const window = candles.slice(-120);
      const range =
        Math.max(...window.map((candle) => candle.high)) -
        Math.min(...window.map((candle) => candle.low));
      const averageCandleRange =
        window.reduce((sum, candle) => sum + candle.high - candle.low, 0) /
        window.length;
      // A price path should travel over time rather than fill the same band in every candle.
      expect(range).toBeGreaterThan(averageCandleRange * 5);
      expect(window.some((candle) => candle.close > candle.open)).toBe(true);
      expect(window.some((candle) => candle.close < candle.open)).toBe(true);
      const tenSecondMoves = window
        .slice(10)
        .map((candle, index) => candle.close - window[index]!.close);
      expect(Math.max(...tenSecondMoves)).toBeGreaterThan(
        averageCandleRange * 2
      );
      expect(Math.min(...tenSecondMoves)).toBeLessThan(-averageCandleRange * 2);
      const lastClose = candles.at(-1)!.close;
      expect(
        Math.abs(generator.nextTrade(1_000_000).price - lastClose)
      ).toBeLessThan(0.5);
    }
  );

  it.each([1, 10, 1_000])(
    'matches history volume to %i live events per second',
    (eventsPerSecond) => {
      const generator = new SyntheticGenerator(
        { ...DEFAULT_SYNTHETIC_SETTINGS, intensity: 0, eventsPerSecond },
        () => 0.5
      );
      const candle = generator.nextCandle(0);
      let liveVolume = 0;
      for (let index = 0; index < eventsPerSecond; index += 1) {
        liveVolume +=
          generator.nextTrade(
            1_000 + Math.floor((index * 1_000) / eventsPerSecond)
          ).size ?? 0;
      }
      expect(liveVolume).toBeCloseTo(candle.volume!, 8);
    }
  );

  it('keeps one-second history independent of live event rate', () => {
    const slow = new SyntheticGenerator(
      { ...DEFAULT_SYNTHETIC_SETTINGS, eventsPerSecond: 1 },
      seededRandom(42)
    );
    const fast = new SyntheticGenerator(
      { ...DEFAULT_SYNTHETIC_SETTINGS, eventsPerSecond: 1_000 },
      seededRandom(42)
    );
    for (let index = 0; index < 100; index += 1) {
      expect(slow.nextCandle(index * 1_000)).toEqual(
        fast.nextCandle(index * 1_000)
      );
    }
  });

  it('does not overflow for large finite price bounds', () => {
    const generator = new SyntheticGenerator({
      ...DEFAULT_SYNTHETIC_SETTINGS,
      minPrice: 1e308,
      maxPrice: 1.7e308,
    });
    expect(Number.isFinite(generator.nextPrice())).toBe(true);
  });
});

describe('synthetic feed', () => {
  it('loads the exact history ending in the current second', () => {
    const { feed, charts, publish } = createSession();
    feed.setActive(true);
    jest.advanceTimersByTime(0);
    const history = charts.setHistory.mock.calls[0]?.[1];
    expect(history).toHaveLength(5);
    expect(history?.map((candle) => candle.timestamp)).toEqual([
      NOW - 4_000,
      NOW - 3_000,
      NOW - 2_000,
      NOW - 1_000,
      NOW,
    ]);
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ candleCount: 5, status: 'live' })
    );
    feed.dispose();
  });

  it.each([10, 1_000])(
    'sends %i trades per second and publishes at most 10 updates',
    (eventsPerSecond) => {
      const { feed, charts, publish } = createSession({ eventsPerSecond });
      feed.setActive(true);
      jest.advanceTimersByTime(0);
      publish.mockClear();
      jest.advanceTimersByTime(1_000);
      const trades = charts.updateTrades.mock.calls.flatMap((call) => call[1]);
      expect(trades).toHaveLength(eventsPerSecond);
      expect(trades.at(-1)?.timestamp).toBe(NOW + 1_000);
      expect(
        trades.every(
          (trade, index) =>
            index === 0 || trade.timestamp >= trades[index - 1]!.timestamp
        )
      ).toBe(true);
      expect(charts.updateTrades.mock.calls.length).toBeLessThanOrEqual(50);
      expect(publish).toHaveBeenCalledTimes(10);
      expect(publish).toHaveBeenLastCalledWith(
        expect.objectContaining({ candleCount: 6 })
      );
      feed.dispose();
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  it('updates the current candle before counting a new second and tracks extremes', () => {
    const { feed, publish } = createSession({ intensity: 100 });
    feed.setActive(true);
    jest.advanceTimersByTime(500);
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        candleCount: 5,
        allTimeExtremes: { low: 90, high: 110 },
      })
    );
    jest.advanceTimersByTime(500);
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ candleCount: 6 })
    );
    feed.dispose();
  });

  it('pauses without catch-up or filling missing candles on resume', () => {
    const { feed, charts, publish } = createSession();
    feed.setActive(true);
    jest.advanceTimersByTime(500);
    feed.setActive(false);
    expect(jest.getTimerCount()).toBe(0);
    charts.updateTrades.mockClear();
    jest.advanceTimersByTime(60_000);
    expect(charts.updateTrades).not.toHaveBeenCalled();
    feed.setActive(true);
    jest.advanceTimersByTime(100);
    expect(
      charts.updateTrades.mock.calls.flatMap((call) => call[1])
    ).toHaveLength(1);
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ candleCount: 6, status: 'live' })
    );
    expect(charts.setHistory).toHaveBeenCalledTimes(1);
    feed.dispose();
  });

  it('keeps timestamps monotonic after a system clock correction', () => {
    const { feed, charts } = createSession();
    feed.setActive(true);
    jest.advanceTimersByTime(500);
    feed.setActive(false);
    jest.setSystemTime(NOW - 60_000);
    feed.setActive(true);
    jest.advanceTimersByTime(100);
    const trades = charts.updateTrades.mock.calls.flatMap((call) => call[1]);
    expect(trades.at(-1)?.timestamp).toBe(NOW + 600);
    feed.dispose();
  });

  it('prepares large histories in cancellable chunks and discards stale sessions', () => {
    const old = createSession({ candleCount: 100_000 });
    old.feed.setActive(true);
    jest.advanceTimersByTime(0);
    expect(old.charts.setHistory).not.toHaveBeenCalled();
    old.feed.dispose();
    const next = createSession({ candleCount: 1 });
    next.feed.setActive(true);
    jest.advanceTimersByTime(100);
    expect(old.charts.setHistory).not.toHaveBeenCalled();
    expect(old.charts.updateTrades).not.toHaveBeenCalled();
    expect(next.charts.setHistory.mock.calls[0]?.[1]).toHaveLength(1);
    next.feed.dispose();
  });

  it('finishes 100,000 candles and anchors them to completion time', () => {
    const { feed, charts } = createSession({ candleCount: 100_000 });
    feed.setActive(true);
    jest.advanceTimersByTime(0);
    feed.setActive(false);
    jest.advanceTimersByTime(5_000);
    expect(charts.setHistory).not.toHaveBeenCalled();
    feed.setActive(true);
    jest.advanceTimersByTime(200);
    const history = charts.setHistory.mock.calls[0]?.[1];
    expect(history).toHaveLength(100_000);
    expect(history?.at(-1)?.timestamp).toBe(NOW + 5_000);
    feed.dispose();
  });

  it('reports bridge failures and stops scheduling', () => {
    const { feed, charts, publish } = createSession();
    charts.setHistory.mockImplementation(() => {
      throw new Error('History rejected');
    });
    feed.setActive(true);
    jest.advanceTimersByTime(1_000);
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error', error: 'History rejected' })
    );
    expect(charts.updateTrades).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    feed.dispose();
  });
});

describe('synthetic settings', () => {
  it('defaults to 1,000 candles and 10 events per second', () => {
    expect(DEFAULT_SYNTHETIC_SETTINGS).toEqual({
      candleCount: 1_000,
      minPrice: 90,
      maxPrice: 110,
      intensity: 50,
      eventsPerSecond: 10,
    });
    expect(validateSyntheticSettings(DEFAULT_SYNTHETIC_SETTINGS)).toEqual({});
  });

  it.each([
    { candleCount: 0 },
    { candleCount: 100_001 },
    { candleCount: 1.5 },
    { minPrice: 0 },
    { minPrice: NaN },
    { maxPrice: Infinity },
    { maxPrice: 89 },
    { maxPrice: 90 },
    { intensity: -1 },
    { intensity: 101 },
    { intensity: 1.5 },
    { eventsPerSecond: 0 },
    { eventsPerSecond: 1_001 },
    { eventsPerSecond: 1.5 },
  ])('rejects invalid settings %j', (patch) => {
    expect(
      Object.keys(
        validateSyntheticSettings({ ...DEFAULT_SYNTHETIC_SETTINGS, ...patch })
      )
    ).not.toHaveLength(0);
  });

  it('applies atomically and creates a new session even with identical values', () => {
    const store = useSyntheticSettingsStore.getState();
    store.applySettings(DEFAULT_SYNTHETIC_SETTINGS);
    const first = useSyntheticSettingsStore.getState().settings;
    store.applySettings(first);
    expect(useSyntheticSettingsStore.getState().settings).toEqual(first);
    expect(useSyntheticSettingsStore.getState().settings).not.toBe(first);
    expect(() => store.applySettings({ ...first, candleCount: 0 })).toThrow(
      TypeError
    );
    expect(useSyntheticSettingsStore.getState().settings).toEqual(first);
  });
});
