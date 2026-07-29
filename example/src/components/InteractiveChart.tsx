import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  TradingChartsView,
  type AdditionalChartSeriesOptions,
  type ChartPaneOptions,
  type VisibleRangeChangeEvent,
} from 'react-native-trading-charts';

import { useChartSettings } from '../chartSettings';
import {
  buildChartViewConfig,
  shouldUseSignificantPriceFormat,
} from '../chartSettingsConfig';

type InteractiveChartProps = {
  chartId: string;
  timeframeMs: number;
  lastPrice: number;
  precision: number;
  minMove: number;
  showVolume: boolean;
  volumeHeightWeight: number;
  onVisibleRangeChange: (event: VisibleRangeChangeEvent) => void;
};

export const InteractiveChart = memo(function InteractiveChart({
  chartId,
  timeframeMs,
  lastPrice,
  precision,
  minMove,
  showVolume,
  volumeHeightWeight,
  onVisibleRangeChange,
}: InteractiveChartProps) {
  const { settings } = useChartSettings();
  const useSignificantPriceFormat = shouldUseSignificantPriceFormat(lastPrice);
  const chartConfig = useMemo(
    () =>
      buildChartViewConfig(settings, {
        useSignificantPriceFormat,
        minMove,
        precision,
      }),
    [minMove, precision, settings, useSignificantPriceFormat]
  );
  const panes = useMemo<ReadonlyArray<ChartPaneOptions> | undefined>(
    () =>
      showVolume
        ? [
            {
              paneId: 'main',
              heightWeight: 3,
              priceScale: { priceScaleId: 'main' },
            },
            {
              paneId: 'volume',
              heightWeight: volumeHeightWeight,
              minHeight: 56,
              priceScale: {
                priceScaleId: 'volume',
                valueFormat: { type: 'volume', precision: 1 },
              },
            },
          ]
        : undefined,
    [showVolume, volumeHeightWeight]
  );
  const additionalSeries = useMemo<
    ReadonlyArray<AdditionalChartSeriesOptions> | undefined
  >(
    () =>
      showVolume
        ? [
            {
              seriesId: 'volume',
              type: 'histogram',
              paneId: 'volume',
              priceScaleId: 'volume',
              source: { type: 'ohlcvVolume', seriesId: 'main' },
              appearance: {
                upColor: '#38D98A80',
                downColor: '#FF3B6480',
              },
            },
          ]
        : undefined,
    [showVolume]
  );

  return (
    <TradingChartsView
      additionalSeries={additionalSeries}
      chartId={chartId}
      appearance={chartConfig.appearance}
      series={chartConfig.series}
      crosshair={chartConfig.crosshair}
      currentPrice={chartConfig.currentPrice}
      priceExtremes={chartConfig.priceExtremes}
      gestures={chartConfig.gestures}
      formatters={chartConfig.formatters}
      initialVisibleCount={48}
      defaultScale={1.25}
      onVisibleRangeChange={onVisibleRangeChange}
      panes={panes}
      panesResizable
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
