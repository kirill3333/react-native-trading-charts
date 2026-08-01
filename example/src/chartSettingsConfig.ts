import {
  type ChartAppearance,
  type ChartFormatters,
  type ChartSeriesOptions,
  type CrosshairOptions,
  type CurrentPriceOptions,
  type GestureOptions,
  type PriceDisplayFormat,
  type PriceExtremesOptions,
  type YAxisValueFormat,
  type XAxisOptions,
  type YAxisOptions,
} from 'react-native-trading-charts';

import { type ChartSettings } from './chartSettingsState';

const STANDARD_APPEARANCE: ChartAppearance = {
  backgroundColor: '#100C18',
  grid: { color: '#292431', opacity: 0.65 },
  candles: { upColor: '#38D98A', downColor: '#FF3B64' },
  bars: { upColor: '#38D98A', downColor: '#FF3B64', lineWidth: 1 },
  line: {
    width: 2.5,
    color: '#2E90F5',
    gradient: { topColor: '#C51BFF', bottomColor: '#2E90F5' },
  },
  xAxis: { text: { color: '#9791A5', fontSize: 10.5 } },
  yAxis: { text: { color: '#9791A5', fontSize: 10.5 } },
  priceExtremes: {
    text: { color: '#B8B1C4', fontSize: 10.5 },
    connectorColor: '#777181',
    backgroundColor: '#100C18',
  },
  currentPrice: {
    line: { upColor: '#38D98A', downColor: '#FF3B64' },
    label: {
      upBackgroundColor: '#38D98A',
      downBackgroundColor: '#FF3B64',
      text: { color: '#100C18', fontWeight: 'semibold' },
    },
  },
  crosshair: {
    line: { color: '#A8A2B3', opacity: 0.85 },
    priceLabel: {
      backgroundColor: '#A8A2B3',
      text: { color: '#100C18', fontWeight: 'semibold' },
    },
    timeLabel: {
      backgroundColor: '#A8A2B3',
      text: { color: '#100C18', fontWeight: 'semibold' },
    },
  },
  tooltip: {
    backgroundColor: '#1B1723',
    headerText: { color: '#FFFFFF', fontWeight: 'semibold' },
    labelText: { color: '#9791A5' },
    valueText: { color: '#F5F2FA' },
    positiveValueColor: '#38D98A',
    negativeValueColor: '#FF3B64',
  },
};

const HIGH_CONTRAST_APPEARANCE: ChartAppearance = {
  backgroundColor: '#000000',
  grid: { color: '#20242A', opacity: 0.85 },
  candles: { upColor: '#21C99A', downColor: '#E31B5F' },
  bars: { upColor: '#21C99A', downColor: '#E31B5F', lineWidth: 1 },
  line: {
    width: 2.5,
    color: '#2E90F5',
    gradient: { topColor: '#C51BFF', bottomColor: '#2E90F5' },
  },
  xAxis: {
    text: { color: '#FFFFFF', fontSize: 11, fontWeight: 'semibold' },
  },
  yAxis: {
    text: { color: '#FFFFFF', fontSize: 11, fontWeight: 'semibold' },
  },
  priceExtremes: {
    text: { color: '#E5E7EB', fontSize: 11, fontWeight: 'semibold' },
    connectorColor: '#E5E7EB',
    backgroundColor: '#000000',
  },
  currentPrice: {
    line: { upColor: '#21C99A', downColor: '#E31B5F' },
    label: {
      upBackgroundColor: '#21C99A',
      downBackgroundColor: '#E31B5F',
      text: { color: '#000000', fontWeight: 'bold' },
      border: { color: '#FFFFFF', width: 1, radius: 5 },
    },
  },
  crosshair: {
    line: { color: '#F3F4F6', opacity: 1 },
    priceLabel: {
      backgroundColor: '#F3F4F6',
      text: { color: '#000000', fontWeight: 'bold' },
      border: { color: '#FFFFFF', width: 1, radius: 5 },
    },
    timeLabel: {
      backgroundColor: '#F3F4F6',
      text: { color: '#000000', fontWeight: 'bold' },
      border: { color: '#FFFFFF', width: 1, radius: 5 },
    },
  },
  tooltip: {
    backgroundColor: '#08090A',
    headerText: { color: '#FFFFFF', fontWeight: 'bold' },
    labelText: { color: '#E5E7EB', fontWeight: 'semibold' },
    valueText: { color: '#FFFFFF', fontWeight: 'semibold' },
    positiveValueColor: '#21C99A',
    negativeValueColor: '#E31B5F',
    border: { color: '#4B5563', width: 1, radius: 8 },
  },
};

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

  const appearancePreset =
    settings.themeMode === 'highContrast'
      ? HIGH_CONTRAST_APPEARANCE
      : STANDARD_APPEARANCE;

  return {
    series:
      settings.seriesType === 'line'
        ? { type: 'line', source: 'close' }
        : { type: settings.seriesType },
    appearance: {
      ...appearancePreset,
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
