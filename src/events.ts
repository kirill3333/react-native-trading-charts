import { type SelectedCandleChangeNativeEvent } from './TradingChartsViewNativeComponent';
import { type OhlcCandle } from './types';

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
