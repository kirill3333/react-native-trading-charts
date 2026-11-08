import { describe, expect, it } from '@jest/globals';
import { resolveAdditionalSeriesOptions, resolveChartConfig } from '../config';
import {
  type AdditionalChartSeriesOptions,
  type KdjSeriesOptions,
  type WilliamsRSeriesOptions,
} from '../types';

const wr: WilliamsRSeriesOptions = {
  seriesId: 'wr',
  type: 'line',
  paneId: 'wr',
  priceScaleId: 'wr',
  source: { type: 'ohlcvWilliamsR', seriesId: 'main' },
};
const kdj: KdjSeriesOptions = {
  seriesId: 'kdj',
  type: 'kdj',
  paneId: 'kdj',
  priceScaleId: 'kdj',
  source: { type: 'ohlcvKdj', seriesId: 'main' },
};
const panes = ['main', 'wr', 'kdj'].map((paneId) => ({
  paneId,
  heightWeight: 1,
  priceScale: { priceScaleId: paneId },
}));
const resolve = (additionalSeries: AdditionalChartSeriesOptions[]) =>
  resolveChartConfig({ chartId: 'chart', panes, additionalSeries })
    .additionalSeries;

describe('Williams %R and KDJ', () => {
  it('normalizes the same parameters for declarative and imperative series', () => {
    for (const series of [
      [resolveAdditionalSeriesOptions(wr), resolveAdditionalSeriesOptions(kdj)],
      resolve([wr, kdj]),
    ]) {
      expect(series[0]).toMatchObject({
        levels: { oversold: -80, overbought: -20 },
        source: { period: 14 },
        legendVisible: true,
      });
      expect(series[1]).toMatchObject({
        source: { period: 9, m1: 3, m2: 3 },
        legendVisible: true,
      });
    }
    const styled = {
      ...kdj,
      source: { ...kdj.source, m1: 2, m2: 4 },
      legendVisible: false,
      appearance: { dLine: { color: '#123456' }, jLine: { width: 3 } },
    };
    expect(resolve([styled])[0]).toEqual(
      resolveAdditionalSeriesOptions(styled)
    );
    expect(resolve([styled])[0]).toMatchObject(styled);
  });

  it('allows multiple instances and forward references to a data-backed source', () => {
    expect(
      resolve([
        { ...wr, source: { ...wr.source, seriesId: 'ohlc' } },
        { ...wr, seriesId: 'wr2' },
        { seriesId: 'ohlc', type: 'bar', paneId: 'main', priceScaleId: 'main' },
      ])
    ).toHaveLength(3);
  });

  it('protects both dedicated scales, independent of declaration order', () => {
    const other = { ...kdj, paneId: 'wr', priceScaleId: 'wr' };
    expect(() => resolve([wr, other])).toThrow();
    expect(() => resolve([other, wr])).toThrow();
    for (const options of [wr, kdj]) {
      expect(() =>
        resolveAdditionalSeriesOptions({ ...options, paneId: 'main' })
      ).toThrow();
    }
    expect(() =>
      resolve([wr, { ...kdj, source: { ...kdj.source, seriesId: 'wr' } }])
    ).toThrow();
  });

  it('rejects invalid levels, unsigned periods and line styles', () => {
    expect(() =>
      resolveAdditionalSeriesOptions({ ...wr, levels: { overbought: 5 } })
    ).toThrow();
    expect(() =>
      resolveAdditionalSeriesOptions({ ...wr, levels: { oversold: -20 } })
    ).toThrow();
    for (const key of ['period', 'm1', 'm2']) {
      for (const value of [0, 1.5, 2 ** 32]) {
        expect(() =>
          resolveAdditionalSeriesOptions({
            ...kdj,
            source: { ...kdj.source, [key]: value },
          })
        ).toThrow();
      }
    }
    expect(() =>
      resolveAdditionalSeriesOptions({
        ...kdj,
        appearance: { kLine: { width: -1 } },
      })
    ).toThrow();
  });
});
