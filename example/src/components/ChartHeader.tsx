import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';

type ChartHeaderProps = {
  baseAsset: string;
  quoteAsset: string;
  venueLabel: string;
  price: number;
  pricePrecision: number;
  change24hPercent: number;
  onBack: () => void;
};

const priceFormatters = new Map<number, Intl.NumberFormat>();

function formatPrice(value: number, precision: number): string {
  let formatter = priceFormatters.get(precision);
  if (formatter == null) {
    formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    priceFormatters.set(precision, formatter);
  }
  return formatter.format(value);
}

export function ChartHeader({
  baseAsset,
  quoteAsset,
  venueLabel,
  price,
  pricePrecision,
  change24hPercent,
  onBack,
}: ChartHeaderProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const positive = change24hPercent >= 0;

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Back to markets"
        accessibilityRole="button"
        hitSlop={12}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>
          {baseAsset}
          <Text style={styles.quoteSymbol}> / {quoteAsset}</Text>
        </Text>
        <Text style={styles.subtitle}>{venueLabel}</Text>
      </View>
      <View style={styles.priceBlock}>
        <Text style={styles.price}>{formatPrice(price, pricePrecision)}</Text>
        <Text style={positive ? styles.positiveText : styles.negativeText}>
          {positive ? '+' : ''}
          {change24hPercent.toFixed(2)}%
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    header: {
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
      color: colors.text,
      fontSize: 38,
      fontWeight: '300',
      lineHeight: 38,
      marginTop: -3,
    },
    titleBlock: { flex: 1, marginLeft: 4 },
    title: { color: colors.text, fontSize: 18, fontWeight: '800' },
    quoteSymbol: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
    priceBlock: { alignItems: 'flex-end', paddingRight: 8 },
    price: {
      color: colors.text,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
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
    pressed: { opacity: 0.7 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
