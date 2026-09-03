import { type SelectedCandleChangeNativeEvent } from './TradingChartsViewNativeComponent';
import { type CrosshairSeriesValue, type OhlcCandle } from './types';

export function selectedCandleFromNativeEvent(
  event: SelectedCandleChangeNativeEvent
): OhlcCandle | null {
  if (!event.active) return null;
  return {
    timestamp: event.timestamp,
    open: event.open,
    high: event.high,
    low: event.low,
    close: event.close,
    volume: event.volume,
  };
}

export function selectedSeriesValuesFromNativeEvent(
  event: SelectedCandleChangeNativeEvent
): ReadonlyArray<CrosshairSeriesValue> {
  if (!event.active) return [];
  // SAFETY: both native emitters serialize the closed CrosshairSeriesValue union.
  return JSON.parse(event.seriesValuesJson) as CrosshairSeriesValue[];
}
