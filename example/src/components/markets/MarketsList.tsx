import { useCallback } from 'react';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { type HyperliquidTicker } from '../../api/hyperliquid';
import { type MarketProvider, type MarketTicker } from '../../api/marketData';
import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

const ROW_HEIGHT = 73;

type MarketsListProps = {
  provider: MarketProvider;
  tickers: ReadonlyArray<MarketTicker>;
  refreshing: boolean;
  onRefresh: () => void;
  onTickerPress: (ticker: MarketTicker) => void;
};

export function MarketsList({
  provider,
  tickers,
  refreshing,
  onRefresh,
  onTickerPress,
}: MarketsListProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const renderItem = useCallback<ListRenderItem<MarketTicker>>(
    ({ item }) => <TickerRow onPress={onTickerPress} ticker={item} />,
    [onTickerPress]
  );

  return (
    <>
      <View style={styles.columnLabels}>
        <Text style={styles.columnLabel}>PAIR / 24H VOLUME</Text>
        <Text style={styles.columnLabel}>PRICE / 24H</Text>
      </View>
      <FlashList
        data={tickers}
        key={provider}
        keyExtractor={(item) => `${provider}:${item.symbol}`}
        maintainVisibleContentPosition={{ disabled: true }}
        refreshControl={
          <RefreshControl
            colors={[theme.colors.accent]}
            onRefresh={onRefresh}
            progressBackgroundColor={theme.colors.surface}
            refreshing={refreshing}
            tintColor={theme.colors.accent}
          />
        }
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </>
  );
}

type TickerRowProps = {
  ticker: MarketTicker;
  onPress: (ticker: MarketTicker) => void;
};

function TickerRow({ ticker, onPress }: TickerRowProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
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

function isHyperliquidTicker(
  ticker: MarketTicker
): ticker is HyperliquidTicker {
  return 'provider' in ticker && ticker.provider === 'hyperliquid';
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

type TickerPair = {
  base: string;
  quote: string;
};

function tickerPair(ticker: MarketTicker): TickerPair {
  if (isHyperliquidTicker(ticker)) {
    return { base: ticker.baseAsset, quote: ticker.quoteAsset };
  }
  return { base: ticker.symbol.slice(0, -4), quote: 'USDT' };
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    columnLabels: {
      borderBottomColor: colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 9,
      paddingHorizontal: 20,
    },
    columnLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.7,
    },
    tickerRow: {
      alignItems: 'center',
      borderBottomColor: colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      height: ROW_HEIGHT,
      paddingHorizontal: 20,
    },
    tickerRowPressed: { backgroundColor: colors.pressed },
    tickerIdentity: { flex: 1 },
    tickerSymbol: { color: colors.text, fontSize: 16, fontWeight: '700' },
    quoteSymbol: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    turnoverText: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
    tickerPriceBlock: { alignItems: 'flex-end', minWidth: 112 },
    tickerPrice: {
      color: colors.text,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
      fontWeight: '600',
    },
    positiveText: {
      color: colors.positive,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      marginTop: 5,
    },
    negativeText: {
      color: colors.negative,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      marginTop: 5,
    },
    disclosure: {
      color: colors.textMuted,
      fontSize: 26,
      marginLeft: 12,
      marginTop: -3,
    },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
