import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type TradingCharts as TradingChartsExport } from '../TradingCharts';
import { type resolveChartConfig as resolveChartConfigExport } from '../config';
import { selectedCandleFromNativeEvent } from '../events';

const mockNativeModule = {
  setHistory: jest.fn(),
  prependHistory: jest.fn(),
  updateCandle: jest.fn(),
  updateTrade: jest.fn(),
  updateTrades: jest.fn(),
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
const { resolveChartConfig } = require('../config') as {
  resolveChartConfig: typeof resolveChartConfigExport;
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
  it('resolves price and compact defaults', () => {
    const price = resolveChartConfig({ chartId: 'price' });
    expect(price.timeframeMs).toBe(60_000);
    expect(price.defaultScale).toBe(1);
    expect(price.xAxis.spacing).toBe('time');
    expect(price.yAxis.valueFormat).toMatchObject({
      type: 'price',
      precision: 2,
      minMove: 0.01,
    });
    expect(price.yAxis.scaleMargins).toEqual({ top: 0.2, bottom: 0.1 });
    expect(price.currentPrice.pinToEdge).toBe(true);
    expect(price.priceExtremes.visible).toBe(true);
    expect(price.crosshair).toEqual({
      enabled: true,
      showTooltip: true,
      tooltipBackgroundOpacity: 1,
      lineStyle: 'solid',
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
    expect(() =>
      resolveChartConfig({ chartId: 'bad', timeframeMs: 1.5 })
    ).toThrow('timeframeMs must be a positive integer');
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

  it('resolves and validates crosshair presentation options', () => {
    const resolved = resolveChartConfig({
      chartId: 'styled-crosshair',
      crosshair: {
        tooltipBackgroundOpacity: 0.55,
        lineStyle: 'dashed',
        tooltipLabels: { open: 'Открытие', volume: 'Объём' },
      },
    });
    expect(resolved.crosshair).toMatchObject({
      tooltipBackgroundOpacity: 0.55,
      lineStyle: 'dashed',
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
          onSelectedCandleChange: jest.fn(),
        })
      )
    ) as Record<string, unknown>;
    expect(serialized).not.toHaveProperty('onSelectedCandleChange');
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
        candles: { upColor: '#008800' },
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
      candles: { upColor: '#008800', downColor: '#FF3B64' },
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
          xAxis: { seconds: 'HH:mm:ss.SSS', day: 'dd/MM', timeZone: 'Europe/London' },
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
