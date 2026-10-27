import { buildChartViewConfig } from '../chartSettingsConfig';
import { beforeEach, expect, it } from '@jest/globals';
import { buildBaselineAppearance } from '../baselineSettings';
import {
  DEFAULT_CHART_SETTINGS,
  useChartSettingsStore,
} from '../stores/chartSettingsStore';
import { parseSettingNumber } from '../settingNumber';

beforeEach(() => useChartSettingsStore.getState().resetSettings());

it('keeps baseline settings across chart and theme changes', () => {
  const store = useChartSettingsStore.getState();
  store.updateSettings({
    seriesType: 'baseline',
    baselineMode: 'price',
    baselinePrice: -5,
    baselineAppearance: {
      topLineColor: '#123456',
      topFill: { bottomColor: '#ABCDEF20' },
    },
  });
  store.updateSettings({ seriesType: 'area', themeMode: 'light' });
  store.updateSettings({ seriesType: 'baseline' });
  const settings = useChartSettingsStore.getState().settings;
  expect(settings.baselinePrice).toBe(-5);
  expect(buildBaselineAppearance(settings)).toMatchObject({
    topLineColor: '#123456',
    topFill: { bottomColor: '#ABCDEF20' },
  });
  expect(DEFAULT_CHART_SETTINGS.seriesType).toBe('candlestick');
  expect(DEFAULT_CHART_SETTINGS.baselinePercentage).toBe(50);
});

it('allows signed baseline values without relaxing positive settings', () => {
  expect(parseSettingNumber('-5,25', false, true)).toBe(-5.25);
  expect(parseSettingNumber('0', false, true)).toBe(0);
  expect(parseSettingNumber('-5', false)).toBeNull();
  expect(parseSettingNumber('0', false)).toBeNull();
  expect(parseSettingNumber('Infinity', false, true)).toBeNull();
});

it('builds a fixed-price baseline with the selected OHLC source', () => {
  const config = buildChartViewConfig(
    {
      ...DEFAULT_CHART_SETTINGS,
      seriesType: 'baseline',
      baselineMode: 'price',
      baselinePrice: -2,
      baselineSource: 'high',
      baselineRounded: false,
    },
    { useSignificantPriceFormat: false, precision: 2, minMove: 0.01 }
  );
  expect(config.series).toEqual({
    type: 'baseline',
    source: 'high',
    baseValue: { type: 'price', value: -2 },
  });
  expect(config.appearance.baseline?.rounded).toBe(false);
});
