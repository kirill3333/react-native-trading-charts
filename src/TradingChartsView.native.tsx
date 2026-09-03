import { memo, useCallback, useMemo } from 'react';
import { type NativeSyntheticEvent } from 'react-native';

import { resolveChartConfig } from './config';
import {
  selectedCandleFromNativeEvent,
  selectedSeriesValuesFromNativeEvent,
} from './events';
import NativeTradingChartsView, {
  type PaneResizeNativeEvent,
  type PriceScaleChangeNativeEvent,
  type ScaleChangeNativeEvent,
  type SelectedCandleChangeNativeEvent,
  type VisibleRangeChangeNativeEvent,
  type YAxisPressNativeEvent,
} from './TradingChartsViewNativeComponent';
import { type TradingChartsViewProps } from './types';

export const TradingChartsView = memo(function TradingChartsView({
  chartId,
  resolution,
  tradeAggregation,
  initialVisibleCount,
  defaultScale,
  series,
  panes,
  additionalSeries,
  panesResizable,
  theme,
  appearance,
  formatters,
  xAxis,
  yAxis,
  gestures,
  currentPrice,
  priceExtremes,
  crosshair,
  onVisibleRangeChange,
  onScaleChange,
  onYAxisScaleChange,
  onPaneResize,
  onPriceScaleChange,
  onYAxisPress,
  onSelectedCandleChange,
  ...viewProps
}: TradingChartsViewProps) {
  if (chartId.trim().length === 0) {
    throw new TypeError('chartId must be a non-empty string');
  }

  const configJson = useMemo(
    () =>
      JSON.stringify(
        resolveChartConfig({
          chartId,
          resolution,
          tradeAggregation,
          initialVisibleCount,
          defaultScale,
          series,
          panes,
          additionalSeries,
          panesResizable,
          theme,
          appearance,
          formatters,
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
      appearance,
      additionalSeries,
      crosshair,
      currentPrice,
      defaultScale,
      formatters,
      gestures,
      initialVisibleCount,
      panes,
      panesResizable,
      priceExtremes,
      resolution,
      series,
      theme,
      tradeAggregation,
      xAxis,
      yAxis,
    ]
  );

  const handleVisibleRangeChange = useCallback(
    (event: NativeSyntheticEvent<VisibleRangeChangeNativeEvent>) => {
      onVisibleRangeChange?.(event.nativeEvent);
    },
    [onVisibleRangeChange]
  );
  const handleScaleChange = useCallback(
    (event: NativeSyntheticEvent<ScaleChangeNativeEvent>) => {
      onScaleChange?.(event.nativeEvent);
    },
    [onScaleChange]
  );
  const handleYAxisScaleChange = useCallback(
    (event: NativeSyntheticEvent<ScaleChangeNativeEvent>) => {
      onYAxisScaleChange?.(event.nativeEvent);
    },
    [onYAxisScaleChange]
  );
  const handlePaneResize = useCallback(
    (event: NativeSyntheticEvent<PaneResizeNativeEvent>) => {
      onPaneResize?.(event.nativeEvent);
    },
    [onPaneResize]
  );
  const handlePriceScaleChange = useCallback(
    (event: NativeSyntheticEvent<PriceScaleChangeNativeEvent>) => {
      onPriceScaleChange?.(event.nativeEvent);
    },
    [onPriceScaleChange]
  );
  const handleSelectedCandleChange = useCallback(
    (event: NativeSyntheticEvent<SelectedCandleChangeNativeEvent>) => {
      onSelectedCandleChange?.(
        selectedCandleFromNativeEvent(event.nativeEvent),
        selectedSeriesValuesFromNativeEvent(event.nativeEvent)
      );
    },
    [onSelectedCandleChange]
  );
  const handleYAxisPress = useCallback(
    (event: NativeSyntheticEvent<YAxisPressNativeEvent>) => {
      onYAxisPress?.(event.nativeEvent);
    },
    [onYAxisPress]
  );

  return (
    <NativeTradingChartsView
      {...viewProps}
      chartId={chartId}
      configJson={configJson}
      yAxisPressEnabled={onYAxisPress != null}
      onVisibleRangeChange={
        onVisibleRangeChange ? handleVisibleRangeChange : undefined
      }
      onScaleChange={onScaleChange ? handleScaleChange : undefined}
      onYAxisScaleChange={
        onYAxisScaleChange ? handleYAxisScaleChange : undefined
      }
      onPaneResize={onPaneResize ? handlePaneResize : undefined}
      onPriceScaleChange={
        onPriceScaleChange ? handlePriceScaleChange : undefined
      }
      onYAxisPress={onYAxisPress ? handleYAxisPress : undefined}
      onSelectedCandleChange={
        onSelectedCandleChange ? handleSelectedCandleChange : undefined
      }
    />
  );
});

export type { TradingChartsViewProps } from './types';
