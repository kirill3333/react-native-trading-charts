import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChartErrorBanner } from '../ChartErrorBanner';
import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

type SyntheticChartToolbarProps = {
  candleCount: number;
  eventsPerSecond: number;
  error: string | null;
  onOpenSettings: () => void;
  onRetry: () => void;
};

export function SyntheticChartToolbar({
  candleCount,
  eventsPerSecond,
  error,
  onOpenSettings,
  onRetry,
}: SyntheticChartToolbarProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  return (
    <>
      <View style={styles.toolbar}>
        <View style={styles.metrics}>
          <Text style={styles.metric}>
            {candleCount.toLocaleString('en-US')} candles
          </Text>
          <Text style={styles.secondary}>
            {eventsPerSecond.toLocaleString('en-US')} events/s
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Open synthetic data settings"
          accessibilityRole="button"
          onPress={onOpenSettings}
          style={({ pressed }) => [
            styles.settingsButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons
            name="tune"
            size={24}
            color={theme.colors.accentText}
          />
        </Pressable>
      </View>
      {error != null && <ChartErrorBanner message={error} onRetry={onRetry} />}
    </>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomColor: colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      minHeight: 52,
    },
    metrics: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 16,
      rowGap: 4,
      paddingVertical: 8,
    },
    metric: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    secondary: {
      color: colors.textSecondary,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    settingsButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    pressed: { opacity: 0.7 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
