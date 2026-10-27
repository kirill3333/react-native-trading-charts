import {
  type ChartAppearance,
  type ChartFormatters,
  type ChartSeriesOptions,
  type CrosshairOptions,
  type CurrentPriceOptions,
  type GestureOptions,
  type PriceScaleMargins,
  type PriceExtremesOptions,
  type XAxisOptions,
  type YAxisOptions,
} from 'react-native-trading-charts';

import {
  type ChartSettings,
  type ScaleMarginPreset,
} from '../stores/chartSettingsStore';
import { APP_THEMES } from '../theme';
import { buildBaselineAppearance } from '../baselineSettings';
import { buildPriceFormats, type MarketChartFormat } from './priceFormats';

export const SCALE_MARGIN_PRESETS = {
  tight: { top: 0.1, bottom: 0.1 },
  default: { top: 0.2, bottom: 0.1 },
  loose: { top: 0.3, bottom: 0.2 },
} satisfies Record<ScaleMarginPreset, PriceScaleMargins>;

const DEVICE_TIME_ZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export type ChartViewConfig = {
  appearance: ChartAppearance;
  series: ChartSeriesOptions;
  crosshair: CrosshairOptions;
  currentPrice: CurrentPriceOptions;
  priceExtremes: PriceExtremesOptions;
  gestures: GestureOptions;
  formatters: ChartFormatters;
  xAxis: XAxisOptions;
  yAxis: YAxisOptions;
};

export type MainSeriesColors = {
  upColor: string;
  downColor: string;
  lineColor: string;
  areaFillTopColor: string;
  areaFillBottomColor: string;
};

export function buildMainSeriesColors(
  settings: ChartSettings
): MainSeriesColors {
  const theme = APP_THEMES[settings.themeMode];
  const appearance = theme.chartAppearance;
  const themedLineColor =
    settings.seriesType === 'area'
      ? appearance.area?.color
      : appearance.line?.color;

  return {
    upColor:
      settings.mainUpColorOverride ??
      appearance.candles?.upColor ??
      theme.colors.positive,
    downColor:
      settings.mainDownColorOverride ??
      appearance.candles?.downColor ??
      theme.colors.negative,
    lineColor:
      settings.mainLineColorOverride ?? themedLineColor ?? theme.colors.accent,
    areaFillTopColor:
      settings.mainAreaFillTopColorOverride ??
      appearance.area?.fill?.topColor ??
      '#00000000',
    areaFillBottomColor:
      settings.mainAreaFillBottomColorOverride ??
      appearance.area?.fill?.bottomColor ??
      '#00000000',
  };
}

function buildMainSeriesOptions(settings: ChartSettings): ChartSeriesOptions {
  if (settings.seriesType === 'baseline') {
    return {
      type: 'baseline',
      source: settings.baselineSource,
      baseValue: {
        type: settings.baselineMode,
        value:
          settings.baselineMode === 'price'
            ? settings.baselinePrice
            : settings.baselinePercentage,
      },
    };
  }
  if (settings.seriesType === 'line' || settings.seriesType === 'area') {
    return { type: settings.seriesType, source: 'close' };
  }
  return { type: settings.seriesType };
}

export function buildChartViewConfig(
  settings: ChartSettings,
  market: MarketChartFormat,
  deviceTimeZone = DEVICE_TIME_ZONE
): ChartViewConfig {
  const timeZone = settings.timeZone === 'utc' ? 'UTC' : deviceTimeZone;
  const { yAxisValueFormat, displayFormat } = buildPriceFormats(
    settings,
    market
  );

  const appearancePreset = APP_THEMES[settings.themeMode].chartAppearance;
  const mainColors = buildMainSeriesColors(settings);
  const lineAppearance =
    settings.mainLineColorOverride == null
      ? {
          ...appearancePreset.line,
          width: settings.seriesLineWidth,
          rounded: settings.lineRounded,
        }
      : {
          width: settings.seriesLineWidth,
          rounded: settings.lineRounded,
          color: mainColors.lineColor,
        };
  const areaAppearance = {
    ...(settings.mainLineColorOverride == null
      ? appearancePreset.area
      : { color: mainColors.lineColor }),
    width: settings.seriesLineWidth,
    rounded: settings.areaRounded,
    fill: {
      topColor: mainColors.areaFillTopColor,
      bottomColor: mainColors.areaFillBottomColor,
    },
  };

  return {
    series: buildMainSeriesOptions(settings),
    appearance: {
      ...appearancePreset,
      candles: {
        ...appearancePreset.candles,
        upColor: mainColors.upColor,
        downColor: mainColors.downColor,
      },
      bars: {
        ...appearancePreset.bars,
        upColor: mainColors.upColor,
        downColor: mainColors.downColor,
      },
      baseline: {
        ...buildBaselineAppearance(settings),
        rounded: settings.baselineRounded,
      },
      line: lineAppearance,
      area: areaAppearance,
      tooltip: {
        ...appearancePreset.tooltip,
        backgroundOpacity: settings.crosshairTooltipOpacity,
      },
    },
    crosshair: {
      enabled: settings.crosshairEnabled,
      showTooltip: settings.crosshairShowTooltip,
      tooltipBackgroundOpacity: settings.crosshairTooltipOpacity,
      lineStyle: settings.crosshairLineStyle,
    },
    currentPrice: {
      visible: settings.currentPriceVisible,
      showLabel: settings.currentPriceShowLabel,
      pinToEdge: settings.currentPricePinToEdge,
    },
    priceExtremes: { visible: settings.priceExtremesVisible },
    gestures: {
      pan: settings.panEnabled,
      zoom: settings.zoomEnabled,
    },
    formatters: {
      date: {
        xAxis: {
          locale: settings.locale,
          timeZone,
          seconds: 'HH:mm:ss',
          time: 'HH:mm',
          day: 'd MMM',
          month: 'MMM yyyy',
          year: 'yyyy',
        },
        crosshairTimeBadge: {
          pattern: 'd MMM HH:mm:ss',
          locale: settings.locale,
          timeZone,
        },
        tooltipHeader: {
          pattern: 'd MMM yyyy HH:mm:ss',
          locale: settings.locale,
          timeZone,
        },
      },
      price: {
        yAxis: yAxisValueFormat,
        priceExtremes: displayFormat,
        currentPrice: displayFormat,
        crosshairPrice: displayFormat,
        tooltip: displayFormat,
      },
    },
    xAxis: {
      visible: settings.xAxisVisible,
      locale: settings.locale,
      showSeconds: settings.xAxisShowSeconds,
      spacing: settings.xAxisSpacing,
      timeZone,
    },
    yAxis: {
      visible: settings.yAxisVisible,
      scaleMargins: SCALE_MARGIN_PRESETS[settings.yAxisScaleMargins],
      valueFormat: yAxisValueFormat,
    },
  };
}
