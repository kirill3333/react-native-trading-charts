import { useCallback, useMemo } from 'react';
import { type NativeSyntheticEvent } from 'react-native';

import { resolveChartConfig } from './config';
import { selectedCandleFromNativeEvent } from './events';
import NativeTradingChartsView, {
  type SelectedCandleChangeNativeEvent,
} from './TradingChartsViewNativeComponent';
import { type TradingChartsViewProps } from './types';

export function TradingChartsView({
  chartId,
  timeframeMs,
  initialVisibleCount,
  defaultScale,
  theme,
  xAxis,
  yAxis,
  gestures,
  currentPrice,
  priceExtremes,
  crosshair,
  onSelectedCandleChange,
  ...viewProps
}: TradingChartsViewProps) {
  if (typeof chartId !== 'string' || chartId.trim().length === 0) {
    throw new TypeError('chartId must be a non-empty string');
  }

  const configJson = useMemo(
    () =>
      JSON.stringify(
        resolveChartConfig({
          chartId,
          timeframeMs,
          initialVisibleCount,
          defaultScale,
          theme,
          xAxis,
          yAxis,
          gestures,
          currentPrice,
          priceExtremes,
          crosshair,
        })
      ),
    [
      chartId,
      crosshair,
      currentPrice,
      defaultScale,
      gestures,
      initialVisibleCount,
      priceExtremes,
      theme,
      timeframeMs,
      xAxis,
      yAxis,
    ]
  );

  const handleSelectedCandleChange = useCallback(
    (event: NativeSyntheticEvent<SelectedCandleChangeNativeEvent>) => {
      onSelectedCandleChange?.(
        selectedCandleFromNativeEvent(event.nativeEvent)
      );
    },
    [onSelectedCandleChange]
  );

  return (
    <NativeTradingChartsView
      {...viewProps}
      chartId={chartId}
      configJson={configJson}
      onSelectedCandleChange={
        onSelectedCandleChange ? handleSelectedCandleChange : undefined
      }
    />
  );
}

export type { TradingChartsViewProps } from './types';
