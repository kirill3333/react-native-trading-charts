import {
  type OhlcCandle,
  type PriceLineOptions,
} from 'react-native-trading-charts';

export type AllTimeExtremes = Readonly<{
  high: number;
  low: number;
}>;

type PriceLineApi = {
  setPriceLine(chartId: string, options: PriceLineOptions): void;
  removePriceLine(chartId: string, priceLineId: string): void;
};

export const ALL_TIME_HIGH_PRICE_LINE_ID = 'all-time-high';
export const ALL_TIME_LOW_PRICE_LINE_ID = 'all-time-low';

export function extendAllTimeExtremes(
  current: AllTimeExtremes | null,
  candles: ReadonlyArray<OhlcCandle>
): AllTimeExtremes | null {
  let high = current?.high ?? -Infinity;
  let low = current?.low ?? Infinity;

  candles.forEach((candle) => {
    high = Math.max(high, candle.high);
    low = Math.min(low, candle.low);
  });

  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    return null;
  }
  if (current?.high === high && current.low === low) {
    return current;
  }
  return { high, low };
}

export function calculateAllTimeExtremes(
  candles: ReadonlyArray<OhlcCandle>
): AllTimeExtremes | null {
  return extendAllTimeExtremes(null, candles);
}

export function removeAllTimePriceLines(
  charts: PriceLineApi,
  chartId: string
) {
  charts.removePriceLine(chartId, ALL_TIME_HIGH_PRICE_LINE_ID);
  charts.removePriceLine(chartId, ALL_TIME_LOW_PRICE_LINE_ID);
}

export function syncAllTimePriceLines(
  charts: PriceLineApi,
  chartId: string,
  visible: boolean,
  extremes: AllTimeExtremes | null,
  colors: { high: string; low: string }
) {
  if (!visible || extremes == null) {
    removeAllTimePriceLines(charts, chartId);
    return;
  }

  charts.setPriceLine(chartId, {
    id: ALL_TIME_HIGH_PRICE_LINE_ID,
    price: extremes.high,
    label: 'ATH',
    color: colors.high,
  });
  charts.setPriceLine(chartId, {
    id: ALL_TIME_LOW_PRICE_LINE_ID,
    price: extremes.low,
    label: 'ATL',
    color: colors.low,
  });
}
