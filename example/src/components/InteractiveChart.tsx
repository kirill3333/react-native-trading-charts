import { memo, useMemo } from 'react';
import { StyleSheet, type NativeSyntheticEvent } from 'react-native';
import {
  TradingChartsView,
  type CrosshairOptions,
  type CurrentPriceOptions,
  type GestureOptions,
  type PriceExtremesOptions,
  type VisibleRangeChangeEvent,
  type XAxisOptions,
  type YAxisOptions,
} from 'react-native-trading-charts';

const CROSSHAIR_OPTIONS: CrosshairOptions = {
  enabled: true,
  showTooltip: true,
  tooltipBackgroundOpacity: 0.85,
  lineStyle: 'dashed',
};
const CURRENT_PRICE_OPTIONS: CurrentPriceOptions = {
  visible: true,
  showLabel: true,
};
const PRICE_EXTREMES_OPTIONS: PriceExtremesOptions = { visible: true };
const GESTURE_OPTIONS: GestureOptions = { pan: true, zoom: true };

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
  const xAxis = useMemo<XAxisOptions>(
    () => ({
      locale: 'en-GB',
      showSeconds: timeframeMs < 60_000,
      spacing: 'time',
      timeZone: 'UTC',
    }),
    [timeframeMs]
  );
  const yAxis = useMemo<YAxisOptions>(
    () => ({
      position: 'right',
      valueFormat: {
        type: 'price',
        precision,
        minMove,
        locale: 'en-GB',
      },
    }),
    [minMove, precision]
  );

  return (
    <TradingChartsView
      chartId={chartId}
      crosshair={CROSSHAIR_OPTIONS}
      currentPrice={CURRENT_PRICE_OPTIONS}
      priceExtremes={PRICE_EXTREMES_OPTIONS}
      gestures={GESTURE_OPTIONS}
      initialVisibleCount={48}
      defaultScale={1.25}
      onVisibleRangeChange={onVisibleRangeChange}
      style={styles.chart}
      timeframeMs={timeframeMs}
      xAxis={xAxis}
      yAxis={yAxis}
    />
  );
});

const styles = StyleSheet.create({
  chart: { flex: 1 },
});
