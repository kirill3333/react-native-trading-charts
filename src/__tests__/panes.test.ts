import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resolveChartConfig } from '../config';
import { mockNativeModule, TradingCharts } from '../__fixtures__/tradingCharts';
import { jsonRoundTrip } from '../__fixtures__/jsonRoundTrip';

describe('panes and viewport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('forwards viewport commands to the native module', () => {
    TradingCharts.zoom('main', 1.25);
    TradingCharts.scrollToRealTime('main');
    TradingCharts.fitContent('main');

    expect(mockNativeModule.zoom).toHaveBeenCalledWith('main', 1.25);
    expect(mockNativeModule.scrollToRealTime).toHaveBeenCalledWith('main');
    expect(mockNativeModule.fitContent).toHaveBeenCalledWith('main');
  });

  it('rejects invalid zoom arguments', () => {
    expect(() => TradingCharts.zoom('', 1.25)).toThrow(
      'chartId must be a non-empty string'
    );
    expect(() => TradingCharts.fitContent('')).toThrow(
      'chartId must be a non-empty string'
    );
    expect(() => TradingCharts.scrollToRealTime('')).toThrow(
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

  it('only accepts initial visible counts representable by the native engine', () => {
    const resolve = (initialVisibleCount: number) =>
      resolveChartConfig({ chartId: 'chart', initialVisibleCount })
        .initialVisibleCount;
    expect(resolve(1)).toBe(1);
    expect(resolve(2_147_483_647)).toBe(2_147_483_647);
    for (const value of [0, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER]) {
      expect(() => resolve(value)).toThrow('initialVisibleCount');
    }
  });

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
    expect(resolved.yAxis).not.toHaveProperty('position');
    expect(resolved.additionalSeries[0]).toMatchObject({
      seriesId: 'volume',
      visible: true,
      source: { type: 'ohlcvVolume', seriesId: 'main' },
    });
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

  it('accepts valid scale margins and rejects invalid ranges', () => {
    const minimumContentFraction = 1e-6;
    expect(
      resolveChartConfig({
        chartId: 'margins',
        yAxis: {
          scaleMargins: {
            top: 1 - minimumContentFraction * 2,
            bottom: 0,
          },
        },
      }).yAxis.scaleMargins
    ).toEqual({ top: 1 - minimumContentFraction * 2, bottom: 0 });

    const paneMargins = resolveChartConfig({
      chartId: 'pane-margins',
      panes: [
        {
          paneId: 'main',
          heightWeight: 3,
          priceScale: { priceScaleId: 'main' },
        },
        {
          paneId: 'secondary',
          heightWeight: 1,
          priceScale: {
            priceScaleId: 'secondary',
            scaleMargins: {
              top: 1 - minimumContentFraction * 2,
              bottom: 0,
            },
          },
        },
      ],
    }).panes[1]?.priceScale.scaleMargins;
    expect(paneMargins).toEqual({
      top: 1 - minimumContentFraction * 2,
      bottom: 0,
    });

    expect(() =>
      resolveChartConfig({
        chartId: 'negative-margin',
        yAxis: { scaleMargins: { top: -0.1, bottom: 0.1 } },
      })
    ).toThrow('yAxis.scaleMargins');
    expect(() =>
      resolveChartConfig({
        chartId: 'near-full-margin',
        yAxis: {
          scaleMargins: {
            top: 1 - minimumContentFraction * 0.5,
            bottom: 0,
          },
        },
      })
    ).toThrow('leave at least 0.000001');
    expect(() =>
      resolveChartConfig({
        chartId: 'full-margin',
        yAxis: { scaleMargins: { top: 0.5, bottom: 0.5 } },
      })
    ).toThrow('leave at least 0.000001');
    expect(() =>
      resolveChartConfig({
        chartId: 'non-finite-margin',
        yAxis: { scaleMargins: { top: Number.POSITIVE_INFINITY, bottom: 0 } },
      })
    ).toThrow('yAxis.scaleMargins');
    expect(() =>
      resolveChartConfig({
        chartId: 'near-full-pane-margin',
        panes: [
          {
            paneId: 'main',
            heightWeight: 3,
            priceScale: { priceScaleId: 'main' },
          },
          {
            paneId: 'secondary',
            heightWeight: 1,
            priceScale: {
              priceScaleId: 'secondary',
              scaleMargins: {
                top: 1 - minimumContentFraction * 0.5,
                bottom: 0,
              },
            },
          },
        ],
      })
    ).toThrow('panes[1].priceScale.scaleMargins');
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

    const serialized = jsonRoundTrip(
      resolveChartConfig({
        chartId: 'callback-is-not-config',
        onScaleChange: jest.fn(),
        onYAxisScaleChange: jest.fn(),
        onSelectedCandleChange: jest.fn(),
      })
    );
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
});
