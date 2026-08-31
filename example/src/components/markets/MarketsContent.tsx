import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { type MarketProvider, type MarketTicker } from '../../api/marketData';
import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';
import { MarketsErrorState, MarketsInlineError } from './MarketsErrorStates';
import { MarketsList } from './MarketsList';

type MarketsContentProps = {
  provider: MarketProvider;
  tickers: MarketTicker[] | undefined;
  error: unknown;
  isError: boolean;
  isPending: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onTickerPress: (ticker: MarketTicker) => void;
};

export function MarketsContent({
  provider,
  tickers,
  error,
  isError,
  isPending,
  isRefreshing,
  onRefresh,
  onTickerPress,
}: MarketsContentProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const items = tickers ?? [];
  const hasError = error != null;
  const hasLoaded = tickers != null || isError;

  if ((!hasLoaded || isPending) && items.length === 0) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.loadingText}>
          Loading {provider === 'binance' ? 'Binance' : 'Hyperliquid'} markets…
        </Text>
      </View>
    );
  }

  if (hasError && items.length === 0) {
    return <MarketsErrorState error={error} onRetry={onRefresh} />;
  }

  return (
    <>
      {hasError ? (
        <MarketsInlineError error={error} onRetry={onRefresh} />
      ) : null}
      <MarketsList
        onRefresh={onRefresh}
        onTickerPress={onTickerPress}
        provider={provider}
        refreshing={isRefreshing}
        tickers={items}
      />
    </>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    centerState: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: 28,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 14,
    },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
