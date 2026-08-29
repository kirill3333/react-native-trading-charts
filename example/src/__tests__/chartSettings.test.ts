import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_CHART_SETTINGS,
  chartSettingsReducer,
  type ChartSettings,
} from '../chartSettingsState';
import {
  buildMainSeriesColors,
  buildMacdSeries,
  buildMovingAverageSeries,
  buildRsiAppearance,
  buildVolumeAppearance,
  buildChartPanes,
  buildChartViewConfig,
  shouldUseSignificantPriceFormat,
} from '../chartSettingsConfig';
import { APP_THEMES } from '../theme';
import { isHexColor, normalizeHexColor } from '../hexColor';

function settingsWith(patch: Partial<ChartSettings>): ChartSettings {
  return { ...DEFAULT_CHART_SETTINGS, ...patch };
}

describe('chart settings', () => {
  it('uses the current chart defaults', () => {
    expect(DEFAULT_CHART_SETTINGS).toMatchObject({
      seriesType: 'candlestick',
      seriesLineWidth: 1.5,
      mainUpColorOverride: null,
      mainDownColorOverride: null,
      mainLineColorOverride: null,
      mainAreaFillTopColorOverride: null,
      mainAreaFillBottomColorOverride: null,
      volumeUpColorOverride: null,
      volumeDownColorOverride: null,
      mainPaneHeightWeight: 3,
      volumePaneHeightWeight: 1,
      rsiPaneHeightWeight: 1,
      macdPaneHeightWeight: 1,
      rsiLineWidth: 0.5,
      rsiLineColorOverride: null,
      rsiTextColorOverride: null,
      rsiBandColorOverride: null,
      rsiLevelLineColorOverride: null,
      smaEnabled: false,
      smaPeriod: 20,
      smaValueSource: 'close',
      smaLineWidth: 0.5,
      smaLineStyle: 'solid',
      smaLineColor: '#2E90F5',
      smaGradientEnabled: false,
      emaEnabled: false,
      emaPeriod: 50,
      emaValueSource: 'close',
      emaLineWidth: 0.5,
      emaLineStyle: 'dashed',
      emaLineColor: '#F5A623',
      emaGradientEnabled: false,
      macdFastPeriod: 12,
      macdSlowPeriod: 26,
      macdSignalPeriod: 9,
      macdValueSource: 'close',
      macdLineColor: null,
      macdSignalLineColor: null,
      macdPositiveIncreasingColor: null,
      macdZeroLineColor: null,
      themeMode: 'dark',
      xAxisSpacing: 'time',
      yAxisPosition: 'right',
      yAxisScaleMargins: 'default',
      crosshairLineStyle: 'dashed',
      crosshairTooltipOpacity: 0.85,
      locale: 'en-GB',
      timeZone: 'utc',
      yAxisFormat: 'auto',
    });
  });

  it('builds MACD from theme defaults and independent component styles', () => {
    expect(buildMacdSeries(DEFAULT_CHART_SETTINGS)).toMatchObject({
      seriesId: 'macd',
      type: 'macd',
      paneId: 'macd',
      priceScaleId: 'macd',
      source: {
        type: 'ohlcvMacd',
        seriesId: 'main',
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        valueSource: 'close',
      },
      appearance: {
        macdLine: { color: APP_THEMES.dark.macd.lineColor },
        signalLine: { color: APP_THEMES.dark.macd.signalLineColor },
        histogram: {
          positiveIncreasingColor:
            APP_THEMES.dark.macd.positiveIncreasingColor,
          negativeDecreasingColor:
            APP_THEMES.dark.macd.negativeDecreasingColor,
        },
        textColor: APP_THEMES.dark.macd.textColor,
        zeroLineColor: APP_THEMES.dark.macd.zeroLineColor,
      },
    });

    const custom =
      buildMacdSeries(
        settingsWith({
          themeMode: 'light',
          macdFastPeriod: 8,
          macdSlowPeriod: 21,
          macdSignalPeriod: 5,
          macdValueSource: 'high',
          macdLineStyle: 'dashed',
          macdLineColor: '#112233',
          macdGradientEnabled: true,
          macdGradientTopColor: '#223344',
          macdGradientBottomColor: '#334455',
          macdSignalLineWidth: 2.5,
          macdSignalLineColor: '#445566',
          macdPositiveIncreasingColor: '#556677',
          macdZeroLineColor: '#66778880',
        })
      );
    expect(custom).toMatchObject({
      source: {
        fastPeriod: 8,
        slowPeriod: 21,
        signalPeriod: 5,
        valueSource: 'high',
      },
      appearance: {
        macdLine: {
          style: 'dashed',
          color: '#112233',
          gradient: { topColor: '#223344', bottomColor: '#334455' },
        },
        signalLine: { width: 2.5, color: '#445566' },
        histogram: { positiveIncreasingColor: '#556677' },
        zeroLineColor: '#66778880',
      },
    });
  });

  it.each([0.00000001, 0.000000000001])(
    'uses significant MACD formatting for a tiny market with minMove %s',
    (minMove) => {
      const panes = buildChartPanes(settingsWith({ locale: 'en-US' }), {
        minMove,
        showVolume: false,
        showRsi: false,
        showMacd: true,
      });

      expect(panes).toHaveLength(2);
      expect(panes?.[1]).toEqual({
        paneId: 'macd',
        heightWeight: 1,
        minHeight: 96,
        priceScale: {
          priceScaleId: 'macd',
          valueFormat: {
            type: 'significant',
            significantDigits: 3,
            minMove,
            locale: 'en-US',
            useGrouping: false,
          },
        },
      });
    }
  );

  it('builds enabled SMA and EMA overlays with independent styles', () => {
    expect(buildMovingAverageSeries(DEFAULT_CHART_SETTINGS)).toEqual([]);

    const series = buildMovingAverageSeries(
      settingsWith({
        smaEnabled: true,
        smaPeriod: 10,
        smaValueSource: 'high',
        smaLineWidth: 1,
        smaLineStyle: 'dashed',
        smaLineColor: '#112233',
        smaGradientEnabled: true,
        smaGradientTopColor: '#445566',
        smaGradientBottomColor: '#778899',
        emaEnabled: true,
        emaPeriod: 100,
        emaValueSource: 'low',
        emaLineWidth: 2.5,
        emaLineStyle: 'solid',
        emaLineColor: '#AABBCC',
      })
    );

    expect(series).toEqual([
      {
        seriesId: 'sma',
        type: 'line',
        paneId: 'main',
        priceScaleId: 'main',
        source: {
          type: 'ohlcvSma',
          seriesId: 'main',
          period: 10,
          valueSource: 'high',
        },
        appearance: {
          width: 1,
          color: '#112233',
          style: 'dashed',
          gradient: { topColor: '#445566', bottomColor: '#778899' },
        },
      },
      {
        seriesId: 'ema',
        type: 'line',
        paneId: 'main',
        priceScaleId: 'main',
        source: {
          type: 'ohlcvEma',
          seriesId: 'main',
          period: 100,
          valueSource: 'low',
        },
        appearance: {
          width: 2.5,
          color: '#AABBCC',
          style: 'solid',
        },
      },
    ]);
  });

  it('uses themed RSI colors until a user override is set', () => {
    expect(buildRsiAppearance(DEFAULT_CHART_SETTINGS)).toEqual({
      width: 0.5,
      color: APP_THEMES.dark.rsiColor,
      textColor: APP_THEMES.dark.rsiTextColor,
      levelLineColor: APP_THEMES.dark.rsiLevelLineColor,
      bandColor: APP_THEMES.dark.rsiBandColor,
    });

    const light = settingsWith({ themeMode: 'light' });
    expect(buildRsiAppearance(light)).toMatchObject({
      color: APP_THEMES.light.rsiColor,
      textColor: APP_THEMES.light.rsiTextColor,
    });

    const customized = settingsWith({
      themeMode: 'light',
      rsiLineWidth: 2.5,
      rsiLineColorOverride: '#112233',
      rsiTextColorOverride: '#445566',
      rsiBandColorOverride: '#77889922',
      rsiLevelLineColorOverride: '#AABBCC80',
    });
    expect(buildRsiAppearance(customized)).toEqual({
      width: 2.5,
      color: '#112233',
      textColor: '#445566',
      bandColor: '#77889922',
      levelLineColor: '#AABBCC80',
    });
  });

  it('uses themed main and volume colors until user overrides are set', () => {
    expect(buildMainSeriesColors(DEFAULT_CHART_SETTINGS)).toEqual({
      upColor: '#38D98A',
      downColor: '#FF3B64',
      lineColor: '#2E90F5',
      areaFillTopColor: '#2E90F566',
      areaFillBottomColor: '#2E90F500',
    });
    expect(buildVolumeAppearance(DEFAULT_CHART_SETTINGS)).toEqual({
      upColor: APP_THEMES.dark.volumeUpColor,
      downColor: APP_THEMES.dark.volumeDownColor,
    });

    const light = settingsWith({ themeMode: 'light', seriesType: 'area' });
    expect(buildMainSeriesColors(light)).toEqual({
      upColor: '#089981',
      downColor: '#F23645',
      lineColor: '#2962FF',
      areaFillTopColor: '#2962FF33',
      areaFillBottomColor: '#2962FF00',
    });
    expect(buildVolumeAppearance(light)).toEqual({
      upColor: APP_THEMES.light.volumeUpColor,
      downColor: APP_THEMES.light.volumeDownColor,
    });

    const customized = settingsWith({
      themeMode: 'light',
      seriesType: 'area',
      mainUpColorOverride: '#112233',
      mainDownColorOverride: '#445566',
      mainLineColorOverride: '#778899',
      mainAreaFillTopColorOverride: '#AABBCC66',
      mainAreaFillBottomColorOverride: '#AABBCC00',
      volumeUpColorOverride: '#12345680',
      volumeDownColorOverride: '#65432180',
    });
    expect(buildMainSeriesColors(customized)).toEqual({
      upColor: '#112233',
      downColor: '#445566',
      lineColor: '#778899',
      areaFillTopColor: '#AABBCC66',
      areaFillBottomColor: '#AABBCC00',
    });
    expect(buildVolumeAppearance(customized)).toEqual({
      upColor: '#12345680',
      downColor: '#65432180',
    });
  });

  it('preserves color overrides while untouched colors follow theme changes', () => {
    const customized = chartSettingsReducer(DEFAULT_CHART_SETTINGS, {
      type: 'update',
      patch: {
        mainUpColorOverride: '#112233',
        volumeDownColorOverride: '#44556680',
      },
    });
    const light = chartSettingsReducer(customized, {
      type: 'update',
      patch: { themeMode: 'light' },
    });

    expect(buildMainSeriesColors(light)).toMatchObject({
      upColor: '#112233',
      downColor: '#F23645',
    });
    expect(buildVolumeAppearance(light)).toEqual({
      upColor: APP_THEMES.light.volumeUpColor,
      downColor: '#44556680',
    });
  });

  it('accepts only supported HEX colors without changing the last valid value', () => {
    expect(isHexColor('#12abEF')).toBe(true);
    expect(isHexColor('#12abEF80')).toBe(true);
    expect(isHexColor('#123')).toBe(false);
    expect(isHexColor('purple')).toBe(false);
    expect(normalizeHexColor(' #12abef80 ')).toBe('#12ABEF80');
  });

  it('updates a partial group and restores every default', () => {
    const updated = chartSettingsReducer(DEFAULT_CHART_SETTINGS, {
      type: 'update',
      patch: {
        seriesType: 'bar',
        themeMode: 'light',
        mainUpColorOverride: '#123456',
        volumeDownColorOverride: '#65432180',
        panEnabled: false,
        yAxisPosition: 'left',
      },
    });

    expect(updated).toMatchObject({
      seriesType: 'bar',
      themeMode: 'light',
      mainUpColorOverride: '#123456',
      volumeDownColorOverride: '#65432180',
      panEnabled: false,
      yAxisPosition: 'left',
      zoomEnabled: true,
    });
    expect(chartSettingsReducer(updated, { type: 'reset' })).toEqual(
      DEFAULT_CHART_SETTINGS
    );
  });

  it('keeps market precision and minMove in the default view config', () => {
    const config = buildChartViewConfig(
      DEFAULT_CHART_SETTINGS,
      { useSignificantPriceFormat: false, minMove: 0.001, precision: 3 },
      'Europe/London'
    );

    expect(config.xAxis).toMatchObject({
      locale: 'en-GB',
      spacing: 'time',
      timeZone: 'UTC',
      visible: true,
    });
    expect(config.series).toEqual({ type: 'candlestick' });
    expect(config.yAxis).toMatchObject({
      position: 'right',
      scaleMargins: { top: 0.2, bottom: 0.1 },
      valueFormat: {
        type: 'price',
        precision: 3,
        minMove: 0.001,
        useGrouping: true,
      },
    });
    expect(config.appearance).toMatchObject({
      backgroundColor: '#100C18',
      tooltip: { backgroundOpacity: 0.85 },
    });
    expect(config.appearance.currentPrice?.label?.border).toBeUndefined();
    expect(config.appearance.crosshair?.priceLabel?.border).toBeUndefined();
    expect(config.appearance.crosshair?.timeLabel?.border).toBeUndefined();
    expect(config.appearance.tooltip?.border).toBeUndefined();
  });

  it('passes hollow candlesticks through to the native view config', () => {
    const config = buildChartViewConfig(
      settingsWith({ seriesType: 'hollowCandlestick' }),
      { useSignificantPriceFormat: false, minMove: 0.01, precision: 2 },
      'Europe/London'
    );

    expect(config.series).toEqual({ type: 'hollowCandlestick' });
    expect(config.appearance.candles).toEqual({
      upColor: '#38D98A',
      downColor: '#FF3B64',
    });
  });

  it('switches the example to the gradient close line preset', () => {
    const config = buildChartViewConfig(
      settingsWith({ seriesType: 'line' }),
      { useSignificantPriceFormat: false, minMove: 0.01, precision: 2 },
      'Europe/London'
    );

    expect(config.series).toEqual({ type: 'line', source: 'close' });
    expect(config.appearance.line).toEqual({
      width: 1.5,
      color: '#2E90F5',
      gradient: { topColor: '#C51BFF', bottomColor: '#2E90F5' },
    });
  });

  it('switches the example to the close area preset', () => {
    const config = buildChartViewConfig(
      settingsWith({ seriesType: 'area' }),
      { useSignificantPriceFormat: false, minMove: 0.01, precision: 2 },
      'Europe/London'
    );

    expect(config.series).toEqual({ type: 'area', source: 'close' });
    expect(config.appearance.area).toEqual({
      width: 1.5,
      color: '#2E90F5',
      fill: { topColor: '#2E90F566', bottomColor: '#2E90F500' },
    });
  });

  it('applies the selected width to line and area appearances', () => {
    const darkConfig = buildChartViewConfig(
      settingsWith({ seriesType: 'area', seriesLineWidth: 2.5 }),
      { useSignificantPriceFormat: false, minMove: 0.01, precision: 2 }
    );
    const lightConfig = buildChartViewConfig(
      settingsWith({
        seriesType: 'line',
        seriesLineWidth: 2.5,
        themeMode: 'light',
      }),
      { useSignificantPriceFormat: false, minMove: 0.01, precision: 2 }
    );

    expect(darkConfig.appearance.line?.width).toBe(2.5);
    expect(darkConfig.appearance.area?.width).toBe(2.5);
    expect(lightConfig.appearance.line).toEqual({
      width: 2.5,
      color: '#2962FF',
    });
    expect(lightConfig.appearance.area).toEqual({
      width: 2.5,
      color: '#2962FF',
      fill: { topColor: '#2962FF33', bottomColor: '#2962FF00' },
    });
  });

  it('applies main color overrides and replaces the line gradient', () => {
    const lineConfig = buildChartViewConfig(
      settingsWith({
        seriesType: 'line',
        mainUpColorOverride: '#112233',
        mainDownColorOverride: '#445566',
        mainLineColorOverride: '#778899',
      }),
      { useSignificantPriceFormat: false, minMove: 0.01, precision: 2 }
    );
    const areaConfig = buildChartViewConfig(
      settingsWith({
        seriesType: 'area',
        mainLineColorOverride: '#AABBCC',
        mainAreaFillTopColorOverride: '#AABBCC66',
        mainAreaFillBottomColorOverride: '#AABBCC00',
      }),
      { useSignificantPriceFormat: false, minMove: 0.01, precision: 2 }
    );

    expect(lineConfig.appearance.candles).toMatchObject({
      upColor: '#112233',
      downColor: '#445566',
    });
    expect(lineConfig.appearance.bars).toMatchObject({
      upColor: '#112233',
      downColor: '#445566',
    });
    expect(lineConfig.appearance.line).toEqual({
      width: 1.5,
      color: '#778899',
    });
    expect(lineConfig.appearance.line?.gradient).toBeUndefined();
    expect(areaConfig.appearance.area).toEqual({
      width: 1.5,
      color: '#AABBCC',
      fill: {
        topColor: '#AABBCC66',
        bottomColor: '#AABBCC00',
      },
    });
  });

  it('builds the complete light and formatting presets', () => {
    const config = buildChartViewConfig(
      settingsWith({
        seriesType: 'bar',
        themeMode: 'light',
        crosshairTooltipOpacity: 1,
        currencySymbol: '$',
        locale: 'en-US',
        timeZone: 'device',
        yAxisFormat: 'compact',
        yAxisScaleMargins: 'loose',
      }),
      { useSignificantPriceFormat: false, minMove: 0.01, precision: 2 },
      'America/New_York'
    );

    expect(config.appearance).toMatchObject({
      backgroundColor: '#FFFFFF',
      grid: { color: '#E0E3EB', opacity: 0.75 },
      candles: { upColor: '#089981', downColor: '#F23645' },
      bars: {
        upColor: '#089981',
        downColor: '#F23645',
        lineWidth: 1,
      },
      xAxis: { text: { color: '#2A2E39' } },
      currentPrice: {
        label: {
          upBackgroundColor: '#089981',
          downBackgroundColor: '#F23645',
          text: { color: '#FFFFFF', fontWeight: 'semibold' },
        },
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        backgroundOpacity: 1,
        valueText: { color: '#131722' },
        border: { color: '#E0E3EB', width: 1, radius: 8 },
      },
    });
    expect(config.series).toEqual({ type: 'bar' });
    expect(config.xAxis.timeZone).toBe('America/New_York');
    expect(config.yAxis).toMatchObject({
      scaleMargins: { top: 0.3, bottom: 0.2 },
      valueFormat: {
        type: 'compact',
        currencySymbol: '$',
        locale: 'en-US',
        minMove: 0.01,
        precision: 2,
      },
    });
    expect(config.formatters.price?.tooltip).toMatchObject({
      type: 'compact',
      currencySymbol: '$',
      locale: 'en-US',
      useGrouping: true,
    });
    expect(config.formatters.date?.tooltipHeader).toMatchObject({
      locale: 'en-US',
      timeZone: 'America/New_York',
    });
  });

  it('does not mutate a theme preset when tooltip opacity changes', () => {
    const translucent = buildChartViewConfig(
      settingsWith({ crosshairTooltipOpacity: 0.6 }),
      { useSignificantPriceFormat: false, minMove: 1, precision: 0 }
    );
    const defaultOpacity = buildChartViewConfig(DEFAULT_CHART_SETTINGS, {
      useSignificantPriceFormat: false,
      minMove: 1,
      precision: 0,
    });
    const lightOpacity = buildChartViewConfig(
      settingsWith({ themeMode: 'light', crosshairTooltipOpacity: 1 }),
      { useSignificantPriceFormat: false, minMove: 1, precision: 0 }
    );

    expect(translucent.appearance.tooltip?.backgroundOpacity).toBe(0.6);
    expect(defaultOpacity.appearance.tooltip?.backgroundOpacity).toBe(0.85);
    expect(lightOpacity.appearance.tooltip?.backgroundOpacity).toBe(1);
    expect(APP_THEMES.dark.chartAppearance.tooltip?.backgroundOpacity).toBe(
      undefined
    );
    expect(APP_THEMES.light.chartAppearance.tooltip?.backgroundOpacity).toBe(
      undefined
    );
  });

  it('exposes only dark and light example themes', () => {
    expect(Object.keys(APP_THEMES)).toEqual(['dark', 'light']);
  });

  it('uses zero-count formatting only for the Y axis of tiny markets', () => {
    const config = buildChartViewConfig(DEFAULT_CHART_SETTINGS, {
      useSignificantPriceFormat: true,
      minMove: 0.00000001,
      precision: 8,
    });

    expect(config.yAxis.valueFormat).toEqual({
      type: 'significant',
      significantDigits: 3,
      minMove: 0.00000001,
      locale: 'en-GB',
      currencySymbol: '',
      useGrouping: true,
    });
    expect(config.formatters.price?.currentPrice).toMatchObject({
      type: 'price',
      precision: 8,
    });
    expect(config.formatters.price?.tooltip).toMatchObject({
      type: 'price',
      precision: 8,
    });
  });

  it('selects significant formatting only for prices with leading fractional zeros', () => {
    expect(shouldUseSignificantPriceFormat(0.056602)).toBe(true);
    expect(shouldUseSignificantPriceFormat(0.0000058)).toBe(true);
    expect(shouldUseSignificantPriceFormat(-0.05)).toBe(true);
    expect(shouldUseSignificantPriceFormat(0)).toBe(false);
    expect(shouldUseSignificantPriceFormat(0.99983)).toBe(false);
    expect(shouldUseSignificantPriceFormat(-0.5)).toBe(false);
    expect(shouldUseSignificantPriceFormat(0.1)).toBe(false);
    expect(shouldUseSignificantPriceFormat(1)).toBe(false);
  });
});
