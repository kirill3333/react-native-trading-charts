import {
  type ChartAppearance,
  type ChartFormatters,
  type ChartSeriesOptions,
  type CrosshairOptions,
  type CurrentPriceOptions,
  type GestureOptions,
  type PriceDisplayFormat,
  type PriceExtremesOptions,
  type RsiSeriesAppearance,
  type YAxisValueFormat,
  type XAxisOptions,
  type YAxisOptions,
} from 'react-native-trading-charts';

import { type ChartSettings } from './chartSettingsState';
import { APP_THEMES } from './theme';

export const SCALE_MARGIN_PRESETS = {
  tight: { top: 0.1, bottom: 0.1 },
  default: { top: 0.2, bottom: 0.1 },
  loose: { top: 0.3, bottom: 0.2 },
} as const;

const DEVICE_TIME_ZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

type MarketChartFormat = {
  useSignificantPriceFormat: boolean;
  precision: number;
  minMove: number;
};

export function shouldUseSignificantPriceFormat(lastPrice: number): boolean {
  const magnitude = Math.abs(lastPrice);
  // Significant formatting is useful once a price has at least one leading
  // fractional zero (for example, 0.056602 -> 0.0₁566). Near one it can erase
  // the instrument's meaningful fractional ticks: 0.99983 rounded to three
  // significant digits becomes 1, as do nearby values just above one.
  return magnitude > 0 && magnitude < 0.1;
}

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

type VolumeAppearance = {
  upColor: string;
  downColor: string;
};

export function buildVolumeAppearance(
  settings: ChartSettings
): VolumeAppearance {
  const theme = APP_THEMES[settings.themeMode];
  return {
    upColor: settings.volumeUpColorOverride ?? theme.volumeUpColor,
    downColor: settings.volumeDownColorOverride ?? theme.volumeDownColor,
  };
}

export function buildRsiAppearance(
  settings: ChartSettings
): Required<
  Pick<
    RsiSeriesAppearance,
    'width' | 'color' | 'textColor' | 'levelLineColor' | 'bandColor'
  >
> {
  const theme = APP_THEMES[settings.themeMode];
  return {
    width: settings.rsiLineWidth,
    color: settings.rsiLineColorOverride ?? theme.rsiColor,
    textColor: settings.rsiTextColorOverride ?? theme.rsiTextColor,
    levelLineColor:
      settings.rsiLevelLineColorOverride ?? theme.rsiLevelLineColor,
    bandColor: settings.rsiBandColorOverride ?? theme.rsiBandColor,
  };
}

export function buildChartViewConfig(
  settings: ChartSettings,
  market: MarketChartFormat,
  deviceTimeZone = DEVICE_TIME_ZONE
): ChartViewConfig {
  const timeZone = settings.timeZone === 'utc' ? 'UTC' : deviceTimeZone;
  const currencySymbol = settings.currencySymbol.trim();
  let yAxisValueFormat: YAxisValueFormat;
  let displayFormat: PriceDisplayFormat;

  if (settings.yAxisFormat === 'compact') {
    yAxisValueFormat = {
      type: 'compact',
      precision: market.precision,
      minMove: market.minMove,
      locale: settings.locale,
      currencySymbol,
    };
    displayFormat = {
      type: 'compact',
      precision: market.precision,
      locale: settings.locale,
      currencySymbol,
      useGrouping: settings.yAxisUseGrouping,
    };
  } else if (
    settings.yAxisFormat === 'auto' &&
    market.useSignificantPriceFormat
  ) {
    yAxisValueFormat = {
      type: 'significant',
      significantDigits: 3,
      minMove: market.minMove,
      locale: settings.locale,
      currencySymbol,
      useGrouping: settings.yAxisUseGrouping,
    };
    displayFormat = {
      type: 'price',
      precision: market.precision,
      locale: settings.locale,
      currencySymbol,
      useGrouping: settings.yAxisUseGrouping,
    };
  } else {
    yAxisValueFormat = {
      type: 'price',
      precision: market.precision,
      minMove: market.minMove,
      locale: settings.locale,
      currencySymbol,
      useGrouping: settings.yAxisUseGrouping,
    };
    displayFormat = {
      type: 'price',
      precision: market.precision,
      locale: settings.locale,
      currencySymbol,
      useGrouping: settings.yAxisUseGrouping,
    };
  }

  const appearancePreset = APP_THEMES[settings.themeMode].chartAppearance;
  const mainColors = buildMainSeriesColors(settings);
  const lineAppearance =
    settings.mainLineColorOverride == null
      ? {
          ...appearancePreset.line,
          width: settings.seriesLineWidth,
        }
      : {
          width: settings.seriesLineWidth,
          color: mainColors.lineColor,
        };
  const areaAppearance = {
    ...(settings.mainLineColorOverride == null
      ? appearancePreset.area
      : { color: mainColors.lineColor }),
    width: settings.seriesLineWidth,
    fill: {
      topColor: mainColors.areaFillTopColor,
      bottomColor: mainColors.areaFillBottomColor,
    },
  };

  return {
    series:
      settings.seriesType === 'line' || settings.seriesType === 'area'
        ? { type: settings.seriesType, source: 'close' }
        : { type: settings.seriesType },
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
      position: settings.yAxisPosition,
      scaleMargins: SCALE_MARGIN_PRESETS[settings.yAxisScaleMargins],
      valueFormat: yAxisValueFormat,
    },
  };
}
