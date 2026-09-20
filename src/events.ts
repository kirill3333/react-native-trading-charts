import { type MarkerPressEvent, type ResolvedChartMarker } from './markers';
import {
  type MarkerPressNativeEvent,
  type SelectedCandleChangeNativeEvent,
} from './TradingChartsViewNativeComponent';
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

export function markerPressFromNativeEvent(
  event: MarkerPressNativeEvent,
  chartId: string
): MarkerPressEvent | null {
  if (event.chartId !== chartId) return null;
  // SAFETY: native retains the validated, normalized marker JSON from the displayed snapshot.
  const marker = JSON.parse(event.markerJson) as ResolvedChartMarker;
  return { marker, x: event.x, y: event.y };
}
