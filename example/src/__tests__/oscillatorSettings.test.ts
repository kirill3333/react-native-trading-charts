import { describe, expect, it } from '@jest/globals';
import { buildChartPanes } from '../chartConfig/panes';
import { buildAdditionalSeries } from '../chartConfig/indicators';
import { DEFAULT_CHART_SETTINGS } from '../stores/chartSettingsStore';

describe('oscillator panels', () => {
  it('builds one pane per enabled oscillator on both chart screens', () => {
    const settings = {
      ...DEFAULT_CHART_SETTINGS,
      williamsRPeriod: 7,
      kdjM1: 2,
      kdjM2: 4,
    };
    const controls = {
      minMove: 0.01,
      showRsi: false,
      showMacd: false,
      showVolume: false,
    };
    expect(buildChartPanes(settings, controls)).toBeUndefined();
    const enabled = { ...controls, showWilliamsR: true, showKdj: true };
    expect(
      buildChartPanes(settings, enabled)?.map((pane) => pane.paneId)
    ).toEqual(['main', 'williamsR', 'kdj']);
    expect(buildAdditionalSeries(settings, enabled)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          seriesId: 'williamsR',
          source: { type: 'ohlcvWilliamsR', seriesId: 'main', period: 7 },
        }),
        expect.objectContaining({
          seriesId: 'kdj',
          source: {
            type: 'ohlcvKdj',
            seriesId: 'main',
            period: 9,
            m1: 2,
            m2: 4,
          },
        }),
      ])
    );
  });
});
