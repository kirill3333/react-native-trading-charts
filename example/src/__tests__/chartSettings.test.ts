import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_CHART_SETTINGS,
  chartSettingsReducer,
  type ChartSettings,
} from '../chartSettingsState';
import {
  buildChartViewConfig,
  shouldUseSignificantPriceFormat,
} from '../chartSettingsConfig';

function settingsWith(patch: Partial<ChartSettings>): ChartSettings {
  return { ...DEFAULT_CHART_SETTINGS, ...patch };
}

describe('chart settings', () => {
  it('uses the current chart defaults', () => {
    expect(DEFAULT_CHART_SETTINGS).toMatchObject({
      seriesType: 'candlestick',
      seriesLineWidth: 1.5,
      themeMode: 'default',
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

  it('updates a partial group and restores every default', () => {
    const updated = chartSettingsReducer(DEFAULT_CHART_SETTINGS, {
      type: 'update',
      patch: {
        seriesType: 'bar',
        themeMode: 'highContrast',
        panEnabled: false,
        yAxisPosition: 'left',
      },
    });

    expect(updated).toMatchObject({
      seriesType: 'bar',
      themeMode: 'highContrast',
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
    const config = buildChartViewConfig(
      settingsWith({ seriesType: 'area', seriesLineWidth: 2.5 }),
      { useSignificantPriceFormat: false, minMove: 0.01, precision: 2 }
    );

    expect(config.appearance.line?.width).toBe(2.5);
    expect(config.appearance.area?.width).toBe(2.5);
  });

  it('builds the complete high contrast and formatting presets', () => {
    const config = buildChartViewConfig(
      settingsWith({
        seriesType: 'bar',
        themeMode: 'highContrast',
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
      backgroundColor: '#000000',
      grid: { color: '#20242A' },
      candles: { upColor: '#21C99A', downColor: '#E31B5F' },
      bars: {
        upColor: '#21C99A',
        downColor: '#E31B5F',
        lineWidth: 1,
      },
      xAxis: { text: { color: '#FFFFFF', fontWeight: 'semibold' } },
      tooltip: {
        backgroundColor: '#08090A',
        backgroundOpacity: 1,
        valueText: { color: '#FFFFFF', fontWeight: 'semibold' },
        border: { color: '#4B5563', width: 1, radius: 8 },
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

    expect(translucent.appearance.tooltip?.backgroundOpacity).toBe(0.6);
    expect(defaultOpacity.appearance.tooltip?.backgroundOpacity).toBe(0.85);
  });

  it('uses zero-count formatting only for the Y axis of tiny markets', () => {
    const config = buildChartViewConfig(
      DEFAULT_CHART_SETTINGS,
      { useSignificantPriceFormat: true, minMove: 0.00000001, precision: 8 }
    );

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
