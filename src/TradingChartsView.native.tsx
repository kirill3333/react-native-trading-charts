import { useMemo } from 'react';

import { resolveChartConfig } from './config';
import NativeTradingChartsView from './TradingChartsViewNativeComponent';
import { type TradingChartsViewProps } from './types';

export function TradingChartsView({
  chartId,
  timeframeMs,
  initialVisibleCount,
  theme,
  xAxis,
  yAxis,
  gestures,
  currentPrice,
  crosshair,
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
          theme,
          xAxis,
          yAxis,
          gestures,
          currentPrice,
          crosshair,
        })
      ),
    [
      chartId,
      crosshair,
      currentPrice,
      gestures,
      initialVisibleCount,
      theme,
      timeframeMs,
      xAxis,
      yAxis,
    ]
  );

  return (
    <NativeTradingChartsView
      {...viewProps}
      chartId={chartId}
      configJson={configJson}
    />
  );
}

export type { TradingChartsViewProps } from './types';
