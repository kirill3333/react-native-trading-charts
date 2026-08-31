import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type MarketProvider } from '../../api/marketData';
import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

const MARKET_PROVIDERS = [
  'binance',
  'hyperliquid',
] satisfies ReadonlyArray<MarketProvider>;

type MarketsHeaderProps = {
  provider: MarketProvider;
  onChange: (provider: MarketProvider) => void;
};

export function MarketsHeader({ provider, onChange }: MarketsHeaderProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];

  return (
    <View style={styles.marketsHeader}>
      <View accessibilityRole="tablist" style={styles.providerTabs}>
        {MARKET_PROVIDERS.map((item) => {
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

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    marketsHeader: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 20,
    },
    providerTabs: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.borderSubtle,
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
    providerTabSelected: { backgroundColor: colors.accent },
    providerTabText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    providerTabTextSelected: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: '800',
    },
    screenTitle: {
      color: colors.text,
      fontSize: 32,
      fontWeight: '800',
      letterSpacing: -0.8,
    },
    screenSubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 5,
    },
    pressed: { opacity: 0.7 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
