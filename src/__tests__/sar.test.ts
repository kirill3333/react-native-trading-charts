import { describe, expect, it } from '@jest/globals';
import { resolveAdditionalSeriesOptions, resolveChartConfig } from '../config';
import { selectedSeriesValuesFromNativeEvent } from '../events';
import { type SelectedCandleChangeNativeEvent } from '../TradingChartsViewNativeComponent';
import { type SarSeriesOptions } from '../types';

const sar: SarSeriesOptions = {
  seriesId: 'sar',
  type: 'sar',
  paneId: 'main',
  priceScaleId: 'main',
  source: { type: 'ohlcvSar', seriesId: 'main' },
};

describe('SAR', () => {
  it('normalizes defaults identically for declarative and imperative APIs', () => {
    const normalized = resolveAdditionalSeriesOptions(sar);
    expect(normalized).toEqual({
      ...sar,
      visible: true,
      source: { ...sar.source, step: 0.02, maximum: 0.2 },
      appearance: {
        upColor: '#38D98A',
        downColor: '#FF3B64',
        reversalColor: '#9791A5',
      },
    });
    expect(
      resolveChartConfig({ chartId: 'chart', additionalSeries: [sar] })
        .additionalSeries[0]
    ).toEqual(normalized);
  });
  it('preserves custom parameters, colors, alpha and visibility', () => {
    const configured: SarSeriesOptions = {
      ...sar,
      visible: false,
      source: { ...sar.source, step: 0.1, maximum: 1 },
      appearance: {
        upColor: '#11223380',
        downColor: '#445566',
        reversalColor: '#778899',
      },
    };
    expect(resolveAdditionalSeriesOptions(configured)).toEqual(configured);
    expect(
      resolveChartConfig({ chartId: 'chart', additionalSeries: [configured] })
        .additionalSeries[0]
    ).toEqual(configured);
  });
  it.each([0, -1, NaN, Infinity, 0.21])('rejects invalid step %s', (step) => {
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...sar,
        source: { ...sar.source, step },
      })
    ).toThrow();
  });
  it.each([0, -1, NaN, Infinity, 0.01, 1.01])(
    'rejects invalid maximum %s',
    (maximum) => {
      expect(() =>
        resolveAdditionalSeriesOptions({
          ...sar,
          source: { ...sar.source, maximum },
        })
      ).toThrow();
    }
  );
  it.each(['upColor', 'downColor', 'reversalColor'] as const)(
    'validates %s',
    (key) => {
      expect(() =>
        resolveAdditionalSeriesOptions({ ...sar, appearance: { [key]: 'bad' } })
      ).toThrow();
    }
  );
  it('requires data-backed OHLC on the same pane and scale', () => {
    for (const seriesId of ['missing', 'sar']) {
      expect(() =>
        resolveChartConfig({
          chartId: 'chart',
          additionalSeries: [{ ...sar, source: { ...sar.source, seriesId } }],
        })
      ).toThrow();
    }
    expect(() =>
      resolveChartConfig({
        chartId: 'chart',
        panes: [
          {
            paneId: 'other',
            heightWeight: 1,
            priceScale: { priceScaleId: 'other' },
          },
        ],
        additionalSeries: [{ ...sar, paneId: 'other', priceScaleId: 'other' }],
      })
    ).toThrow();
    expect(() =>
      resolveChartConfig({
        chartId: 'chart',
        additionalSeries: [
          sar,
          {
            ...sar,
            seriesId: 'derived',
            source: { ...sar.source, seriesId: 'sar' },
          },
        ],
      })
    ).toThrow();
    expect(
      resolveChartConfig({
        chartId: 'chart',
        additionalSeries: [
          { ...sar, source: { ...sar.source, seriesId: 'ohlc' } },
          {
            seriesId: 'ohlc',
            type: 'candlestick',
            paneId: 'main',
            priceScaleId: 'main',
          },
        ],
      }).additionalSeries[0]
    ).toMatchObject({ source: { seriesId: 'ohlc' } });
  });
  it('preserves scalar crosshair values and warmup nulls', () => {
    const values = [8.06, null].map((value) => ({
      seriesId: 'sar',
      paneId: 'main',
      priceScaleId: 'main',
      kind: 'scalar',
      seriesType: 'sar',
      sourceType: 'ohlcvSar',
      value,
    }));
    const event: SelectedCandleChangeNativeEvent = {
      active: true,
      timestamp: 0,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 0,
      seriesValuesJson: JSON.stringify(values),
    };
    expect(selectedSeriesValuesFromNativeEvent(event)).toEqual(values);
    expect(
      selectedSeriesValuesFromNativeEvent({ ...event, active: false })
    ).toEqual([]);
  });
});
