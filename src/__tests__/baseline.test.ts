import { describe, expect, it } from '@jest/globals';
import { resolveAdditionalSeriesOptions, resolveChartConfig } from '../config';
import { type BaselineBaseValue } from '../types';

const baseProps = {
  chartId: 'baseline',
  series: { type: 'baseline' as const },
};
const additional = {
  type: 'baseline' as const,
  seriesId: 'comparison',
  paneId: 'main',
  priceScaleId: 'main',
};

describe('baseline configuration', () => {
  it('resolves a midpoint base and themed appearance', () => {
    const config = resolveChartConfig(baseProps);
    expect(config.series).toEqual({
      type: 'baseline',
      source: 'close',
      baseValue: { type: 'percentage', value: 50 },
    });
    expect(config.appearance.baseline).toMatchObject({
      width: 1.5,
      style: 'solid',
      rounded: true,
      topLineColor: config.theme.upColor,
      bottomLineColor: config.theme.downColor,
      topFill: {
        topColor: `${config.theme.upColor.slice(0, 7)}40`,
        bottomColor: `${config.theme.upColor.slice(0, 7)}00`,
      },
      baseLine: {
        visible: true,
        width: 1,
        style: 'dashed',
        color: config.theme.gridColor,
      },
    });
    expect(config.appearance.currentPrice.line).toEqual({
      upColor: config.theme.upColor,
      downColor: config.theme.downColor,
    });
  });

  it.each<BaselineBaseValue>([
    { type: 'price', value: -10 },
    { type: 'price', value: 0 },
    { type: 'percentage', value: 0 },
    { type: 'percentage', value: 100 },
  ])('accepts base %p for both entry points', (baseValue) => {
    expect(
      resolveChartConfig({
        ...baseProps,
        series: {
          type: 'baseline',
          baseValue,
          source: 'high',
          gapThresholdMs: 1000,
        },
      }).series
    ).toMatchObject({ baseValue, source: 'high', gapThresholdMs: 1000 });
    expect(
      resolveAdditionalSeriesOptions({ ...additional, baseValue })
    ).toMatchObject({ baseValue, source: 'close', visible: true });
  });

  it.each<BaselineBaseValue>([
    { type: 'price', value: NaN },
    { type: 'price', value: Infinity },
    { type: 'percentage', value: -1 },
    { type: 'percentage', value: 101 },
  ])('rejects invalid base %p', (baseValue) => {
    expect(() =>
      resolveChartConfig({
        ...baseProps,
        series: { type: 'baseline', baseValue },
      })
    ).toThrow(TypeError);
    expect(() =>
      resolveAdditionalSeriesOptions({ ...additional, baseValue })
    ).toThrow(TypeError);
  });

  it('inherits additional appearance field by field and preserves imperative omissions', () => {
    const config = resolveChartConfig({
      ...baseProps,
      appearance: {
        baseline: {
          width: 3,
          bottomLineColor: '#0000FF',
          topFill: { bottomColor: '#FFFFFF00' },
          baseLine: { visible: false },
        },
        currentPrice: { line: { upColor: '#ABCDEF' } },
      },
      additionalSeries: [
        {
          ...additional,
          appearance: {
            topLineColor: '#00FF00',
            topFill: { topColor: '#00FF0040' },
          },
        },
      ],
    });
    expect(config.additionalSeries[0]).toMatchObject({
      appearance: {
        width: 3,
        topLineColor: '#00FF00',
        bottomLineColor: '#0000FF',
        topFill: { topColor: '#00FF0040', bottomColor: '#FFFFFF00' },
        baseLine: { visible: false },
      },
    });
    expect(config.appearance.currentPrice.line.upColor).toBe('#ABCDEF');
    expect(resolveAdditionalSeriesOptions(additional)).not.toHaveProperty(
      'appearance'
    );
  });

  it.each([
    { width: 0 },
    { width: Infinity },
    { topLineColor: 'red' },
    { bottomFill: { bottomColor: '#nope' } },
    { baseLine: { width: -1 } },
  ])('rejects invalid appearance %p', (appearance) => {
    expect(() =>
      resolveChartConfig({ ...baseProps, appearance: { baseline: appearance } })
    ).toThrow(TypeError);
    expect(() =>
      resolveAdditionalSeriesOptions({ ...additional, appearance })
    ).toThrow(TypeError);
  });
});
