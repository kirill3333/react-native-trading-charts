import { memo, useCallback, useEffect, useMemo } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import {
  MarkerVariant,
  TradingChartsView,
  TradingCharts,
  type AdditionalChartSeriesOptions,
  type ChartResolution,
  type OhlcCandle,
  type MarkerPressEvent,
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
import { buildExampleMarkers, MARKER_VARIANTS_ENABLED } from '../chartMarkers';
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
  recentCandles: ReadonlyArray<OhlcCandle>;
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
  recentCandles,
  onVisibleRangeChange,
}: InteractiveChartProps) {
  const settings = useChartSettingsStore((state) => state.settings);
  const themeColors = APP_THEMES[settings.themeMode].colors;
  const handleMarkerPress = useCallback(({ marker }: MarkerPressEvent) => {
    Alert.alert(marker.id, JSON.stringify(marker.metadata ?? {}, null, 2));
  }, []);
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

  useEffect(() => {
    TradingCharts.setMarkers(chartId, buildExampleMarkers(recentCandles));
  }, [chartId, recentCandles]);

  useEffect(
    () => () => {
      removeAllTimePriceLines(TradingCharts, chartId);
      TradingCharts.clearMarkers(chartId);
    },
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
      onMarkerPress={handleMarkerPress}
      panes={panes}
      panesResizable
      style={styles.chart}
      resolution={resolution}
      xAxis={chartConfig.xAxis}
      yAxis={chartConfig.yAxis}
    >
      {MARKER_VARIANTS_ENABLED && (
        <>
          <MarkerVariant name="buy" style={styles.buyMarker}>
            <Text style={styles.markerText}>B</Text>
          </MarkerVariant>

          <MarkerVariant name="sell" style={styles.sellMarker}>
            <Text style={styles.markerText}>S</Text>
          </MarkerVariant>

          <MarkerVariant name="signal" style={styles.signalMarker}>
            <Text style={styles.signalMarkerEmoji}>🚀</Text>
          </MarkerVariant>

          <MarkerVariant name="arrow" style={styles.arrowMarker}>
            <View style={styles.arrowMarkerTop} />
            <View style={styles.arrowMarkerBottom} />
            <Text style={styles.arrowMarkerText}>x</Text>
          </MarkerVariant>

          <MarkerVariant name="image" style={styles.imageMarker}>
            <Image
              source={require('../assets/images/bull-market.png')}
              style={styles.image}
            />
          </MarkerVariant>
        </>
      )}
    </TradingChartsView>
  );
});

const styles = StyleSheet.create({
  chart: { flex: 1 },
  buyMarker: {
    alignItems: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 12,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  markerText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  sellMarker: {
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 12,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  signalMarker: {
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 6,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  signalMarkerEmoji: { fontSize: 12 },
  arrowMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    height: 24,
    width: 24,
  },
  arrowMarkerTop: {
    backgroundColor: '#0EA5E9',
    height: 10,
    width: 10,
    transform: [{ translateY: 5 }, { rotate: '45deg' }],
  },
  arrowMarkerBottom: {
    backgroundColor: '#0EA5E9',
    height: 12,
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowMarkerText: {
    color: '#FFFFFF',
    fontSize: 12,
    position: 'absolute',
    paddingTop: 5,
  },
  imageMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    borderRadius: 6,
    height: 24,
    width: 24,
  },
  image: {
    height: 20,
    width: 20,
    resizeMode: 'contain',
  },
});
