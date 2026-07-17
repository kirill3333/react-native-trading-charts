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

import { fetchSpotTickers, type BybitTicker } from '../bybit';
import { chartDataController } from '../chartDataController';

const ROW_HEIGHT = 73;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown network error';
}

function formatPrice(ticker: BybitTicker): string {
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

function useSpotTickers() {
  const [tickers, setTickers] = useState<BybitTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const nextTickers = await fetchSpotTickers(controller.signal);
      if (controllerRef.current !== controller) {
        return;
      }
      if (nextTickers.length === 0) {
        throw new Error('Bybit returned no USDT tickers');
      }
      setTickers(nextTickers);
    } catch (nextError) {
      if (controllerRef.current === controller && !isAbortError(nextError)) {
        setError(errorMessage(nextError));
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    load(false).catch(() => undefined);
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [load]);

  return {
    tickers,
    loading,
    refreshing,
    error,
    retry: () => load(false).catch(() => undefined),
    refresh: () => load(true).catch(() => undefined),
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
  ticker: BybitTicker;
  onPress: (ticker: BybitTicker) => void;
};

function TickerRow({ ticker, onPress }: TickerRowProps) {
  const positive = ticker.change24hPercent >= 0;
  const change = `${positive ? '+' : ''}${ticker.change24hPercent.toFixed(2)}%`;

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
          {ticker.symbol.slice(0, -4)}
          <Text style={styles.quoteSymbol}> / USDT</Text>
        </Text>
        <Text style={styles.turnoverText}>
          Vol {formatTurnover(ticker.turnover24h)}
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

function MarketsHeader() {
  return (
    <View style={styles.marketsHeader}>
      <Text style={styles.eyebrow}>BYBIT SPOT</Text>
      <Text style={styles.screenTitle}>Markets</Text>
      <Text style={styles.screenSubtitle}>
        USDT pairs sorted by 24-hour turnover
      </Text>
    </View>
  );
}

export function MarketsScreen() {
  const navigation = useNavigation();
  const { tickers, loading, refreshing, error, retry, refresh } =
    useSpotTickers();

  const openChart = useCallback(
    (ticker: BybitTicker) => {
      chartDataController.prepare(ticker, '1');
      navigation.navigate('Chart', { ticker, interval: '1' });
    },
    [navigation]
  );

  const renderItem = useCallback<ListRenderItem<BybitTicker>>(
    ({ item }) => <TickerRow onPress={openChart} ticker={item} />,
    [openChart]
  );

  let content;
  if (loading && tickers.length === 0) {
    content = (
      <View style={styles.centerState}>
        <ActivityIndicator color="#8D7CFF" size="large" />
        <Text style={styles.loadingText}>Loading Bybit markets…</Text>
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
          keyExtractor={(item) => item.symbol}
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
        <MarketsHeader />
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
    paddingTop: 18,
    paddingBottom: 20,
  },
  eyebrow: {
    color: '#8D7CFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginBottom: 8,
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
