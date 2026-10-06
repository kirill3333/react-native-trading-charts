import { describe, expect, it } from '@jest/globals';
import { resolveAdditionalSeriesOptions, resolveChartConfig } from '../config';
import { selectedSeriesValuesFromNativeEvent } from '../events';
import { type SelectedCandleChangeNativeEvent } from '../TradingChartsViewNativeComponent';
import { type BollSeriesOptions } from '../types';

const boll: BollSeriesOptions = {
  seriesId: 'boll',
  type: 'boll',
  paneId: 'main',
  priceScaleId: 'main',
  source: { type: 'ohlcvBoll', seriesId: 'main' },
};

describe('BOLL', () => {
  it('normalizes defaults and preserves component styles for both APIs', () => {
    const options: BollSeriesOptions = {
      ...boll,
      gapThresholdMs: 60000,
      appearance: {
        upperLine: { width: 2.5, style: 'dashed', color: '#11223380' },
        middleLine: {
          gradient: { topColor: '#112233', bottomColor: '#445566' },
        },
        fill: {
          enabled: false,
          topColor: '#11223344',
          bottomColor: '#44556600',
        },
      },
    };
    const normalized = resolveAdditionalSeriesOptions(options);
    expect(normalized).toMatchObject({
      visible: true,
      source: {
        period: 20,
        stdDevMultiplier: 2,
        valueSource: 'close',
      },
      appearance: options.appearance,
      gapThresholdMs: 60000,
    });
    expect(
      resolveChartConfig({ chartId: 'test', additionalSeries: [options] })
        .additionalSeries[0]
    ).toEqual(normalized);
  });
  it.each([0, -1, 1.2, 4294967296, NaN, Infinity])(
    'rejects invalid period %s',
    (period) => {
      expect(() =>
        resolveAdditionalSeriesOptions({
          ...boll,
          source: { ...boll.source, period },
        })
      ).toThrow();
    }
  );
  it.each([0, -1, NaN, Infinity])(
    'rejects invalid multiplier %s',
    (stdDevMultiplier) => {
      expect(() =>
        resolveAdditionalSeriesOptions({
          ...boll,
          source: { ...boll.source, stdDevMultiplier },
        })
      ).toThrow();
    }
  );
  it('accepts period limits and fractional multipliers', () => {
    for (const period of [1, 4294967295]) {
      expect(
        resolveAdditionalSeriesOptions({
          ...boll,
          source: {
            ...boll.source,
            period,
            stdDevMultiplier: 1.5,
            valueSource: 'high',
          },
        })
      ).toMatchObject({
        source: { period, stdDevMultiplier: 1.5, valueSource: 'high' },
      });
    }
  });
  it('validates component styles, fill and source binding', () => {
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...boll,
        appearance: { upperLine: { width: 0 } },
      })
    ).toThrow();
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...boll,
        appearance: { fill: { topColor: 'bad' } },
      })
    ).toThrow();
    expect(() =>
      resolveChartConfig({
        chartId: 'test',
        additionalSeries: [
          { ...boll, source: { ...boll.source, seriesId: 'missing' } },
        ],
      })
    ).toThrow();
    expect(() =>
      resolveChartConfig({
        chartId: 'test',
        additionalSeries: [
          boll,
          {
            ...boll,
            seriesId: 'other',
            source: { ...boll.source, seriesId: 'boll' },
          },
        ],
      })
    ).toThrow();
    expect(() =>
      resolveChartConfig({
        chartId: 'test',
        panes: [
          {
            paneId: 'other',
            heightWeight: 1,
            priceScale: { priceScaleId: 'other' },
          },
        ],
        additionalSeries: [{ ...boll, paneId: 'other', priceScaleId: 'other' }],
      })
    ).toThrow();
  });
  it('preserves BOLL crosshair values including warmup nulls', () => {
    const values = [
      {
        seriesId: 'boll',
        paneId: 'main',
        priceScaleId: 'main',
        kind: 'boll',
        seriesType: 'boll',
        sourceType: 'ohlcvBoll',
        upper: 12,
        middle: 10,
        lower: 8,
      },
      {
        seriesId: 'warmup',
        kind: 'boll',
        upper: null,
        middle: null,
        lower: null,
      },
    ];
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
