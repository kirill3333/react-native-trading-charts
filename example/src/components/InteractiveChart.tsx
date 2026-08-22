import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  TradingChartsView,
  type AdditionalChartSeriesOptions,
  type ChartResolution,
  type ChartPaneOptions,
  type VisibleRangeChangeEvent,
} from 'react-native-trading-charts';

import { useChartSettings } from '../chartSettings';
import {
  buildRsiAppearance,
  buildVolumeAppearance,
  buildChartViewConfig,
  shouldUseSignificantPriceFormat,
} from '../chartSettingsConfig';

type InteractiveChartProps = {
  chartId: string;
  resolution: ChartResolution;
  lastPrice: number;
  precision: number;
  minMove: number;
  showVolume: boolean;
  showRsi: boolean;
  onVisibleRangeChange: (event: VisibleRangeChangeEvent) => void;
};

export const InteractiveChart = memo(function InteractiveChart({
  chartId,
  resolution,
  lastPrice,
  precision,
  minMove,
  showVolume,
  showRsi,
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
  const panes = useMemo<ReadonlyArray<ChartPaneOptions> | undefined>(() => {
    if (!showVolume && !showRsi) return undefined;
    const result: ChartPaneOptions[] = [
      {
        paneId: 'main',
        heightWeight: settings.mainPaneHeightWeight,
        priceScale: { priceScaleId: 'main' },
      },
    ];
    if (showVolume) {
      result.push({
        paneId: 'volume',
        heightWeight: settings.volumePaneHeightWeight,
        minHeight: 56,
        priceScale: {
          priceScaleId: 'volume',
          valueFormat: { type: 'volume', precision: 1 },
        },
      });
    }
    if (showRsi) {
      result.push({
        paneId: 'rsi',
        heightWeight: settings.rsiPaneHeightWeight,
        minHeight: 96,
        priceScale: {
          priceScaleId: 'rsi',
          valueFormat: {
            type: 'price',
            precision: 4,
            minMove: 0.0001,
            useGrouping: false,
          },
        },
      });
    }
    return result;
  }, [
    settings.mainPaneHeightWeight,
    settings.rsiPaneHeightWeight,
    settings.volumePaneHeightWeight,
    showRsi,
    showVolume,
  ]);
  const additionalSeries = useMemo<
    ReadonlyArray<AdditionalChartSeriesOptions> | undefined
  >(() => {
    const result: AdditionalChartSeriesOptions[] = [];
    if (showVolume) {
      result.push({
        seriesId: 'volume',
        type: 'histogram',
        paneId: 'volume',
        priceScaleId: 'volume',
        source: { type: 'ohlcvVolume', seriesId: 'main' },
        appearance: buildVolumeAppearance(settings),
      });
    }
    if (showRsi) {
      result.push({
        seriesId: 'rsi',
        type: 'line',
        paneId: 'rsi',
        priceScaleId: 'rsi',
        source: { type: 'ohlcvRsi', seriesId: 'main', period: 14 },
        levels: { oversold: 30, overbought: 70 },
        appearance: {
          ...buildRsiAppearance(settings),
        },
      });
    }
    return result.length > 0 ? result : undefined;
  }, [settings, showRsi, showVolume]);

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
      resolution={resolution}
      xAxis={chartConfig.xAxis}
      yAxis={chartConfig.yAxis}
    />
  );
});

const styles = StyleSheet.create({
  chart: { flex: 1 },
});
