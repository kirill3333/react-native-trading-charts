import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

export function SyntheticLoadingOverlay() {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  return (
    <View style={styles.loading} accessibilityLabel="Generating candle history">
      <ActivityIndicator color={theme.colors.accent} size="large" />
      <Text style={styles.secondary}>Generating history…</Text>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    secondary: {
      color: colors.textSecondary,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    loading: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
