import { useCallback, useLayoutEffect } from 'react';
import {
  type NavigationProp,
  type StaticScreenProps,
  useNavigation,
} from '@react-navigation/native';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type ChartResolution,
  type VisibleRangeChangeEvent,
} from 'react-native-trading-charts';

import {
  BINANCE_INTERVALS,
  type BinanceInterval,
  type BinanceTicker,
} from '../api/binance';
import {
  HYPERLIQUID_INTERVALS,
  type HyperliquidInterval,
  type HyperliquidTicker,
} from '../api/hyperliquid';
import {
  binanceMarketData,
  chartIdFor,
  hyperliquidChartIdFor,
  hyperliquidMarketData,
  type MarketDataAdapter,
} from '../api/marketData';
import {
  useChartDataFeed,
  type ChartConnectionStatus,
} from '../api/useChartDataFeed';
import { ChartControls } from '../components/ChartControls';
import { ChartErrorBanner } from '../components/ChartErrorBanner';
import { ChartHeader } from '../components/ChartHeader';
import { InteractiveChart } from '../components/InteractiveChart';
import {
  TimeIntervalSelector,
  type TimeIntervalOption,
} from '../components/TimeIntervalSelector';
import { useChartControlsStore } from '../stores/chartControlsStore';
import { APP_THEMES, type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';

export type ChartRouteParams =
  | {
      provider: 'binance';
      ticker: BinanceTicker;
      interval: BinanceInterval;
    }
  | {
      provider: 'hyperliquid';
      ticker: HyperliquidTicker;
      interval: HyperliquidInterval;
    };

type ChartScreenProps = StaticScreenProps<ChartRouteParams>;
type ChartInterval = ChartRouteParams['interval'];
type ChartNavigation = NavigationProp<
  { Chart: ChartRouteParams },
  'Chart'
>;

const DEFAULT_RESOLUTION: ChartResolution = { unit: 'minute' };

type PriceTicker = {
  symbol: string;
  lastPrice: number;
  change24hPercent: number;
  precision: number;
  minMove: number;
};

type ConnectionBadgeProps = {
  status: ChartConnectionStatus;
};

function ConnectionBadge({ status }: ConnectionBadgeProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  if (status === 'historical' || status === 'error' || status === 'no-data') {
    return null;
  }
  if (status === 'live') {
    return (
      <View pointerEvents="none" style={styles.liveBadge}>
        <View style={styles.liveDot} />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={styles.connectionBadge}>
      {status !== 'paused' && status !== 'offline' ? (
        <ActivityIndicator color={theme.colors.accentText} size="small" />
      ) : null}
    </View>
  );
}

type IntervalOption<TInterval extends ChartInterval> =
  TimeIntervalOption<TInterval> & {
    resolution: ChartResolution;
  };

type ChartContentProps<
  TTicker extends PriceTicker,
  TInterval extends ChartInterval,
  TMessage,
> = {
  ticker: TTicker;
  interval: TInterval;
  intervals: ReadonlyArray<IntervalOption<TInterval>>;
  adapter: MarketDataAdapter<TTicker, TInterval, TMessage>;
  chartId: string;
  baseAsset: string;
  quoteAsset: string;
  venueLabel: string;
};

function ChartContent<
  TTicker extends PriceTicker,
  TInterval extends ChartInterval,
  TMessage,
>({
  ticker,
  interval,
  intervals,
  adapter,
  chartId,
  baseAsset,
  quoteAsset,
  venueLabel,
}: ChartContentProps<TTicker, TInterval, TMessage>) {
  const navigation = useNavigation<ChartNavigation>();
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const showVolume = useChartControlsStore((state) => state.showVolume);
  const showRsi = useChartControlsStore((state) => state.showRsi);
  const showMacd = useChartControlsStore((state) => state.showMacd);
  const isChartHalfHeight = useChartControlsStore(
    (state) => state.isChartHalfHeight
  );
  const fullChartHeight = useChartControlsStore(
    (state) => state.fullChartHeight
  );
  const activateChart = useChartControlsStore((state) => state.activateChart);
  const setFullChartHeight = useChartControlsStore(
    (state) => state.setFullChartHeight
  );
  const intervalConfig =
    intervals.find((item) => item.value === interval) ?? intervals[0];
  const resolution = intervalConfig?.resolution ?? DEFAULT_RESOLUTION;

  const { status, error, lastPrice, allTimeExtremes, loadOlder, retry } =
    useChartDataFeed(adapter, ticker, interval, chartId);
  const displayedPrice = lastPrice ?? ticker.lastPrice;

  useLayoutEffect(() => {
    activateChart(chartId);
  }, [activateChart, chartId]);

  const handleChartViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      setFullChartHeight(nextHeight);
    },
    [setFullChartHeight]
  );

  const changeInterval = useCallback(
    (nextInterval: TInterval) => {
      if (nextInterval === interval) {
        return;
      }
      navigation.setParams({ interval: nextInterval });
    },
    [interval, navigation]
  );

  const handleVisibleRangeChange = useCallback(
    (event: VisibleRangeChangeEvent) => {
      const { firstVisibleIndex, lastVisibleIndex } = event;
      const visibleCount = lastVisibleIndex - firstVisibleIndex + 1;
      const preloadThreshold = Math.max(30, visibleCount * 2);
      if (firstVisibleIndex <= preloadThreshold) {
        loadOlder();
      }
    },
    [loadOlder]
  );

  const hasError = status === 'error' || status === 'no-data';
  const errorStatus =
    status === 'no-data'
      ? `${venueLabel} returned no data for this market and interval`
      : `Could not connect to ${venueLabel}`;

  const chartHeight =
    isChartHalfHeight && fullChartHeight != null
      ? [styles.chartContainer, { height: Math.max(1, fullChartHeight / 2) }]
      : styles.chartContainerExpanded;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <ChartHeader
          baseAsset={baseAsset}
          change24hPercent={ticker.change24hPercent}
          onBack={() => navigation.goBack()}
          price={displayedPrice}
          pricePrecision={ticker.precision}
          quoteAsset={quoteAsset}
          venueLabel={venueLabel}
        />

        <TimeIntervalSelector
          intervals={intervals}
          onSelect={changeInterval}
          selectedInterval={interval}
        />

        {hasError ? (
          <ChartErrorBanner message={error ?? errorStatus} onRetry={retry} />
        ) : null}

        <View onLayout={handleChartViewportLayout} style={styles.chartViewport}>
          <View style={chartHeight}>
            <InteractiveChart
              allTimeExtremes={allTimeExtremes}
              chartId={chartId}
              key={chartId}
              lastPrice={ticker.lastPrice}
              minMove={ticker.minMove}
              onVisibleRangeChange={handleVisibleRangeChange}
              precision={ticker.precision}
              showVolume={showVolume}
              showRsi={showRsi}
              showMacd={showMacd}
              resolution={resolution}
            />
            <ConnectionBadge status={status} />
          </View>
        </View>
        <ChartControls />
      </View>
    </SafeAreaView>
  );
}

export function ChartScreen({ route }: ChartScreenProps) {
  const params = route.params;
  if (params.provider === 'hyperliquid') {
    return (
      <ChartContent
        adapter={hyperliquidMarketData}
        baseAsset={params.ticker.baseAsset}
        chartId={hyperliquidChartIdFor(params.ticker.symbol, params.interval)}
        interval={params.interval}
        intervals={HYPERLIQUID_INTERVALS}
        quoteAsset={params.ticker.quoteAsset}
        ticker={params.ticker}
        venueLabel="Hyperliquid Perpetual"
      />
    );
  }
  return (
    <ChartContent
      adapter={binanceMarketData}
      baseAsset={params.ticker.symbol.slice(0, -4)}
      chartId={chartIdFor(params.ticker.symbol, params.interval)}
      interval={params.interval}
      intervals={BINANCE_INTERVALS}
      quoteAsset="USDT"
      ticker={params.ticker}
      venueLabel="Binance Spot"
    />
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    screen: { flex: 1, backgroundColor: colors.background },
    chartViewport: { flex: 1 },
    chartContainer: { position: 'relative' },
    chartContainerExpanded: { flex: 1, position: 'relative' },
    liveBadge: {
      alignItems: 'center',
      backgroundColor: colors.liveSurface,
      borderRadius: 12,
      flexDirection: 'row',
      left: 12,
      paddingHorizontal: 9,
      paddingVertical: 6,
      position: 'absolute',
      top: 12,
    },
    liveDot: {
      backgroundColor: colors.positive,
      borderRadius: 4,
      height: 7,
      marginRight: 6,
      width: 7,
    },
    liveText: {
      color: colors.liveText,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    connectionBadge: {
      alignItems: 'center',
      alignSelf: 'center',
      backgroundColor: colors.connectionSurface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 9,
      position: 'absolute',
      top: 12,
    },
    connectionText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginLeft: 8,
    },
    connectionTextWithoutSpinner: { marginLeft: 0 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
