import { memo, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  TradingChartsView,
  TradingCharts,
  type AdditionalChartSeriesOptions,
  type ChartResolution,
  type VisibleRangeChangeEvent,
  type YAxisPressEvent,
} from 'react-native-trading-charts';

import {
  removeAllTimePriceLines,
  syncAllTimePriceLines,
  type AllTimeExtremes,
} from '../allTimeExtremes';
import {
  buildMacdSeries,
  buildMovingAverageSeries,
  buildRsiAppearance,
  buildVolumeAppearance,
  buildChartPanes,
  buildChartViewConfig,
  shouldUseSignificantPriceFormat,
} from '../chartSettingsConfig';
import { useChartSettingsStore } from '../stores/chartSettingsStore';
import { APP_THEMES } from '../theme';

type InteractiveChartProps = {
  chartId: string;
  resolution: ChartResolution;
  lastPrice: number;
  precision: number;
  minMove: number;
  showVolume: boolean;
  showRsi: boolean;
  showMacd: boolean;
  allTimeExtremes: AllTimeExtremes | null;
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
  showMacd,
  allTimeExtremes,
  onVisibleRangeChange,
}: InteractiveChartProps) {
  const settings = useChartSettingsStore((state) => state.settings);
  const themeColors = APP_THEMES[settings.themeMode].colors;
  const handleYAxisPress = useCallback(
    (event: YAxisPressEvent) => {
      TradingCharts.setPriceLine(chartId, {
        id: 'axis-press',
        price: event.price,
        label: 'Axis press',
        color: '#F59E0B',
      });
    },
    [chartId]
  );
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
  const panes = useMemo(
    () =>
      buildChartPanes(settings, {
        minMove,
        showVolume,
        showRsi,
        showMacd,
      }),
    [minMove, settings, showMacd, showRsi, showVolume]
  );
  const additionalSeries = useMemo<
    ReadonlyArray<AdditionalChartSeriesOptions> | undefined
  >(() => {
    const result: AdditionalChartSeriesOptions[] =
      buildMovingAverageSeries(settings);
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
    if (showMacd) {
      result.push(buildMacdSeries(settings));
    }
    return result.length > 0 ? result : undefined;
  }, [settings, showMacd, showRsi, showVolume]);

  useEffect(() => {
    syncAllTimePriceLines(
      TradingCharts,
      chartId,
      settings.allTimeExtremesVisible,
      allTimeExtremes,
      { high: themeColors.positive, low: themeColors.negative }
    );
  }, [
    allTimeExtremes,
    chartId,
    settings.allTimeExtremesVisible,
    themeColors.negative,
    themeColors.positive,
  ]);

  useEffect(
    () => () => removeAllTimePriceLines(TradingCharts, chartId),
    [chartId]
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
      onYAxisPress={handleYAxisPress}
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
