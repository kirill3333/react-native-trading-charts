import {
  type YAxisValueFormat,
  type PriceDisplayFormat,
} from 'react-native-trading-charts';

import { type ChartSettings } from '../stores/chartSettingsStore';

export type MarketChartFormat = {
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

export function buildPriceFormats(
  settings: ChartSettings,
  market: MarketChartFormat
) {
  const shared = {
    locale: settings.locale,
    currencySymbol: settings.currencySymbol.trim(),
  };
  const displayFormat: PriceDisplayFormat = {
    ...shared,
    type: settings.yAxisFormat === 'compact' ? 'compact' : 'price',
    precision: market.precision,
    useGrouping: settings.yAxisUseGrouping,
  };
  let yAxisValueFormat: YAxisValueFormat;
  if (settings.yAxisFormat === 'compact') {
    yAxisValueFormat = {
      ...shared,
      type: 'compact',
      precision: market.precision,
      minMove: market.minMove,
    };
  } else if (
    settings.yAxisFormat === 'auto' &&
    market.useSignificantPriceFormat
  ) {
    yAxisValueFormat = {
      ...shared,
      type: 'significant',
      significantDigits: 3,
      minMove: market.minMove,
      useGrouping: settings.yAxisUseGrouping,
    };
  } else {
    yAxisValueFormat = {
      ...shared,
      type: 'price',
      precision: market.precision,
      minMove: market.minMove,
      useGrouping: settings.yAxisUseGrouping,
    };
  }
  return { yAxisValueFormat, displayFormat };
}
