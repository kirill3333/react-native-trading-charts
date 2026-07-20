import { memo, useMemo } from 'react';
import { StyleSheet, type NativeSyntheticEvent } from 'react-native';
import {
  TradingChartsView,
  type VisibleRangeChangeEvent,
} from 'react-native-trading-charts';

import { useChartSettings } from '../chartSettings';
import { buildChartViewConfig } from '../chartSettingsConfig';

type InteractiveChartProps = {
  chartId: string;
  timeframeMs: number;
  precision: number;
  minMove: number;
  onVisibleRangeChange: (
    event: NativeSyntheticEvent<VisibleRangeChangeEvent>
  ) => void;
};

export const InteractiveChart = memo(function InteractiveChart({
  chartId,
  timeframeMs,
  precision,
  minMove,
  onVisibleRangeChange,
}: InteractiveChartProps) {
  const { settings } = useChartSettings();
  const chartConfig = useMemo(
    () => buildChartViewConfig(settings, { minMove, precision }),
    [minMove, precision, settings]
  );

  return (
    <TradingChartsView
      chartId={chartId}
      appearance={chartConfig.appearance}
      crosshair={chartConfig.crosshair}
      currentPrice={chartConfig.currentPrice}
      priceExtremes={chartConfig.priceExtremes}
      gestures={chartConfig.gestures}
      formatters={chartConfig.formatters}
      initialVisibleCount={48}
      defaultScale={1.25}
      onVisibleRangeChange={onVisibleRangeChange}
      style={styles.chart}
      timeframeMs={timeframeMs}
      xAxis={chartConfig.xAxis}
      yAxis={chartConfig.yAxis}
    />
  );
});

const styles = StyleSheet.create({
  chart: { flex: 1 },
});
