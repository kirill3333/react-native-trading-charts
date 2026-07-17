import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSpotTickers, type BinanceTicker } from '../binance';
import {
  chartDataController,
  hyperliquidChartDataController,
} from '../chartDataController';
import {
  fetchHyperliquidTickers,
  type HyperliquidTicker,
} from '../hyperliquid';

const ROW_HEIGHT = 73;

type MarketProvider = 'binance' | 'hyperliquid';
type MarketTicker = BinanceTicker | HyperliquidTicker;

type ProviderState = {
  tickers: MarketTicker[];
  loading: boolean;
  loaded: boolean;
  refreshing: boolean;
  error: string | null;
};

const EMPTY_PROVIDER_STATE: ProviderState = {
  tickers: [],
  loading: false,
  loaded: false,
  refreshing: false,
  error: null,
};

function isHyperliquidTicker(
  ticker: MarketTicker
): ticker is HyperliquidTicker {
  return 'provider' in ticker && ticker.provider === 'hyperliquid';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown network error';
}

function formatPrice(ticker: MarketTicker): string {
  return ticker.lastPrice.toLocaleString('en-US', {
    minimumFractionDigits: ticker.precision,
    maximumFractionDigits: ticker.precision,
  });
}

function formatTurnover(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function tickerPair(ticker: MarketTicker): {
  base: string;
  quote: string;
} {
  if (isHyperliquidTicker(ticker)) {
    return { base: ticker.baseAsset, quote: ticker.quoteAsset };
  }
  return { base: ticker.symbol.slice(0, -4), quote: 'USDT' };
}

function useProviderTickers(provider: MarketProvider) {
  const [states, setStates] = useState<Record<MarketProvider, ProviderState>>({
    binance: { ...EMPTY_PROVIDER_STATE },
    hyperliquid: { ...EMPTY_PROVIDER_STATE },
  });
  const statesRef = useRef(states);
  const controllersRef = useRef<
    Partial<Record<MarketProvider, AbortController>>
  >({});
  statesRef.current = states;

  const load = useCallback(async (target: MarketProvider, refresh: boolean) => {
    controllersRef.current[target]?.abort();
    const controller = new AbortController();
    controllersRef.current[target] = controller;
    setStates((current) => ({
      ...current,
      [target]: {
        ...current[target],
        error: null,
        loading: refresh ? current[target].loading : true,
        refreshing: refresh,
      },
    }));

    try {
      const nextTickers =
        target === 'binance'
          ? await fetchSpotTickers(controller.signal)
          : await fetchHyperliquidTickers(controller.signal);
      if (controllersRef.current[target] !== controller) {
        return;
      }
      if (nextTickers.length === 0) {
        throw new Error(
          target === 'binance'
            ? 'Binance returned no USDT tickers'
            : 'Hyperliquid returned no perpetual markets'
        );
      }
      setStates((current) => ({
        ...current,
        [target]: {
          tickers: nextTickers,
          loading: false,
          loaded: true,
          refreshing: false,
          error: null,
        },
      }));
    } catch (nextError) {
      if (
        controllersRef.current[target] === controller &&
        !isAbortError(nextError)
      ) {
        setStates((current) => ({
          ...current,
          [target]: {
            ...current[target],
            loading: false,
            loaded: true,
            refreshing: false,
            error: errorMessage(nextError),
          },
        }));
      }
    } finally {
      if (controllersRef.current[target] === controller) {
        delete controllersRef.current[target];
      }
    }
  }, []);

  useEffect(() => {
    const current = statesRef.current[provider];
    if (!current.loaded && !current.loading) {
      load(provider, false).catch(() => undefined);
    }
  }, [load, provider]);

  useEffect(
    () => () => {
      Object.values(controllersRef.current).forEach((controller) =>
        controller?.abort()
      );
      controllersRef.current = {};
    },
    []
  );

  return {
    ...states[provider],
    retry: () => load(provider, false),
    refresh: () => load(provider, true),
  };
}

type ErrorStateProps = {
  title: string;
  message: string;
  onRetry: () => void;
};

function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.centerState}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
      >
        <Text style={styles.retryButtonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

type TickerRowProps = {
  ticker: MarketTicker;
  onPress: (ticker: MarketTicker) => void;
};

function TickerRow({ ticker, onPress }: TickerRowProps) {
  const positive = ticker.change24hPercent >= 0;
  const change = `${positive ? '+' : ''}${ticker.change24hPercent.toFixed(2)}%`;
  const pair = tickerPair(ticker);

  return (
    <Pressable
      accessibilityHint="Opens the live candlestick chart"
      accessibilityRole="button"
      onPress={() => onPress(ticker)}
      style={({ pressed }) => [
        styles.tickerRow,
        pressed && styles.tickerRowPressed,
      ]}
    >
      <View style={styles.tickerIdentity}>
        <Text style={styles.tickerSymbol}>
          {pair.base}
          <Text style={styles.quoteSymbol}> / {pair.quote}</Text>
        </Text>
        <Text style={styles.turnoverText}>
          Vol {formatTurnover(ticker.turnover24h)}
          {isHyperliquidTicker(ticker)
            ? `  ·  up to ${ticker.maxLeverage}×`
            : ''}
        </Text>
      </View>
      <View style={styles.tickerPriceBlock}>
        <Text style={styles.tickerPrice}>{formatPrice(ticker)}</Text>
        <Text style={positive ? styles.positiveText : styles.negativeText}>
          {change}
        </Text>
      </View>
      <Text style={styles.disclosure}>›</Text>
    </Pressable>
  );
}

type MarketsHeaderProps = {
  provider: MarketProvider;
  onChange: (provider: MarketProvider) => void;
};

function MarketsHeader({ provider, onChange }: MarketsHeaderProps) {
  return (
    <View style={styles.marketsHeader}>
      <View accessibilityRole="tablist" style={styles.providerTabs}>
        {(['binance', 'hyperliquid'] as const).map((item) => {
          const selected = item === provider;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={item}
              onPress={() => onChange(item)}
              style={({ pressed }) => [
                styles.providerTab,
                selected && styles.providerTabSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={
                  selected
                    ? styles.providerTabTextSelected
                    : styles.providerTabText
                }
              >
                {item === 'binance' ? 'Binance' : 'Hyperliquid'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.screenTitle}>Markets</Text>
      <Text style={styles.screenSubtitle}>
        {provider === 'binance'
          ? 'Binance Spot · USDT pairs by 24-hour turnover'
          : 'Hyperliquid Perps · markets by 24-hour notional volume'}
      </Text>
    </View>
  );
}

export function MarketsScreen() {
  const navigation = useNavigation();
  const [provider, setProvider] = useState<MarketProvider>('binance');
  const { tickers, loading, loaded, refreshing, error, retry, refresh } =
    useProviderTickers(provider);

  const openChart = useCallback(
    (ticker: MarketTicker) => {
      if (isHyperliquidTicker(ticker)) {
        hyperliquidChartDataController.prepare(ticker, '1m');
        navigation.navigate('Chart', {
          provider: 'hyperliquid',
          ticker,
          interval: '1m',
        });
        return;
      }
      chartDataController.prepare(ticker, '1m');
      navigation.navigate('Chart', {
        provider: 'binance',
        ticker,
        interval: '1m',
      });
    },
    [navigation]
  );

  const renderItem = useCallback<ListRenderItem<MarketTicker>>(
    ({ item }) => <TickerRow onPress={openChart} ticker={item} />,
    [openChart]
  );

  let content;
  if ((!loaded || loading) && tickers.length === 0) {
    content = (
      <View style={styles.centerState}>
        <ActivityIndicator color="#8D7CFF" size="large" />
        <Text style={styles.loadingText}>
          Loading {provider === 'binance' ? 'Binance' : 'Hyperliquid'} markets…
        </Text>
      </View>
    );
  } else if (error != null && tickers.length === 0) {
    content = (
      <ErrorState
        message={error}
        onRetry={() => {
          void retry();
        }}
        title="Could not load markets"
      />
    );
  } else {
    content = (
      <>
        {error != null ? (
          <Pressable
            onPress={() => {
              void refresh();
            }}
            style={styles.inlineError}
          >
            <Text numberOfLines={1} style={styles.inlineErrorText}>
              Refresh failed: {error}
            </Text>
            <Text style={styles.inlineRetry}>Retry</Text>
          </Pressable>
        ) : null}
        <View style={styles.columnLabels}>
          <Text style={styles.columnLabel}>PAIR / 24H VOLUME</Text>
          <Text style={styles.columnLabel}>PRICE / 24H</Text>
        </View>
        <FlatList
          data={tickers}
          getItemLayout={(_data, index) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
          })}
          initialNumToRender={14}
          key={provider}
          keyExtractor={(item) => `${provider}:${item.symbol}`}
          onRefresh={() => {
            void refresh();
          }}
          refreshing={refreshing}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <MarketsHeader onChange={setProvider} provider={provider} />
        {content}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#100C18' },
  screen: { flex: 1, backgroundColor: '#100C18' },
  marketsHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  providerTabs: {
    backgroundColor: '#1A1522',
    borderColor: '#292431',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: 20,
    padding: 3,
  },
  providerTab: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
  },
  providerTabSelected: { backgroundColor: '#7562F4' },
  providerTabText: { color: '#8F899B', fontSize: 13, fontWeight: '700' },
  providerTabTextSelected: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  screenTitle: {
    color: '#F6F3FA',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  screenSubtitle: { color: '#8F899B', fontSize: 14, marginTop: 5 },
  columnLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomColor: '#292431',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingBottom: 9,
  },
  columnLabel: {
    color: '#696374',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  tickerRow: {
    alignItems: 'center',
    borderBottomColor: '#211C29',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: ROW_HEIGHT,
    paddingHorizontal: 20,
  },
  tickerRowPressed: { backgroundColor: '#1A1522' },
  tickerIdentity: { flex: 1 },
  tickerSymbol: { color: '#F6F3FA', fontSize: 16, fontWeight: '700' },
  quoteSymbol: { color: '#777181', fontSize: 12, fontWeight: '600' },
  turnoverText: { color: '#777181', fontSize: 12, marginTop: 6 },
  tickerPriceBlock: { alignItems: 'flex-end', minWidth: 112 },
  tickerPrice: {
    color: '#EDEAF2',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
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
  disclosure: {
    color: '#514B5B',
    fontSize: 26,
    marginLeft: 12,
    marginTop: -3,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  loadingText: { color: '#8F899B', fontSize: 14, marginTop: 14 },
  errorTitle: {
    color: '#F6F3FA',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorMessage: {
    color: '#8F899B',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 320,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#7562F4',
    borderRadius: 10,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  inlineError: {
    alignItems: 'center',
    backgroundColor: '#2A1721',
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  inlineErrorText: { color: '#E9A8B8', flex: 1, fontSize: 12 },
  inlineRetry: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 12,
  },
  pressed: { opacity: 0.7 },
});
