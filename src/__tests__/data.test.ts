import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resolveChartConfig } from '../config';
import {
  createTradeBatcher,
  mockNativeModule,
  TradingCharts,
} from '../__fixtures__/tradingCharts';

describe('market data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('packs history as OHLCV doubles', () => {
    TradingCharts.setHistory('main', [
      { timestamp: 0, open: 10, high: 12, low: 9, close: 11 },
      { timestamp: 60_000, open: 11, high: 13, low: 10, close: 12, volume: 4 },
    ]);

    expect(mockNativeModule.setHistory).toHaveBeenCalledWith(
      'main',
      [0, 10, 12, 9, 11, 0, 60_000, 11, 13, 10, 12, 4]
    );
  });

  it('packs older history for viewport-preserving prepends', () => {
    TradingCharts.prependHistory('main', [
      { timestamp: 0, open: 8, high: 10, low: 7, close: 9 },
      { timestamp: 60_000, open: 9, high: 11, low: 8, close: 10, volume: 3 },
    ]);

    expect(mockNativeModule.prependHistory).toHaveBeenCalledWith(
      'main',
      [0, 8, 10, 7, 9, 0, 60_000, 9, 11, 8, 10, 3]
    );
  });

  it.each(['setHistory', 'prependHistory'] as const)(
    '%s validates every slot before forwarding a history batch',
    (operation) => {
      const candle = { timestamp: 0, open: 1, high: 2, low: 0, close: 1 };
      const sparse = [candle];
      sparse.length = 2;
      expect(() => TradingCharts[operation]('chart', sparse)).toThrow(
        'candles[1]'
      );
      expect(() => TradingCharts[operation]('chart', [candle, candle])).toThrow(
        'strictly increasing'
      );
      expect(mockNativeModule[operation]).not.toHaveBeenCalled();
      TradingCharts[operation]('chart', []);
      expect(mockNativeModule[operation]).toHaveBeenCalledWith('chart', []);
    }
  );

  it('rejects unsorted or invalid candles', () => {
    expect(() =>
      TradingCharts.setHistory('main', [
        { timestamp: 10, open: 10, high: 12, low: 9, close: 11 },
        { timestamp: 5, open: 11, high: 13, low: 10, close: 12 },
      ])
    ).toThrow('strictly increasing');
    expect(() =>
      TradingCharts.updateCandle('main', {
        timestamp: 10,
        open: 10,
        high: 9,
        low: 8,
        close: 11,
      })
    ).toThrow('invalid OHLC');
  });

  it('packs single and batched trades', () => {
    TradingCharts.updateTrade('main', { timestamp: 100, price: 12, size: 3 });
    TradingCharts.updateTrades('main', [
      { timestamp: 101, price: 13 },
      { timestamp: 102, price: 11, size: 2 },
    ]);
    expect(mockNativeModule.updateTrade).toHaveBeenCalledWith(
      'main',
      [100, 12, 3]
    );
    expect(mockNativeModule.updateTrades).toHaveBeenCalledWith(
      'main',
      [101, 13, 0, 102, 11, 2]
    );
  });

  it('sets, removes, clears and reads price lines', async () => {
    TradingCharts.setPriceLine('chart', {
      id: 'all-time-high',
      price: 35_970,
      label: 'All Time High',
      color: '#FF9966',
    });
    expect(mockNativeModule.setPriceLine).toHaveBeenCalledWith(
      'chart',
      'all-time-high',
      35_970,
      'All Time High',
      '#FF9966'
    );

    TradingCharts.removePriceLine('chart', 'all-time-high');
    TradingCharts.clearPriceLines('chart');
    expect(mockNativeModule.removePriceLine).toHaveBeenCalledWith(
      'chart',
      'all-time-high'
    );
    expect(mockNativeModule.clearPriceLines).toHaveBeenCalledWith('chart');

    mockNativeModule.getPriceLines.mockResolvedValueOnce(
      JSON.stringify([
        {
          id: 'migration',
          price: 42_570,
          label: 'Migration Market Cap',
          color: '#009F85CC',
        },
      ])
    );
    await expect(TradingCharts.getPriceLines('chart')).resolves.toEqual([
      {
        id: 'migration',
        price: 42_570,
        label: 'Migration Market Cap',
        color: '#009F85CC',
      },
    ]);
  });

  it('validates price-line inputs and native getter payloads', async () => {
    const valid = {
      id: 'line',
      price: 10,
      label: 'Target',
      color: '#00AAFF',
    };
    expect(() => TradingCharts.setPriceLine('', valid)).toThrow('chartId');
    expect(() =>
      TradingCharts.setPriceLine('chart', { ...valid, id: ' ' })
    ).toThrow('priceLine.id');
    expect(() =>
      TradingCharts.setPriceLine('chart', { ...valid, price: Number.NaN })
    ).toThrow('priceLine.price');
    expect(() =>
      TradingCharts.setPriceLine('chart', { ...valid, label: ' ' })
    ).toThrow('priceLine.label');
    expect(() =>
      TradingCharts.setPriceLine('chart', { ...valid, color: 'red' })
    ).toThrow('priceLine.color');
    expect(() => TradingCharts.removePriceLine('chart', ' ')).toThrow(
      'priceLineId'
    );
    expect(() => TradingCharts.clearPriceLines('')).toThrow('chartId');

    mockNativeModule.getPriceLines.mockResolvedValueOnce('{}');
    await expect(TradingCharts.getPriceLines('chart')).rejects.toThrow(
      'must be an array'
    );
  });

  it('packs homogeneous OHLC and histogram series data', () => {
    TradingCharts.setSeriesData('chart', 'comparison', [
      { timestamp: 0, open: 10, high: 12, low: 9, close: 11, volume: 2 },
    ]);
    TradingCharts.setSeriesData('chart', 'momentum', [
      { timestamp: 0, value: -2 },
      { timestamp: 60_000, value: 3 },
    ]);

    expect(mockNativeModule.setSeriesData).toHaveBeenNthCalledWith(
      1,
      'chart',
      'comparison',
      'ohlc',
      [0, 10, 12, 9, 11, 2]
    );
    expect(mockNativeModule.setSeriesData).toHaveBeenNthCalledWith(
      2,
      'chart',
      'momentum',
      'histogram',
      [0, -2, 60_000, 3]
    );
    expect(() =>
      TradingCharts.setSeriesData('chart', 'mixed', [
        { timestamp: 0, value: 1 },
        { timestamp: 60_000, open: 1, high: 2, low: 0, close: 1 },
      ])
    ).toThrow('homogeneous');
  });

  it('batches trades through createTradeBatcher', () => {
    jest.useFakeTimers();
    try {
      const batcher = createTradeBatcher('main', { intervalMs: 16 });
      batcher.add({ timestamp: 100, price: 12, size: 3 });
      batcher.add({ timestamp: 101, price: 13 });
      expect(mockNativeModule.updateTrades).not.toHaveBeenCalled();

      jest.advanceTimersByTime(16);
      expect(mockNativeModule.updateTrades).toHaveBeenCalledTimes(1);
      expect(mockNativeModule.updateTrades).toHaveBeenCalledWith(
        'main',
        [100, 12, 3, 101, 13, 0]
      );

      expect(() => batcher.add({ timestamp: 99, price: 11 })).toThrow(
        'non-decreasing'
      );
      batcher.add({ timestamp: 102, price: 14 });
      batcher.flush();
      expect(mockNativeModule.updateTrades).toHaveBeenCalledTimes(2);

      batcher.add({ timestamp: 103, price: 15 });
      batcher.dispose();
      jest.advanceTimersByTime(100);
      expect(mockNativeModule.updateTrades).toHaveBeenCalledTimes(2);
      expect(() => batcher.add({ timestamp: 104, price: 16 })).toThrow(
        'disposed'
      );

      const invalid = createTradeBatcher('main');
      expect(() => invalid.add({ timestamp: -1, price: 1 })).toThrow();
      expect(() =>
        TradingCharts.updateTrades('main', [
          { timestamp: 200, price: 1 },
          { timestamp: 199, price: 2 },
        ])
      ).toThrow('non-decreasing');
    } finally {
      jest.useRealTimers();
    }
  });

  it('validates createTradeBatcher options synchronously', () => {
    expect(() => createTradeBatcher('')).toThrow('chartId');
    expect(() => createTradeBatcher('main', { intervalMs: 0 })).toThrow(
      'intervalMs'
    );
    expect(() => createTradeBatcher('main', { intervalMs: 1.5 })).toThrow(
      'intervalMs'
    );
    expect(() => createTradeBatcher('main', { intervalMs: NaN })).toThrow(
      'intervalMs'
    );
    expect(() => createTradeBatcher('main', { intervalMs: Infinity })).toThrow(
      'intervalMs'
    );
  });

  it('reads and unpacks the current native candle store', async () => {
    mockNativeModule.getCandles.mockResolvedValue([
      0, 10, 12, 9, 11, 2, 60_000, 11, 14, 10, 13, 4,
    ]);

    await expect(TradingCharts.getCandles('main')).resolves.toEqual([
      { timestamp: 0, open: 10, high: 12, low: 9, close: 11, volume: 2 },
      {
        timestamp: 60_000,
        open: 11,
        high: 14,
        low: 10,
        close: 13,
        volume: 4,
      },
    ]);
    expect(mockNativeModule.getCandles).toHaveBeenCalledWith('main');
  });

  it('returns an empty candle array from a mounted empty chart', async () => {
    mockNativeModule.getCandles.mockResolvedValue([]);

    await expect(TradingCharts.getCandles('empty')).resolves.toEqual([]);
  });

  it('validates getCandles and forwards native rejections', async () => {
    await expect(TradingCharts.getCandles('')).rejects.toThrow(
      'chartId must be a non-empty string'
    );
    const error = Object.assign(new Error('Chart is not mounted'), {
      code: 'E_CHART_NOT_MOUNTED',
    });
    mockNativeModule.getCandles.mockRejectedValue(error);
    await expect(TradingCharts.getCandles('missing')).rejects.toMatchObject({
      code: 'E_CHART_NOT_MOUNTED',
    });

    mockNativeModule.getCandles.mockResolvedValue([0, 1]);
    await expect(TradingCharts.getCandles('invalid')).rejects.toThrow(
      'complete OHLCV records'
    );
  });

  it('resolves trading sessions and calendar exceptions', () => {
    const resolved = resolveChartConfig({
      chartId: 'nyse-hourly',
      resolution: { unit: 'hour' },
      tradeAggregation: {
        bucketOrigin: 'session',
        calendar: {
          timeZone: 'America/New_York',
          sessions: [
            {
              days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
              start: '09:30',
              end: '16:00',
            },
          ],
          holidays: ['2026-12-25'],
          overrides: [
            {
              date: '2026-11-27',
              sessions: [{ start: '09:30', end: '13:00' }],
            },
          ],
        },
      },
    });
    expect(resolved.tradeAggregation).toMatchObject({
      bucketOrigin: { type: 'session' },
      calendar: {
        timeZone: 'America/New_York',
        sessions: [
          {
            weekdays: [1, 2, 3, 4, 5],
            startSeconds: 34_200,
            endSeconds: 57_600,
            startDayOffset: 0,
            endDayOffset: 0,
          },
        ],
        holidays: ['2026-12-25'],
      },
    });
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-session',
        resolution: { unit: 'minute' },
        tradeAggregation: {
          calendar: {
            timeZone: 'UTC',
            sessions: [{ days: ['monday'], start: '25:00', end: '16:00' }],
          },
        },
      })
    ).toThrow('valid wall-clock time');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-time-zone',
        tradeAggregation: {
          calendar: { timeZone: 'Mars/Olympus_Mons' },
        },
      })
    ).toThrow('must be a valid IANA time zone');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-calendar-origin',
        resolution: { unit: 'month' },
        tradeAggregation: { bucketOrigin: 'session' },
      })
    ).toThrow('calendar resolutions');
  });
});
