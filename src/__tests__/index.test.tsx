import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type TradingCharts as TradingChartsExport } from '../TradingCharts';
import {
  type resolveAdditionalSeriesOptions as resolveAdditionalSeriesOptionsExport,
  type resolveChartConfig as resolveChartConfigExport,
} from '../config';
import { selectedCandleFromNativeEvent } from '../events';
import { type createTradeBatcher as createTradeBatcherExport } from '../tradeBatcher';

const mockNativeModule = {
  setHistory: jest.fn(),
  prependHistory: jest.fn(),
  updateCandle: jest.fn(),
  updateTrade: jest.fn(),
  updateTrades: jest.fn(),
  addSeries: jest.fn(),
  setSeriesData: jest.fn(),
  prependSeriesData: jest.fn(),
  updateSeriesData: jest.fn(),
  removeSeries: jest.fn(),
  setPaneHeight: jest.fn(),
  getCandles: jest.fn<(chartId: string) => Promise<ReadonlyArray<number>>>(),
  zoom: jest.fn(),
  fitContent: jest.fn(),
  clear: jest.fn(),
};

jest.mock('../NativeTradingCharts', () => ({
  __esModule: true,
  default: mockNativeModule,
}));

const { TradingCharts } = require('../TradingCharts') as {
  TradingCharts: typeof TradingChartsExport;
};
const { resolveAdditionalSeriesOptions, resolveChartConfig } =
  require('../config') as {
    resolveAdditionalSeriesOptions: typeof resolveAdditionalSeriesOptionsExport;
    resolveChartConfig: typeof resolveChartConfigExport;
  };
const { createTradeBatcher } = require('../tradeBatcher') as {
  createTradeBatcher: typeof createTradeBatcherExport;
};

describe('TradingCharts data API', () => {
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

  it('validates series identifiers and reserved main operations', () => {
    expect(() =>
      TradingCharts.addSeries('chart', {
        seriesId: 'main',
        type: 'histogram',
        paneId: 'volume',
        priceScaleId: 'volume',
      })
    ).toThrow('reserved');
    expect(() => TradingCharts.removeSeries('chart', 'main')).toThrow(
      'reserved'
    );
    TradingCharts.setPaneHeight('chart', 'volume', 0.35);
    expect(mockNativeModule.setPaneHeight).toHaveBeenCalledWith(
      'chart',
      'volume',
      0.35
    );
  });

  it('resolves imperative addSeries options before sending them', () => {
    TradingCharts.addSeries('chart', {
      seriesId: 'momentum',
      type: 'histogram',
      paneId: 'indicator',
      priceScaleId: 'indicator',
      appearance: { color: '#FFAA00' },
    });
    expect(mockNativeModule.addSeries).toHaveBeenCalledTimes(1);
    const firstCall = mockNativeModule.addSeries.mock.calls[0]!;
    expect(firstCall[0]).toBe('chart');
    expect(JSON.parse(firstCall[1] as string)).toEqual({
      seriesId: 'momentum',
      type: 'histogram',
      paneId: 'indicator',
      priceScaleId: 'indicator',
      visible: true,
      source: { type: 'data' },
      appearance: { color: '#FFAA00' },
    });

    TradingCharts.addSeries('chart', {
      seriesId: 'volume',
      type: 'histogram',
      paneId: 'volume',
      priceScaleId: 'volume',
      visible: false,
      source: { type: 'ohlcvVolume', seriesId: 'main' },
    });
    const secondCall = mockNativeModule.addSeries.mock.calls[1]!;
    expect(secondCall[0]).toBe('chart');
    expect(JSON.parse(secondCall[1] as string)).toEqual({
      seriesId: 'volume',
      type: 'histogram',
      paneId: 'volume',
      priceScaleId: 'volume',
      visible: false,
      source: { type: 'ohlcvVolume', seriesId: 'main' },
    });
  });

  it('resolves imperative line series options before sending them', () => {
    TradingCharts.addSeries('chart', {
      seriesId: 'comparison',
      type: 'line',
      paneId: 'main',
      priceScaleId: 'main',
      source: 'high',
      gapThresholdMs: 120_000,
      appearance: {
        width: 2.5,
        color: '#2E90F5',
        gradient: { topColor: '#C51BFF', bottomColor: '#2E90F5' },
      },
    });

    const call = mockNativeModule.addSeries.mock.calls[0]!;
    expect(JSON.parse(call[1] as string)).toEqual({
      seriesId: 'comparison',
      type: 'line',
      paneId: 'main',
      priceScaleId: 'main',
      source: 'high',
      gapThresholdMs: 120_000,
      visible: true,
      appearance: {
        width: 2.5,
        color: '#2E90F5',
        gradient: { topColor: '#C51BFF', bottomColor: '#2E90F5' },
      },
    });
  });

  it('normalizes an imperative derived RSI series', () => {
    TradingCharts.addSeries('chart', {
      seriesId: 'rsi',
      type: 'line',
      paneId: 'rsi',
      priceScaleId: 'rsi',
      source: { type: 'ohlcvRsi', seriesId: 'main' },
    });

    const call = mockNativeModule.addSeries.mock.calls[0]!;
    expect(JSON.parse(call[1] as string)).toEqual({
      seriesId: 'rsi',
      type: 'line',
      paneId: 'rsi',
      priceScaleId: 'rsi',
      source: { type: 'ohlcvRsi', seriesId: 'main', period: 14 },
      levels: { oversold: 30, overbought: 70 },
      visible: true,
    });
  });

  it('normalizes and validates an imperative RSI text color', () => {
    TradingCharts.addSeries('chart', {
      seriesId: 'rsi',
      type: 'line',
      paneId: 'rsi',
      priceScaleId: 'rsi',
      source: { type: 'ohlcvRsi', seriesId: 'main' },
      appearance: { textColor: '#AABBCCDD' },
    });

    const call = mockNativeModule.addSeries.mock.calls[0]!;
    expect(JSON.parse(call[1] as string)).toMatchObject({
      appearance: { textColor: '#AABBCCDD' },
    });

    expect(() =>
      resolveAdditionalSeriesOptions({
        seriesId: 'invalid-rsi',
        type: 'line',
        paneId: 'rsi',
        priceScaleId: 'rsi',
        source: { type: 'ohlcvRsi', seriesId: 'main' },
        appearance: { textColor: 'purple' },
      })
    ).toThrow('appearance.textColor must be #RRGGBB or #RRGGBBAA');
  });

  it('rejects invalid RSI periods, levels and the main pane', () => {
    const base = {
      seriesId: 'rsi',
      type: 'line' as const,
      paneId: 'rsi',
      priceScaleId: 'rsi',
    };
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...base,
        source: { type: 'ohlcvRsi', seriesId: 'main', period: 0 },
      })
    ).toThrow('positive integer');
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...base,
        source: { type: 'ohlcvRsi', seriesId: 'main' },
        levels: { oversold: 70, overbought: 30 },
      })
    ).toThrow('0 <= oversold < overbought <= 100');
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...base,
        paneId: 'main',
        priceScaleId: 'main',
        source: { type: 'ohlcvRsi', seriesId: 'main' },
      })
    ).toThrow('separate RSI pane');
  });

  it('resolves imperative area series options before sending them', () => {
    TradingCharts.addSeries('chart', {
      seriesId: 'area-comparison',
      type: 'area',
      paneId: 'main',
      priceScaleId: 'main',
      source: 'close',
      gapThresholdMs: 180_000,
      appearance: {
        width: 3,
        color: '#2E90F5',
        fill: { topColor: '#2E90F566', bottomColor: '#2E90F500' },
      },
    });

    const call = mockNativeModule.addSeries.mock.calls[0]!;
    expect(JSON.parse(call[1] as string)).toEqual({
      seriesId: 'area-comparison',
      type: 'area',
      paneId: 'main',
      priceScaleId: 'main',
      source: 'close',
      gapThresholdMs: 180_000,
      visible: true,
      appearance: {
        width: 3,
        color: '#2E90F5',
        fill: { topColor: '#2E90F566', bottomColor: '#2E90F500' },
      },
    });
  });

  it('rejects invalid imperative addSeries options', () => {
    expect(() =>
      resolveAdditionalSeriesOptions({
        seriesId: 'bad id',
        type: 'histogram',
        paneId: 'volume',
        priceScaleId: 'volume',
      })
    ).toThrow('seriesId');
    expect(() =>
      resolveAdditionalSeriesOptions({
        seriesId: 'momentum',
        type: 'histogram',
        paneId: 'indicator',
        priceScaleId: 'indicator',
        appearance: { color: 'orange' },
      })
    ).toThrow('#RRGGBB');
    expect(() =>
      resolveAdditionalSeriesOptions({
        seriesId: 'comparison',
        type: 'mountain' as 'bar',
        paneId: 'main',
        priceScaleId: 'main',
      })
    ).toThrow('type');
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

  it('forwards viewport commands to the native module', () => {
    TradingCharts.zoom('main', 1.25);
    TradingCharts.fitContent('main');

    expect(mockNativeModule.zoom).toHaveBeenCalledWith('main', 1.25);
    expect(mockNativeModule.fitContent).toHaveBeenCalledWith('main');
  });

  it('rejects invalid zoom arguments', () => {
    expect(() => TradingCharts.zoom('', 1.25)).toThrow(
      'chartId must be a non-empty string'
    );
    expect(() => TradingCharts.fitContent('')).toThrow(
      'chartId must be a non-empty string'
    );
    expect(() => TradingCharts.zoom('main', 0)).toThrow(
      'scale must be greater than 0'
    );
    expect(() => TradingCharts.zoom('main', -1)).toThrow(
      'scale must be greater than 0'
    );
    expect(() => TradingCharts.zoom('main', Number.NaN)).toThrow(
      'scale must be a finite number'
    );
    expect(() => TradingCharts.zoom('main', Number.POSITIVE_INFINITY)).toThrow(
      'scale must be a finite number'
    );
  });
});

describe('chart config', () => {
  it('resolves price and volume panes with validated series references', () => {
    const resolved = resolveChartConfig({
      chartId: 'price-volume',
      panes: [
        {
          paneId: 'volume',
          heightWeight: 1,
          priceScale: {
            priceScaleId: 'volume',
            valueFormat: { type: 'volume', precision: 1 },
          },
        },
        {
          paneId: 'main',
          heightWeight: 3,
          priceScale: { priceScaleId: 'main' },
        },
      ],
      additionalSeries: [
        {
          seriesId: 'volume',
          type: 'histogram',
          paneId: 'volume',
          priceScaleId: 'volume',
          source: { type: 'ohlcvVolume', seriesId: 'main' },
        },
      ],
    });

    expect(resolved.panes.map((pane) => pane.paneId)).toEqual([
      'main',
      'volume',
    ]);
    expect(resolved.panes[1]?.priceScale.valueFormat).toMatchObject({
      type: 'volume',
      precision: 1,
    });
    expect(resolved.panes[1]?.priceScale.visible).toBe(true);
    expect(resolved.panesResizable).toBe(true);
    expect(resolved.additionalSeries[0]).toMatchObject({
      seriesId: 'volume',
      visible: true,
      source: { type: 'ohlcvVolume', seriesId: 'main' },
    });
  });

  it('resolves a derived RSI pane with defaults and theme fallbacks', () => {
    const resolved = resolveChartConfig({
      chartId: 'price-rsi',
      panes: [
        {
          paneId: 'main',
          heightWeight: 3,
          priceScale: { priceScaleId: 'main' },
        },
        {
          paneId: 'rsi',
          heightWeight: 1,
          priceScale: {
            priceScaleId: 'rsi',
            valueFormat: {
              type: 'price',
              precision: 4,
              minMove: 0.0001,
              useGrouping: false,
            },
          },
        },
      ],
      additionalSeries: [
        {
          seriesId: 'rsi',
          type: 'line',
          paneId: 'rsi',
          priceScaleId: 'rsi',
          source: { type: 'ohlcvRsi', seriesId: 'main' },
        },
      ],
    });

    expect(resolved.additionalSeries[0]).toMatchObject({
      source: { type: 'ohlcvRsi', seriesId: 'main', period: 14 },
      levels: { oversold: 30, overbought: 70 },
      appearance: {
        width: 1.5,
        color: '#38D98A',
        levelLineColor: '#38D98A80',
        bandColor: '#38D98A14',
      },
    });
    expect(resolved.additionalSeries[0]).not.toHaveProperty(
      'appearance.textColor'
    );
  });

  it('resolves an explicit RSI legend text color', () => {
    const resolved = resolveChartConfig({
      chartId: 'styled-rsi',
      panes: [
        {
          paneId: 'main',
          heightWeight: 3,
          priceScale: { priceScaleId: 'main' },
        },
        {
          paneId: 'rsi',
          heightWeight: 1,
          priceScale: { priceScaleId: 'rsi' },
        },
      ],
      additionalSeries: [
        {
          seriesId: 'rsi',
          type: 'line',
          paneId: 'rsi',
          priceScaleId: 'rsi',
          source: { type: 'ohlcvRsi', seriesId: 'main' },
          appearance: { textColor: '#ABCDEF80' },
        },
      ],
    });

    expect(resolved.additionalSeries[0]).toMatchObject({
      appearance: { textColor: '#ABCDEF80' },
    });
  });

  it('rejects RSI sources that reference another derived series', () => {
    expect(() =>
      resolveChartConfig({
        chartId: 'derived-rsi-chain',
        panes: [
          {
            paneId: 'main',
            heightWeight: 3,
            priceScale: { priceScaleId: 'main' },
          },
          {
            paneId: 'first',
            heightWeight: 1,
            priceScale: { priceScaleId: 'first' },
          },
          {
            paneId: 'second',
            heightWeight: 1,
            priceScale: { priceScaleId: 'second' },
          },
        ],
        additionalSeries: [
          {
            seriesId: 'first-rsi',
            type: 'line',
            paneId: 'first',
            priceScaleId: 'first',
            source: { type: 'ohlcvRsi', seriesId: 'main' },
          },
          {
            seriesId: 'second-rsi',
            type: 'line',
            paneId: 'second',
            priceScaleId: 'second',
            source: { type: 'ohlcvRsi', seriesId: 'first-rsi' },
          },
        ],
      })
    ).toThrow('data-backed OHLC data');
  });

  it('rejects duplicate IDs and invalid pane/scale references', () => {
    const panes = [
      {
        paneId: 'main',
        heightWeight: 3,
        priceScale: { priceScaleId: 'main' },
      },
      {
        paneId: 'volume',
        heightWeight: 1,
        priceScale: { priceScaleId: 'volume' },
      },
    ] as const;
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-reference',
        panes,
        additionalSeries: [
          {
            seriesId: 'volume',
            type: 'histogram',
            paneId: 'volume',
            priceScaleId: 'main',
          },
        ],
      })
    ).toThrow("must match the pane's price scale");
    expect(() =>
      resolveChartConfig({
        chartId: 'duplicate-series',
        panes,
        additionalSeries: [
          {
            seriesId: 'same',
            type: 'histogram',
            paneId: 'volume',
            priceScaleId: 'volume',
          },
          {
            seriesId: 'same',
            type: 'histogram',
            paneId: 'volume',
            priceScaleId: 'volume',
          },
        ],
      })
    ).toThrow('duplicate seriesId');
  });

  it('resolves price and compact defaults', () => {
    const price = resolveChartConfig({ chartId: 'price' });
    expect(price.resolution).toEqual({ unit: 'minute', multiplier: 1 });
    expect(price.tradeAggregation).toEqual({
      bucketOrigin: { type: 'epoch' },
      outsideSession: 'ignore',
      candleTimestamp: 'bucketStart',
    });
    expect(price.defaultScale).toBe(1);
    expect(price.series).toEqual({ type: 'candlestick' });
    expect(price.appearance.bars).toEqual({
      upColor: price.appearance.candles.upColor,
      downColor: price.appearance.candles.downColor,
      lineWidth: 1,
    });
    expect(price.xAxis.spacing).toBe('time');
    expect(price.yAxis.valueFormat).toMatchObject({
      type: 'price',
      precision: 2,
      minMove: 0.01,
    });
    expect(price.yAxis.scaleMargins).toEqual({ top: 0.2, bottom: 0.1 });
    expect(price.yAxis.defaultScale).toBe(1);
    expect(price.gestures).toEqual({
      pan: true,
      zoom: true,
      yAxisScale: true,
    });
    expect(price.currentPrice.pinToEdge).toBe(true);
    expect(price.priceExtremes.visible).toBe(true);
    expect(price.crosshair).toEqual({
      enabled: true,
      showTooltip: true,
      showTooltipHeader: true,
      tooltipBackgroundOpacity: 1,
      lineStyle: 'solid',
      tooltipFields: [
        'open',
        'close',
        'high',
        'low',
        'amplitude',
        'changePercent',
        'change',
        'volume',
      ],
      tooltipLabels: {
        open: 'Open',
        close: 'Close',
        high: 'High',
        low: 'Low',
        amplitude: 'Amplitude',
        changePercent: 'Change %',
        change: 'Change',
        volume: 'Volume',
      },
    });

    expect(
      resolveChartConfig({
        chartId: 'unpinned-price',
        currentPrice: { pinToEdge: false },
      }).currentPrice
    ).toEqual({ visible: true, showLabel: true, pinToEdge: false });

    expect(
      resolveChartConfig({
        chartId: 'hidden-price-extremes',
        priceExtremes: { visible: false },
      }).priceExtremes
    ).toEqual({ visible: false });

    const compact = resolveChartConfig({
      chartId: 'cap',
      yAxis: { valueFormat: { type: 'compact', currencySymbol: '$' } },
    });
    expect(compact.yAxis.valueFormat).toMatchObject({
      type: 'compact',
      precision: 2,
      minMove: 0.01,
      currencySymbol: '$',
    });
    const significant = resolveChartConfig({
      chartId: 'micro-price',
      yAxis: {
        valueFormat: {
          type: 'significant',
          significantDigits: 3,
          minMove: 0.00000001,
        },
      },
    });
    expect(significant.yAxis.valueFormat).toMatchObject({
      type: 'significant',
      significantDigits: 3,
      minMove: 0.00000001,
      useGrouping: true,
    });
    expect(significant.formatters.price.yAxis).toEqual(
      significant.yAxis.valueFormat
    );
    expect(significant.formatters.price.currentPrice).toMatchObject({
      type: 'significant',
      significantDigits: 3,
    });
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-fixed-resolution',
        resolution: { unit: 'fixed', durationMs: 1.5 },
      })
    ).toThrow('resolution.durationMs must be a positive safe integer');
    expect(
      resolveChartConfig({
        chartId: 'fixed-resolution',
        resolution: { unit: 'fixed', durationMs: 250 },
      }).resolution
    ).toEqual({
      unit: 'fixed',
      durationMs: 250,
    });
    expect(() => resolveChartConfig({ chartId: '' })).toThrow(
      'chartId must be a non-empty string'
    );
    expect(
      resolveChartConfig({ chartId: 'logical', xAxis: { spacing: 'logical' } })
        .xAxis.spacing
    ).toBe('logical');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-spacing',
        xAxis: { spacing: 'invalid' as 'time' },
      })
    ).toThrow('xAxis.spacing');
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

  it('resolves and validates crosshair presentation options', () => {
    const resolved = resolveChartConfig({
      chartId: 'styled-crosshair',
      crosshair: {
        tooltipBackgroundOpacity: 0.55,
        lineStyle: 'dashed',
        showTooltipHeader: false,
        tooltipFields: ['volume', 'close', 'changePercent'],
        tooltipLabels: { open: 'Открытие', volume: 'Объём' },
      },
    });
    expect(resolved.crosshair).toMatchObject({
      tooltipBackgroundOpacity: 0.55,
      lineStyle: 'dashed',
      showTooltipHeader: false,
      tooltipFields: ['volume', 'close', 'changePercent'],
      tooltipLabels: {
        open: 'Открытие',
        close: 'Close',
        volume: 'Объём',
      },
    });
    const serialized = JSON.parse(JSON.stringify(resolved)) as {
      crosshair: typeof resolved.crosshair;
    };
    expect(serialized.crosshair).toMatchObject({
      tooltipBackgroundOpacity: 0.55,
      lineStyle: 'dashed',
      showTooltipHeader: false,
      tooltipFields: ['volume', 'close', 'changePercent'],
      tooltipLabels: { open: 'Открытие', volume: 'Объём' },
    });
    expect(() =>
      resolveChartConfig({
        chartId: 'negative-tooltip-opacity',
        crosshair: { tooltipBackgroundOpacity: -0.1 },
      })
    ).toThrow('crosshair.tooltipBackgroundOpacity');
    expect(() =>
      resolveChartConfig({
        chartId: 'large-tooltip-opacity',
        crosshair: { tooltipBackgroundOpacity: 1.1 },
      })
    ).toThrow('crosshair.tooltipBackgroundOpacity');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-crosshair-line-style',
        crosshair: { lineStyle: 'dotted' as 'solid' },
      })
    ).toThrow('crosshair.lineStyle');
    expect(
      resolveChartConfig({
        chartId: 'empty-tooltip',
        crosshair: { tooltipFields: [], showTooltipHeader: false },
      }).crosshair
    ).toMatchObject({ tooltipFields: [], showTooltipHeader: false });
    expect(() =>
      resolveChartConfig({
        chartId: 'unknown-tooltip-field',
        crosshair: { tooltipFields: ['unknown' as 'open'] },
      })
    ).toThrow('crosshair.tooltipFields[0]');
    expect(() =>
      resolveChartConfig({
        chartId: 'duplicate-tooltip-field',
        crosshair: { tooltipFields: ['open', 'open'] },
      })
    ).toThrow('duplicate field');
  });

  it('accepts valid scale margins and rejects invalid ranges', () => {
    expect(
      resolveChartConfig({
        chartId: 'margins',
        yAxis: { scaleMargins: { top: 0.25, bottom: 0.15 } },
      }).yAxis.scaleMargins
    ).toEqual({ top: 0.25, bottom: 0.15 });

    expect(() =>
      resolveChartConfig({
        chartId: 'negative-margin',
        yAxis: { scaleMargins: { top: -0.1, bottom: 0.1 } },
      })
    ).toThrow('yAxis.scaleMargins');
    expect(() =>
      resolveChartConfig({
        chartId: 'full-margin',
        yAxis: { scaleMargins: { top: 0.5, bottom: 0.5 } },
      })
    ).toThrow('yAxis.scaleMargins');
  });

  it('validates and serializes the default horizontal scale', () => {
    expect(
      resolveChartConfig({ chartId: 'zoomed', defaultScale: 1.5 }).defaultScale
    ).toBe(1.5);
    expect(() =>
      resolveChartConfig({ chartId: 'zero-scale', defaultScale: 0 })
    ).toThrow('defaultScale must be a positive finite number');
    expect(() =>
      resolveChartConfig({ chartId: 'negative-scale', defaultScale: -1 })
    ).toThrow('defaultScale must be a positive finite number');
    expect(() =>
      resolveChartConfig({ chartId: 'nan-scale', defaultScale: Number.NaN })
    ).toThrow('defaultScale must be a positive finite number');
    expect(() =>
      resolveChartConfig({
        chartId: 'infinite-scale',
        defaultScale: Number.POSITIVE_INFINITY,
      })
    ).toThrow('defaultScale must be a positive finite number');

    const serialized = JSON.parse(
      JSON.stringify(
        resolveChartConfig({
          chartId: 'callback-is-not-config',
          onScaleChange: jest.fn(),
          onYAxisScaleChange: jest.fn(),
          onSelectedCandleChange: jest.fn(),
        })
      )
    ) as Record<string, unknown>;
    expect(serialized).not.toHaveProperty('onSelectedCandleChange');
    expect(serialized).not.toHaveProperty('onScaleChange');
    expect(serialized).not.toHaveProperty('onYAxisScaleChange');
  });

  it('validates Y-axis default scale and resolves gesture compatibility', () => {
    expect(
      resolveChartConfig({
        chartId: 'scaled-y',
        yAxis: { defaultScale: 2.5 },
      }).yAxis.defaultScale
    ).toBe(2.5);
    expect(
      resolveChartConfig({
        chartId: 'zoom-disabled',
        gestures: { zoom: false },
      }).gestures.yAxisScale
    ).toBe(false);
    expect(
      resolveChartConfig({
        chartId: 'independent-y-scale',
        gestures: { zoom: false, yAxisScale: true },
      }).gestures
    ).toEqual({ pan: true, zoom: false, yAxisScale: true });
    expect(() =>
      resolveChartConfig({
        chartId: 'small-y-scale',
        yAxis: { defaultScale: 0.09 },
      })
    ).toThrow('yAxis.defaultScale must be between 0.1 and 10');
    expect(() =>
      resolveChartConfig({
        chartId: 'large-y-scale',
        yAxis: { defaultScale: 10.01 },
      })
    ).toThrow('yAxis.defaultScale must be between 0.1 and 10');
    expect(() =>
      resolveChartConfig({
        chartId: 'nan-y-scale',
        yAxis: { defaultScale: Number.NaN },
      })
    ).toThrow('yAxis.defaultScale must be a positive finite number');
  });

  it('serializes price-extreme visibility into the native JSON config', () => {
    const configJson = JSON.stringify(
      resolveChartConfig({
        chartId: 'native-price-extremes',
        priceExtremes: { visible: false },
      })
    );
    const nativeConfig = JSON.parse(configJson) as {
      priceExtremes: { visible: boolean };
    };
    expect(nativeConfig.priceExtremes).toEqual({ visible: false });
  });

  it('validates compact minMove', () => {
    expect(
      resolveChartConfig({
        chartId: 'compact-step',
        yAxis: {
          valueFormat: { type: 'compact', precision: 1, minMove: 1000 },
        },
      }).yAxis.valueFormat
    ).toMatchObject({ type: 'compact', minMove: 1000 });
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-compact-step',
        yAxis: { valueFormat: { type: 'compact', minMove: 0 } },
      })
    ).toThrow('yAxis.valueFormat.minMove');
  });

  it('validates significant price formats', () => {
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-significant-digits',
        yAxis: {
          valueFormat: { type: 'significant', significantDigits: 0 },
        },
      })
    ).toThrow('yAxis.valueFormat.significantDigits');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-significant-display',
        formatters: {
          price: {
            tooltip: { type: 'significant', significantDigits: 9 },
          },
        },
      })
    ).toThrow('formatters.price.tooltip.significantDigits');
  });

  it('resolves role-specific appearance over legacy theme values', () => {
    const resolved = resolveChartConfig({
      chartId: 'appearance',
      theme: {
        backgroundColor: '#111111',
        upColor: '#00AA00',
        crosshairColor: '#777777',
      },
      crosshair: { tooltipBackgroundOpacity: 0.4 },
      appearance: {
        backgroundColor: '#FAFAFA',
        grid: { color: '#CCCCCC80', opacity: 0.5 },
        candles: { upColor: '#008800', radius: 3.5 },
        xAxis: {
          text: {
            color: '#222222',
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: 'medium',
          },
        },
        currentPrice: {
          label: {
            upBackgroundColor: '#123456',
            border: { color: '#654321', width: 2, radius: 6 },
          },
        },
        crosshair: {
          priceLabel: { backgroundColor: '#ABCDEF' },
        },
        tooltip: { backgroundOpacity: 0.75 },
      },
    });

    expect(resolved.appearance).toMatchObject({
      backgroundColor: '#FAFAFA',
      grid: { color: '#CCCCCC80', opacity: 0.5 },
      candles: { upColor: '#008800', downColor: '#FF3B64', radius: 3.5 },
      xAxis: {
        text: {
          color: '#222222',
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: 'medium',
        },
      },
      currentPrice: {
        label: {
          upBackgroundColor: '#123456',
          border: { color: '#654321', width: 2, radius: 6 },
        },
      },
      crosshair: { priceLabel: { backgroundColor: '#ABCDEF' } },
      tooltip: { backgroundOpacity: 0.75 },
    });
  });

  it('resolves and serializes bar series appearance with active colors', () => {
    const resolved = resolveChartConfig({
      chartId: 'bars',
      series: { type: 'bar' },
      appearance: {
        candles: { upColor: '#008800', downColor: '#880000' },
        bars: {
          upColor: '#00A88F',
          downColor: '#FF334F',
          lineWidth: 1.5,
        },
      },
    });

    expect(resolved.series).toEqual({ type: 'bar' });
    expect(resolved.appearance.bars).toEqual({
      upColor: '#00A88F',
      downColor: '#FF334F',
      lineWidth: 1.5,
    });
    expect(resolved.appearance.currentPrice).toMatchObject({
      line: { upColor: '#00A88F', downColor: '#FF334F' },
      label: {
        upBackgroundColor: '#00A88F',
        downBackgroundColor: '#FF334F',
      },
    });
    expect(resolved.appearance.tooltip).toMatchObject({
      positiveValueColor: '#00A88F',
      negativeValueColor: '#FF334F',
    });

    const serialized = JSON.parse(JSON.stringify(resolved)) as typeof resolved;
    expect(serialized.series).toEqual({ type: 'bar' });
    expect(serialized.appearance.bars.lineWidth).toBe(1.5);
  });

  it('resolves hollow candlesticks with the candle palette', () => {
    const resolved = resolveChartConfig({
      chartId: 'hollow',
      series: { type: 'hollowCandlestick' },
      appearance: {
        candles: { upColor: '#00A88F', downColor: '#FF334F' },
        bars: {
          upColor: '#123456',
          downColor: '#654321',
          lineWidth: 2,
        },
      },
    });

    expect(resolved.series).toEqual({ type: 'hollowCandlestick' });
    expect(resolved.appearance.candles).toEqual({
      upColor: '#00A88F',
      downColor: '#FF334F',
      radius: 0,
    });
    expect(resolved.appearance.currentPrice).toMatchObject({
      line: { upColor: '#00A88F', downColor: '#FF334F' },
      label: {
        upBackgroundColor: '#00A88F',
        downBackgroundColor: '#FF334F',
      },
    });
    expect(resolved.appearance.tooltip).toMatchObject({
      positiveValueColor: '#00A88F',
      negativeValueColor: '#FF334F',
    });

    const serialized = JSON.parse(JSON.stringify(resolved)) as typeof resolved;
    expect(serialized.series).toEqual({ type: 'hollowCandlestick' });
  });

  it('resolves a gradient line and its source semantics', () => {
    const resolved = resolveChartConfig({
      chartId: 'line',
      series: { type: 'line', source: 'low', gapThresholdMs: 90_000 },
      appearance: {
        line: {
          width: 2.5,
          color: '#2E90F5',
          gradient: { topColor: '#C51BFF', bottomColor: '#2E90F5' },
        },
      },
    });

    expect(resolved.series).toEqual({
      type: 'line',
      source: 'low',
      gapThresholdMs: 90_000,
    });
    expect(resolved.appearance.line).toEqual({
      width: 2.5,
      color: '#2E90F5',
      gradient: { topColor: '#C51BFF', bottomColor: '#2E90F5' },
    });
    expect(resolved.appearance.currentPrice).toMatchObject({
      line: { upColor: '#2E90F5', downColor: '#2E90F5' },
      label: {
        upBackgroundColor: '#2E90F5',
        downBackgroundColor: '#2E90F5',
      },
    });
    expect(resolved.appearance.tooltip).toMatchObject({
      positiveValueColor: '#2E90F5',
      negativeValueColor: '#2E90F5',
    });
  });

  it('resolves area defaults, fill colors and line-like semantics', () => {
    const defaults = resolveChartConfig({
      chartId: 'area-defaults',
      series: { type: 'area' },
      theme: { upColor: '#2E90F5' },
    });
    expect(defaults.series).toEqual({ type: 'area', source: 'close' });
    expect(defaults.appearance.area).toEqual({
      width: 1.5,
      color: '#2E90F5',
      fill: { topColor: '#2E90F540', bottomColor: '#2E90F500' },
    });

    const custom = resolveChartConfig({
      chartId: 'area-custom',
      series: { type: 'area', source: 'high', gapThresholdMs: 90_000 },
      appearance: {
        area: {
          width: 2.5,
          color: '#3366FF',
          gradient: { topColor: '#66AAFF', bottomColor: '#2244AA' },
          fill: { topColor: '#3366FF80', bottomColor: '#11224400' },
        },
      },
    });
    expect(custom.series).toEqual({
      type: 'area',
      source: 'high',
      gapThresholdMs: 90_000,
    });
    expect(custom.appearance.area).toEqual({
      width: 2.5,
      color: '#3366FF',
      gradient: { topColor: '#66AAFF', bottomColor: '#2244AA' },
      fill: { topColor: '#3366FF80', bottomColor: '#11224400' },
    });
    expect(custom.appearance.currentPrice).toMatchObject({
      line: { upColor: '#3366FF', downColor: '#3366FF' },
      label: {
        upBackgroundColor: '#3366FF',
        downBackgroundColor: '#3366FF',
      },
    });
  });

  it('resolves independent native date and price formatters', () => {
    const resolved = resolveChartConfig({
      chartId: 'formatters',
      yAxis: {
        valueFormat: {
          type: 'price',
          precision: 4,
          minMove: 0.0001,
          currencySymbol: '$',
        },
      },
      formatters: {
        date: {
          xAxis: {
            seconds: 'HH:mm:ss.SSS',
            day: 'dd/MM',
            timeZone: 'Europe/London',
          },
          crosshairTimeBadge: { pattern: 'HH:mm:ss', locale: 'ru-RU' },
          tooltipHeader: { pattern: 'dd MMM yyyy' },
        },
        price: {
          currentPrice: { type: 'price', precision: 2, currencySymbol: '£' },
          crosshairPrice: { type: 'compact', precision: 1 },
          tooltip: { type: 'price', precision: 6, useGrouping: false },
        },
      },
    });

    expect(resolved.formatters.date.xAxis).toMatchObject({
      seconds: 'HH:mm:ss.SSS',
      time: 'HH:mm',
      day: 'dd/MM',
      timeZone: 'Europe/London',
    });
    expect(resolved.formatters.date.crosshairTimeBadge).toEqual({
      pattern: 'HH:mm:ss',
      locale: 'ru-RU',
      timeZone: 'Europe/London',
    });
    expect(resolved.formatters.price.currentPrice).toMatchObject({
      type: 'price',
      precision: 2,
      currencySymbol: '£',
    });
    expect(resolved.formatters.price.crosshairPrice).toMatchObject({
      type: 'compact',
      precision: 1,
    });
    expect(resolved.formatters.price.tooltip.useGrouping).toBe(false);
    expect(resolved.formatters.price.priceExtremes).toMatchObject({
      type: 'price',
      precision: 4,
      currencySymbol: '$',
    });
  });

  it('validates appearance and formatter values before native serialization', () => {
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-series',
        series: { type: 'mountain' as never },
      })
    ).toThrow('series.type');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-line-source',
        series: { type: 'line', source: 'median' as never },
      })
    ).toThrow('series.source');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-line-gap',
        series: { type: 'line', gapThresholdMs: 0 },
      })
    ).toThrow('series.gapThresholdMs');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-line-width',
        appearance: { line: { width: 0 } },
      })
    ).toThrow('appearance.line.width');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-area-fill',
        appearance: { area: { fill: { topColor: 'blue' } } },
      })
    ).toThrow('appearance.area.fill.topColor');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-bar-width',
        appearance: { bars: { lineWidth: 0 } },
      })
    ).toThrow('appearance.bars.lineWidth');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-candle-radius',
        appearance: { candles: { radius: -1 } },
      })
    ).toThrow('appearance.candles.radius');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-color',
        appearance: { backgroundColor: 'red' },
      })
    ).toThrow('appearance.backgroundColor');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-opacity',
        appearance: { grid: { opacity: 2 } },
      })
    ).toThrow('appearance.grid.opacity');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-font',
        appearance: { yAxis: { text: { fontSize: 0 } } },
      })
    ).toThrow('appearance.yAxis.text.fontSize');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-border',
        appearance: {
          crosshair: { timeLabel: { border: { width: -1 } } },
        },
      })
    ).toThrow('appearance.crosshair.timeLabel.border.width');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-pattern',
        formatters: {
          date: { tooltipHeader: { pattern: '   ' } },
        },
      })
    ).toThrow('formatters.date.tooltipHeader.pattern');
  });
});

describe('selected candle events', () => {
  it('maps active native events to OHLCV candles', () => {
    expect(
      selectedCandleFromNativeEvent({
        active: true,
        timestamp: 60_000,
        open: 10,
        high: 13,
        low: 9,
        close: 12,
        volume: 4,
      })
    ).toEqual({
      timestamp: 60_000,
      open: 10,
      high: 13,
      low: 9,
      close: 12,
      volume: 4,
    });
  });

  it('maps inactive native events to null', () => {
    expect(
      selectedCandleFromNativeEvent({
        active: false,
        timestamp: 0,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
      })
    ).toBeNull();
  });
});
