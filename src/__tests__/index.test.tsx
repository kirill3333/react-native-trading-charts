import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type TradingCharts as TradingChartsExport } from '../TradingCharts';
import { type resolveChartConfig as resolveChartConfigExport } from '../config';

const mockNativeModule = {
  setHistory: jest.fn(),
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
    expect(price.xAxis.spacing).toBe('time');
    expect(price.yAxis.valueFormat).toMatchObject({
      type: 'price',
      precision: 2,
      minMove: 0.01,
    });
    expect(price.yAxis.scaleMargins).toEqual({ top: 0.2, bottom: 0.1 });

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
});
