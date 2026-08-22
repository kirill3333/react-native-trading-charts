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

  return {
    series:
      settings.seriesType === 'line' || settings.seriesType === 'area'
        ? { type: settings.seriesType, source: 'close' }
        : { type: settings.seriesType },
    appearance: {
      ...appearancePreset,
      line: {
        ...appearancePreset.line,
        width: settings.seriesLineWidth,
      },
      area: {
        ...appearancePreset.area,
        width: settings.seriesLineWidth,
      },
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
