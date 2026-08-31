import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type HyperliquidTicker } from '../api/hyperliquid';
import {
  binanceMarketData,
  hyperliquidMarketData,
  type MarketProvider,
  type MarketTicker,
} from '../api/marketData';
import { MarketsContent } from '../components/markets/MarketsContent';
import { MarketsHeader } from '../components/markets/MarketsHeader';
import { APP_THEMES, type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';

function isHyperliquidTicker(
  ticker: MarketTicker
): ticker is HyperliquidTicker {
  return 'provider' in ticker && ticker.provider === 'hyperliquid';
}

export function MarketsScreen() {
  const navigation = useNavigation();
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const [provider, setProvider] = useState<MarketProvider>('binance');
  const adapter =
    provider === 'binance' ? binanceMarketData : hyperliquidMarketData;
  const tickersQuery = useQuery<MarketTicker[]>({
    queryKey: adapter.tickersQueryKey,
    queryFn: ({ signal }) => adapter.fetchTickers(signal),
    staleTime: 30_000,
  });
  const { refetch } = tickersQuery;

  const openChart = useCallback(
    (ticker: MarketTicker) => {
      if (isHyperliquidTicker(ticker)) {
        navigation.navigate('Chart', {
          provider: 'hyperliquid',
          ticker,
          interval: '1m',
        });
        return;
      }
      navigation.navigate('Chart', {
        provider: 'binance',
        ticker,
        interval: '1m',
      });
    },
    [navigation]
  );

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <MarketsHeader onChange={setProvider} provider={provider} />
        <MarketsContent
          error={tickersQuery.error}
          isError={tickersQuery.isError}
          isPending={tickersQuery.isPending}
          isRefreshing={tickersQuery.isRefetching}
          onRefresh={refresh}
          onTickerPress={openChart}
          provider={provider}
          tickers={tickersQuery.data}
        />
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    screen: { flex: 1, backgroundColor: colors.background },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
