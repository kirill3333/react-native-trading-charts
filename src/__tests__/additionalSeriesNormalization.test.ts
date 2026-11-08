import { describe, expect, it } from '@jest/globals';
import { resolveAdditionalSeriesOptions, resolveChartConfig } from '../config';
import { type AdditionalChartSeriesOptions } from '../types';

const main = { seriesId: 'comparison', paneId: 'main', priceScaleId: 'main' };
const oscillator = { ...main, paneId: 'indicator', priceScaleId: 'indicator' };
const panes = [main, oscillator].map(({ paneId, priceScaleId }) => ({
  paneId,
  heightWeight: 1,
  priceScale: { priceScaleId },
}));

function configured(...additionalSeries: AdditionalChartSeriesOptions[]) {
  return resolveChartConfig({
    chartId: 'chart',
    panes,
    theme: { axisTextColor: '#123456', upColor: '#224466' },
    additionalSeries,
  }).additionalSeries;
}

describe('additional series normalization', () => {
  const cases = [
    { ...main, type: 'candlestick' },
    { ...main, type: 'hollowCandlestick', visible: false },
    { ...main, type: 'bar' },
    { ...main, type: 'line' },
    { ...main, type: 'area', source: 'high', gapThresholdMs: 1200 },
    { ...main, type: 'baseline' },
    { ...main, type: 'histogram' },
    {
      ...main,
      type: 'histogram',
      source: { type: 'ohlcvVolume', seriesId: 'main' },
      legendVisible: false,
    },
    {
      ...main,
      type: 'line',
      source: { type: 'ohlcvSma', seriesId: 'main', period: 5 },
    },
    {
      ...main,
      type: 'line',
      source: {
        type: 'ohlcvEma',
        seriesId: 'main',
        period: 8,
        valueSource: 'low',
      },
    },
    {
      ...oscillator,
      type: 'line',
      source: { type: 'ohlcvRsi', seriesId: 'main' },
    },
    {
      ...oscillator,
      type: 'line',
      source: { type: 'ohlcvWilliamsR', seriesId: 'main' },
    },
    {
      ...oscillator,
      type: 'macd',
      source: { type: 'ohlcvMacd', seriesId: 'main' },
    },
    {
      ...oscillator,
      type: 'kdj',
      source: { type: 'ohlcvKdj', seriesId: 'main' },
    },
    { ...main, type: 'sar', source: { type: 'ohlcvSar', seriesId: 'main' } },
    { ...main, type: 'boll', source: { type: 'ohlcvBoll', seriesId: 'main' } },
  ] satisfies AdditionalChartSeriesOptions[];

  it.each(cases)('normalizes %j consistently', (input) => {
    const imperative = resolveAdditionalSeriesOptions(input);
    const [declarative] = configured(input);
    expect(declarative).toMatchObject(imperative);
    // The chart may supply additional appearance defaults, but no other fields.
    expect({ ...declarative, appearance: undefined }).toStrictEqual({
      ...imperative,
      appearance: undefined,
    });
  });

  const invalid = [
    [{ ...main, type: 'bar', seriesId: 'main' }, '.seriesId'],
    [{ ...main, type: 'candlestick', priceScaleId: 'a b' }, '.priceScaleId'],
    [{ ...main, type: 'line', gapThresholdMs: 0 }, '.gapThresholdMs'],
    [
      { ...main, type: 'area', appearance: { fill: { topColor: 'red' } } },
      '.appearance.fill.topColor',
    ],
    [
      {
        ...main,
        type: 'histogram',
        source: { seriesId: 'a b', type: 'ohlcvVolume' },
      },
      '.source.seriesId may contain only',
    ],
    [
      {
        ...oscillator,
        type: 'macd',
        source: {
          // SAFETY: exercise an invalid source tag supplied by a JavaScript caller.
          type: 'data' as never,
          seriesId: 'main',
        },
      },
      '.source.type',
    ],
  ] satisfies [AdditionalChartSeriesOptions, string][];

  it.each(invalid)('rejects %j with the field path', (input, field) => {
    expect(() => resolveAdditionalSeriesOptions(input)).toThrow(
      `options${field}`
    );
    expect(() => configured(input)).toThrow(`additionalSeries[0]${field}`);
  });

  it('fills a partial histogram appearance from the chart theme', () => {
    const input = {
      ...main,
      type: 'histogram',
      appearance: { downColor: '#334455' },
    } satisfies AdditionalChartSeriesOptions;
    expect(resolveAdditionalSeriesOptions(input)).toEqual({
      ...input,
      visible: true,
      source: { type: 'data' },
    });
    expect(configured(input)[0]).toMatchObject({
      appearance: {
        downColor: '#334455',
        color: '#123456',
        upColor: '#224466',
      },
    });
  });

  it('checks pane and source membership only with the chart configuration', () => {
    const input = {
      ...main,
      type: 'histogram',
      source: { type: 'ohlcvVolume', seriesId: 'later' },
    } satisfies AdditionalChartSeriesOptions;
    const source = {
      ...main,
      seriesId: 'later',
      type: 'bar',
    } satisfies AdditionalChartSeriesOptions;
    expect(resolveAdditionalSeriesOptions(input)).toMatchObject(input);
    expect(() => configured(input)).toThrow('source.seriesId');
    expect(configured(input, source)).toHaveLength(2);
    expect(() => configured(source, source)).toThrow('duplicate seriesId');
    const orphan = { ...source, paneId: 'missing' };
    expect(resolveAdditionalSeriesOptions(orphan)).toMatchObject(orphan);
    expect(() => configured(orphan)).toThrow('unknown pane');
  });
});
