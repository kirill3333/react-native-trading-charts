import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resolveAdditionalSeriesOptions } from '../config';
import { mockNativeModule, TradingCharts } from '../__fixtures__/tradingCharts';

describe('price and histogram series', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(JSON.parse(firstCall[1])).toEqual({
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
    expect(JSON.parse(secondCall[1])).toEqual({
      seriesId: 'volume',
      legendVisible: true,
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
    expect(JSON.parse(call[1])).toEqual({
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
    expect(JSON.parse(call[1])).toEqual({
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
    // SAFETY: this negative test intentionally bypasses the public series
    // discriminant so runtime validation receives an invalid value.
    expect(() =>
      resolveAdditionalSeriesOptions({
        seriesId: 'comparison',
        type: 'mountain' as 'bar',
        paneId: 'main',
        priceScaleId: 'main',
      })
    ).toThrow('type');
  });

  it('forwards baseline options through addSeries without filling appearance defaults', () => {
    TradingCharts.addSeries('main', {
      type: 'baseline',
      seriesId: 'baseline',
      paneId: 'main',
      priceScaleId: 'main',
      source: 'low',
      baseValue: { type: 'price', value: -5 },
      appearance: { bottomLineColor: '#123456', baseLine: { visible: false } },
    });
    const options = mockNativeModule.addSeries.mock.calls[0]?.[1];
    expect(mockNativeModule.addSeries).toHaveBeenCalledTimes(1);
    expect(JSON.parse(options!)).toEqual({
      type: 'baseline',
      seriesId: 'baseline',
      paneId: 'main',
      priceScaleId: 'main',
      visible: true,
      source: 'low',
      baseValue: { type: 'price', value: -5 },
      appearance: { bottomLineColor: '#123456', baseLine: { visible: false } },
    });
  });
});
