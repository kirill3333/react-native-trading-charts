import { useCallback, useSyncExternalStore } from 'react';
import {
  type StaticScreenProps,
  useNavigation,
} from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  TradingCharts,
  TradingChartsView,
  type VisibleRangeChangeEvent,
} from 'react-native-trading-charts';

import {
  BINANCE_INTERVALS,
  type BinanceInterval,
  type BinanceTicker,
} from '../binance';
import {
  chartDataController,
  chartIdFor,
  hyperliquidChartDataController,
  hyperliquidChartIdFor,
  type ChartConnectionStatus,
} from '../chartDataController';
import {
  HYPERLIQUID_INTERVALS,
  type HyperliquidInterval,
  type HyperliquidTicker,
} from '../hyperliquid';

type ChartRouteParams =
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

type PriceTicker = {
  symbol: string;
  lastPrice: number;
  change24hPercent: number;
  precision: number;
  minMove: number;
};

function formatPrice(ticker: PriceTicker): string {
  return ticker.lastPrice.toLocaleString('en-US', {
    minimumFractionDigits: ticker.precision,
    maximumFractionDigits: ticker.precision,
  });
}

type ConnectionBadgeProps = {
  status: ChartConnectionStatus;
};

function ConnectionBadge({ status }: ConnectionBadgeProps) {
  if (status === 'historical' || status === 'error' || status === 'no-data') {
    return null;
  }
  if (status === 'live') {
    return (
      <View pointerEvents="none" style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
    );
  }

  let label = 'Connecting live data…';
  if (status === 'loading') {
    label = 'Loading history…';
  } else if (status === 'reconnecting') {
    label = 'Resyncing live data…';
  } else if (status === 'offline') {
    label = 'Waiting for internet…';
  } else if (status === 'paused') {
    label = 'Paused in background';
  }

  return (
    <View pointerEvents="none" style={styles.connectionBadge}>
      {status !== 'paused' && status !== 'offline' ? (
        <ActivityIndicator color="#C2B9FF" size="small" />
      ) : null}
      <Text
        style={[
          styles.connectionText,
          (status === 'paused' || status === 'offline') &&
            styles.connectionTextWithoutSpinner,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

type IntervalOption<TInterval extends string> = {
  value: TInterval;
  label: string;
  timeframeMs: number;
};

type ChartController<TTicker, TInterval extends string> = {
  prepare(ticker: TTicker, interval: TInterval): string;
  retry(ticker: TTicker, interval: TInterval): void;
  loadOlder(ticker: TTicker, interval: TInterval): void;
  subscribe(
    ticker: TTicker,
    interval: TInterval,
    listener: () => void
  ): () => void;
  getSnapshot(
    ticker: TTicker,
    interval: TInterval
  ): { status: ChartConnectionStatus; error: string | null };
};

type ChartContentProps<
  TTicker extends PriceTicker,
  TInterval extends string,
> = {
  ticker: TTicker;
  interval: TInterval;
  intervals: ReadonlyArray<IntervalOption<TInterval>>;
  controller: ChartController<TTicker, TInterval>;
  chartId: string;
  baseAsset: string;
  quoteAsset: string;
  venueLabel: string;
};

function ChartContent<TTicker extends PriceTicker, TInterval extends string>({
  ticker,
  interval,
  intervals,
  controller,
  chartId,
  baseAsset,
  quoteAsset,
  venueLabel,
}: ChartContentProps<TTicker, TInterval>) {
  const navigation = useNavigation();
  const intervalConfig =
    intervals.find((item) => item.value === interval) ?? intervals[0];

  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(ticker, interval, listener),
    [controller, interval, ticker]
  );
  const getSnapshot = useCallback(
    () => controller.getSnapshot(ticker, interval),
    [controller, interval, ticker]
  );
  const { status, error } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );

  const changeInterval = useCallback(
    (nextInterval: TInterval) => {
      if (nextInterval === interval) {
        return;
      }
      controller.prepare(ticker, nextInterval);
      const setIntervalParam = navigation.setParams as unknown as (params: {
        interval: TInterval;
      }) => void;
      setIntervalParam({ interval: nextInterval });
    },
    [controller, interval, navigation, ticker]
  );

  const handleVisibleRangeChange = useCallback(
    (event: NativeSyntheticEvent<VisibleRangeChangeEvent>) => {
      const { firstVisibleIndex, lastVisibleIndex } = event.nativeEvent;
      const visibleCount = lastVisibleIndex - firstVisibleIndex + 1;
      const preloadThreshold = Math.max(30, visibleCount * 2);
      if (firstVisibleIndex <= preloadThreshold) {
        controller.loadOlder(ticker, interval);
      }
    },
    [controller, interval, ticker]
  );

  const renderInterval = useCallback<ListRenderItem<IntervalOption<TInterval>>>(
    ({ item }) => {
      const selected = item.value === interval;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => changeInterval(item.value)}
          style={({ pressed }) => [
            styles.intervalButton,
            selected && styles.intervalButtonSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={selected ? styles.intervalTextSelected : styles.intervalText}
          >
            {item.label}
          </Text>
        </Pressable>
      );
    },
    [changeInterval, interval]
  );

  const hasError = status === 'error' || status === 'no-data';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.chartHeader}>
          <Pressable
            accessibilityLabel="Back to markets"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.chartTitleBlock}>
            <Text style={styles.chartTitle}>
              {baseAsset}
              <Text style={styles.quoteSymbol}> / {quoteAsset}</Text>
            </Text>
            <Text style={styles.chartSubtitle}>{venueLabel}</Text>
          </View>
          <View style={styles.headerPriceBlock}>
            <Text style={styles.headerPrice}>{formatPrice(ticker)}</Text>
            <Text
              style={
                ticker.change24hPercent >= 0
                  ? styles.positiveText
                  : styles.negativeText
              }
            >
              {ticker.change24hPercent >= 0 ? '+' : ''}
              {ticker.change24hPercent.toFixed(2)}%
            </Text>
          </View>
        </View>

        <FlatList
          contentContainerStyle={styles.intervalBarContent}
          data={intervals}
          horizontal
          keyExtractor={(item) => item.value}
          renderItem={renderInterval}
          showsHorizontalScrollIndicator={false}
          style={styles.intervalBar}
        />

        {hasError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => controller.retry(ticker, interval)}
            style={({ pressed }) => [
              styles.chartErrorBanner,
              pressed && styles.pressed,
            ]}
          >
            <Text numberOfLines={2} style={styles.chartErrorText}>
              {error ??
                (status === 'no-data'
                  ? `${venueLabel} returned no data for this market and interval`
                  : `Could not connect to ${venueLabel}`)}
            </Text>
            <Text style={styles.chartErrorRetry}>Try again</Text>
          </Pressable>
        ) : null}

        <View style={styles.chartContainer}>
          <TradingChartsView
            chartId={chartId}
            crosshair={{ enabled: true, showTooltip: true }}
            currentPrice={{ visible: true, showLabel: true }}
            gestures={{ pan: true, zoom: true }}
            initialVisibleCount={48}
            key={chartId}
            onVisibleRangeChange={handleVisibleRangeChange}
            style={styles.chart}
            timeframeMs={intervalConfig?.timeframeMs ?? 60_000}
            xAxis={{
              locale: 'en-GB',
              showSeconds: (intervalConfig?.timeframeMs ?? 60_000) < 60_000,
              spacing: 'time',
              timeZone: 'UTC',
            }}
            yAxis={{
              position: 'right',
              valueFormat: {
                type: 'price',
                precision: ticker.precision,
                minMove: ticker.minMove,
                locale: 'en-GB',
              },
            }}
          />
          <ConnectionBadge status={status} />
        </View>
        <View style={styles.chartControls}>
          <Pressable
            accessibilityLabel="Zoom in chart"
            accessibilityRole="button"
            onPress={() => TradingCharts.zoom(chartId, 1.25)}
            style={({ pressed }) => [
              styles.chartControlButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.chartControlSymbol}>+</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Zoom out chart"
            accessibilityRole="button"
            onPress={() => TradingCharts.zoom(chartId, 0.8)}
            style={({ pressed }) => [
              styles.chartControlButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.chartControlSymbol}>−</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Fit entire chart"
            accessibilityRole="button"
            onPress={() => TradingCharts.fitContent(chartId)}
            style={({ pressed }) => [
              styles.chartControlButton,
              styles.chartResetButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.chartResetText}>Reset</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function ChartScreen({ route }: ChartScreenProps) {
  const params = route.params;
  if (params.provider === 'hyperliquid') {
    return (
      <ChartContent
        baseAsset={params.ticker.baseAsset}
        chartId={hyperliquidChartIdFor(params.ticker.symbol, params.interval)}
        controller={hyperliquidChartDataController}
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
      baseAsset={params.ticker.symbol.slice(0, -4)}
      chartId={chartIdFor(params.ticker.symbol, params.interval)}
      controller={chartDataController}
      interval={params.interval}
      intervals={BINANCE_INTERVALS}
      quoteAsset="USDT"
      ticker={params.ticker}
      venueLabel="Binance Spot"
    />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#100C18' },
  screen: { flex: 1, backgroundColor: '#100C18' },
  chartHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 72,
    paddingHorizontal: 12,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backIcon: {
    color: '#F6F3FA',
    fontSize: 38,
    fontWeight: '300',
    lineHeight: 38,
    marginTop: -3,
  },
  chartTitleBlock: { flex: 1, marginLeft: 4 },
  chartTitle: { color: '#F6F3FA', fontSize: 18, fontWeight: '800' },
  quoteSymbol: { color: '#777181', fontSize: 12, fontWeight: '600' },
  chartSubtitle: { color: '#777181', fontSize: 12, marginTop: 4 },
  headerPriceBlock: { alignItems: 'flex-end', paddingRight: 8 },
  headerPrice: {
    color: '#F6F3FA',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  positiveText: {
    color: '#38D98A',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginTop: 5,
  },
  negativeText: {
    color: '#FF5C7C',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginTop: 5,
  },
  intervalBar: {
    borderBottomColor: '#292431',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#292431',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexGrow: 0,
  },
  intervalBarContent: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  intervalButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    marginRight: 6,
    minWidth: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  intervalButtonSelected: { backgroundColor: '#7562F4' },
  intervalText: { color: '#8F899B', fontSize: 13, fontWeight: '700' },
  intervalTextSelected: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  chartErrorBanner: {
    alignItems: 'center',
    backgroundColor: '#2A1721',
    borderBottomColor: '#4A2634',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chartErrorText: {
    color: '#E9A8B8',
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  chartErrorRetry: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 12,
  },
  chartContainer: { flex: 1, position: 'relative' },
  chart: { flex: 1 },
  chartControls: {
    alignItems: 'center',
    borderTopColor: '#292431',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chartControlButton: {
    alignItems: 'center',
    backgroundColor: '#211B2B',
    borderColor: '#393242',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    marginHorizontal: 4,
    minWidth: 48,
    paddingHorizontal: 14,
  },
  chartControlSymbol: {
    color: '#F6F3FA',
    fontSize: 24,
    fontWeight: '500',
    lineHeight: 26,
  },
  chartResetButton: { minWidth: 84 },
  chartResetText: { color: '#C2B9FF', fontSize: 13, fontWeight: '800' },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 40, 33, 0.9)',
    borderRadius: 12,
    flexDirection: 'row',
    left: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: 'absolute',
    top: 12,
  },
  liveDot: {
    backgroundColor: '#38D98A',
    borderRadius: 4,
    height: 7,
    marginRight: 6,
    width: 7,
  },
  liveText: {
    color: '#75E8AD',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  connectionBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(27, 23, 35, 0.94)',
    borderColor: '#393242',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: 'absolute',
    top: 12,
  },
  connectionText: {
    color: '#C2BCCB',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  connectionTextWithoutSpinner: { marginLeft: 0 },
  pressed: { opacity: 0.7 },
});
