import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resolveAdditionalSeriesOptions, resolveChartConfig } from '../config';
import { mockNativeModule, TradingCharts } from '../__fixtures__/tradingCharts';

describe('indicator series', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an unknown additional series type through both public paths', () => {
    const options = {
      seriesId: 'comparison',
      paneId: 'main',
      priceScaleId: 'main',
      // SAFETY: exercise invalid input from a JavaScript caller.
      type: 'mountain' as never,
    };
    expect(() => TradingCharts.addSeries('chart', options)).toThrow(
      'options.type'
    );
    expect(mockNativeModule.addSeries).not.toHaveBeenCalled();
    expect(() =>
      resolveChartConfig({ chartId: 'chart', additionalSeries: [options] })
    ).toThrow('additionalSeries[0].type');
  });

  it('sends normalized SAR parameters and colors through addSeries', () => {
    TradingCharts.addSeries('chart', {
      seriesId: 'sar',
      type: 'sar',
      paneId: 'main',
      priceScaleId: 'main',
      source: { type: 'ohlcvSar', seriesId: 'main' },
      appearance: { reversalColor: '#11223380' },
    });
    expect(
      JSON.parse(mockNativeModule.addSeries.mock.calls[0]![1])
    ).toMatchObject({
      type: 'sar',
      visible: true,
      source: { type: 'ohlcvSar', seriesId: 'main', step: 0.02, maximum: 0.2 },
      appearance: {
        upColor: '#38D98A',
        downColor: '#FF3B64',
        reversalColor: '#11223380',
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
    expect(JSON.parse(call[1])).toEqual({
      seriesId: 'rsi',
      legendVisible: true,
      type: 'line',
      paneId: 'rsi',
      priceScaleId: 'rsi',
      source: { type: 'ohlcvRsi', seriesId: 'main', period: 14 },
      levels: { oversold: 30, overbought: 70 },
      visible: true,
    });
  });

  it('normalizes an imperative MACD composite series', () => {
    TradingCharts.addSeries('chart', {
      seriesId: 'macd',
      type: 'macd',
      paneId: 'macd',
      priceScaleId: 'macd',
      source: { type: 'ohlcvMacd', seriesId: 'main' },
      appearance: {
        macdLine: { color: '#2E90F5', width: 1.5 },
        signalLine: { color: '#E5B84B', style: 'dashed' },
      },
    });

    expect(JSON.parse(mockNativeModule.addSeries.mock.calls[0]![1])).toEqual({
      seriesId: 'macd',
      legendVisible: true,
      type: 'macd',
      paneId: 'macd',
      priceScaleId: 'macd',
      source: {
        type: 'ohlcvMacd',
        seriesId: 'main',
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        valueSource: 'close',
      },
      appearance: {
        macdLine: { color: '#2E90F5', width: 1.5 },
        signalLine: { color: '#E5B84B', style: 'dashed' },
      },
      visible: true,
    });
  });

  it('validates imperative MACD periods, pane, source and colors', () => {
    const base = {
      seriesId: 'macd',
      type: 'macd' as const,
      paneId: 'macd',
      priceScaleId: 'macd',
      source: { type: 'ohlcvMacd' as const, seriesId: 'main' },
    };
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...base,
        source: { ...base.source, fastPeriod: 26, slowPeriod: 12 },
      })
    ).toThrow('fastPeriod must be less than slowPeriod');
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...base,
        source: { ...base.source, signalPeriod: 0 },
      })
    ).toThrow('signalPeriod must be an integer from 1');
    expect(() =>
      resolveAdditionalSeriesOptions({ ...base, paneId: 'main' })
    ).toThrow('separate MACD pane');
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...base,
        appearance: {
          histogram: { positiveIncreasingColor: 'green' },
        },
      })
    ).toThrow('positiveIncreasingColor must be #RRGGBB or #RRGGBBAA');
  });

  it('normalizes imperative SMA and EMA series', () => {
    TradingCharts.addSeries('chart', {
      seriesId: 'sma-20',
      type: 'line',
      paneId: 'main',
      priceScaleId: 'main',
      source: { type: 'ohlcvSma', seriesId: 'main', period: 20 },
      appearance: { color: '#2E90F5', width: 1.5 },
    });
    TradingCharts.addSeries('chart', {
      seriesId: 'ema-50',
      type: 'line',
      paneId: 'main',
      priceScaleId: 'main',
      source: {
        type: 'ohlcvEma',
        seriesId: 'main',
        period: 50,
        valueSource: 'high',
      },
      appearance: { color: '#F5A623', width: 2, style: 'dashed' },
    });

    expect(JSON.parse(mockNativeModule.addSeries.mock.calls[0]![1])).toEqual({
      seriesId: 'sma-20',
      legendVisible: true,
      type: 'line',
      paneId: 'main',
      priceScaleId: 'main',
      source: {
        type: 'ohlcvSma',
        seriesId: 'main',
        period: 20,
        valueSource: 'close',
      },
      appearance: { color: '#2E90F5', width: 1.5 },
      visible: true,
    });
    expect(JSON.parse(mockNativeModule.addSeries.mock.calls[1]![1])).toEqual({
      seriesId: 'ema-50',
      legendVisible: true,
      type: 'line',
      paneId: 'main',
      priceScaleId: 'main',
      source: {
        type: 'ohlcvEma',
        seriesId: 'main',
        period: 50,
        valueSource: 'high',
      },
      appearance: { color: '#F5A623', width: 2, style: 'dashed' },
      visible: true,
    });
  });

  it('validates moving-average periods, value sources and line styles', () => {
    const base = {
      seriesId: 'average',
      type: 'line' as const,
      paneId: 'main',
      priceScaleId: 'main',
    };
    for (const period of [0, 0.5, 0x1_0000_0000]) {
      expect(() =>
        resolveAdditionalSeriesOptions({
          ...base,
          source: { type: 'ohlcvSma', seriesId: 'main', period },
        })
      ).toThrow('integer from 1');
    }
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...base,
        source: {
          type: 'ohlcvEma',
          seriesId: 'main',
          period: 20,
          // SAFETY: Invalid runtime input intentionally bypasses the public union.
          valueSource: 'median' as never,
        },
      })
    ).toThrow("must be 'open', 'high', 'low' or 'close'");
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...base,
        source: { type: 'ohlcvSma', seriesId: 'main', period: 20 },
        // SAFETY: Invalid runtime input intentionally bypasses the public union.
        appearance: { style: 'dotted' as never },
      })
    ).toThrow("must be 'solid' or 'dashed'");
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
    expect(JSON.parse(call[1])).toMatchObject({
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

  it('resolves MACD defaults, theme styles and pane restrictions', () => {
    const panes = [
      {
        paneId: 'main',
        heightWeight: 3,
        priceScale: { priceScaleId: 'main' },
      },
      {
        paneId: 'macd',
        heightWeight: 1,
        priceScale: { priceScaleId: 'macd' },
      },
    ] as const;
    const resolved = resolveChartConfig({
      chartId: 'price-macd',
      theme: {
        upColor: '#00AA00',
        downColor: '#CC0000',
        gridColor: '#22222280',
        axisTextColor: '#999999',
      },
      appearance: {
        line: { width: 2.5, color: '#3366FF', style: 'dashed' },
      },
      panes,
      additionalSeries: [
        {
          seriesId: 'macd',
          type: 'macd',
          paneId: 'macd',
          priceScaleId: 'macd',
          source: { type: 'ohlcvMacd', seriesId: 'main' },
        },
      ],
    });

    expect(resolved.additionalSeries[0]).toEqual({
      seriesId: 'macd',
      legendVisible: true,
      type: 'macd',
      paneId: 'macd',
      priceScaleId: 'macd',
      visible: true,
      source: {
        type: 'ohlcvMacd',
        seriesId: 'main',
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        valueSource: 'close',
      },
      appearance: {
        macdLine: { width: 2.5, color: '#3366FF', style: 'dashed' },
        signalLine: { width: 2.5, color: '#999999', style: 'dashed' },
        histogram: {
          positiveIncreasingColor: '#00AA00',
          positiveDecreasingColor: '#00AA0080',
          negativeIncreasingColor: '#CC000080',
          negativeDecreasingColor: '#CC0000',
        },
        zeroLineColor: '#22222280',
      },
    });

    expect(() =>
      resolveChartConfig({
        chartId: 'rsi-macd-shared-pane',
        panes,
        additionalSeries: [
          {
            seriesId: 'rsi',
            type: 'line',
            paneId: 'macd',
            priceScaleId: 'macd',
            source: { type: 'ohlcvRsi', seriesId: 'main' },
          },
          {
            seriesId: 'macd',
            type: 'macd',
            paneId: 'macd',
            priceScaleId: 'macd',
            source: { type: 'ohlcvMacd', seriesId: 'main' },
          },
        ],
      })
    ).toThrow('cannot share a pane');
  });

  it('resolves moving averages only on their source pane and scale', () => {
    const resolved = resolveChartConfig({
      chartId: 'moving-averages',
      appearance: {
        line: { style: 'dashed' },
        area: { style: 'dashed' },
      },
      additionalSeries: [
        {
          seriesId: 'sma-20',
          type: 'line',
          paneId: 'main',
          priceScaleId: 'main',
          source: { type: 'ohlcvSma', seriesId: 'main', period: 20 },
        },
        {
          seriesId: 'ema-50',
          type: 'line',
          paneId: 'main',
          priceScaleId: 'main',
          source: { type: 'ohlcvEma', seriesId: 'main', period: 50 },
          appearance: { style: 'solid', color: '#F5A623' },
        },
      ],
    });

    expect(resolved.appearance.line.style).toBe('dashed');
    expect(resolved.appearance.area.style).toBe('dashed');
    expect(resolved.additionalSeries).toMatchObject([
      {
        source: {
          type: 'ohlcvSma',
          seriesId: 'main',
          period: 20,
          valueSource: 'close',
        },
      },
      {
        source: {
          type: 'ohlcvEma',
          seriesId: 'main',
          period: 50,
          valueSource: 'close',
        },
        appearance: { style: 'solid', color: '#F5A623' },
      },
    ]);

    expect(() =>
      resolveChartConfig({
        chartId: 'wrong-ma-pane',
        panes: [
          {
            paneId: 'main',
            heightWeight: 3,
            priceScale: { priceScaleId: 'main' },
          },
          {
            paneId: 'other',
            heightWeight: 1,
            priceScale: { priceScaleId: 'other' },
          },
        ],
        additionalSeries: [
          {
            seriesId: 'sma',
            type: 'line',
            paneId: 'other',
            priceScaleId: 'other',
            source: { type: 'ohlcvSma', seriesId: 'main', period: 20 },
          },
        ],
      })
    ).toThrow('same paneId and priceScaleId');
  });

  it('rejects moving-average sources that are missing or derived', () => {
    expect(() =>
      resolveChartConfig({
        chartId: 'derived-ma-chain',
        additionalSeries: [
          {
            seriesId: 'first',
            type: 'line',
            paneId: 'main',
            priceScaleId: 'main',
            source: { type: 'ohlcvSma', seriesId: 'main', period: 10 },
          },
          {
            seriesId: 'second',
            type: 'line',
            paneId: 'main',
            priceScaleId: 'main',
            source: { type: 'ohlcvEma', seriesId: 'first', period: 10 },
          },
        ],
      })
    ).toThrow('data-backed OHLC data');

    expect(() =>
      resolveChartConfig({
        chartId: 'missing-ma-source',
        additionalSeries: [
          {
            seriesId: 'average',
            type: 'line',
            paneId: 'main',
            priceScaleId: 'main',
            source: { type: 'ohlcvSma', seriesId: 'missing', period: 10 },
          },
        ],
      })
    ).toThrow('data-backed OHLC data');
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

  it('sends normalized BOLL options through the imperative API', () => {
    TradingCharts.addSeries('chart', {
      seriesId: 'boll',
      type: 'boll',
      paneId: 'main',
      priceScaleId: 'main',
      source: {
        type: 'ohlcvBoll',
        seriesId: 'main',
        period: 12,
        stdDevMultiplier: 1.5,
      },
    });
    expect(mockNativeModule.addSeries).toHaveBeenCalledWith(
      'chart',
      JSON.stringify({
        seriesId: 'boll',
        type: 'boll',
        paneId: 'main',
        priceScaleId: 'main',
        source: {
          type: 'ohlcvBoll',
          seriesId: 'main',
          period: 12,
          stdDevMultiplier: 1.5,
          valueSource: 'close',
        },
        legendVisible: true,
        visible: true,
      })
    );
  });
});
