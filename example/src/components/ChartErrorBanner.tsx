import { Pressable, StyleSheet, Text } from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';

type ChartErrorBannerProps = {
  message: string;
  onRetry: () => void;
};

export function ChartErrorBanner({ message, onRetry }: ChartErrorBannerProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onRetry}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <Text numberOfLines={2} style={styles.message}>
        {message}
      </Text>
      <Text style={styles.retry}>Try again</Text>
    </Pressable>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    banner: {
      alignItems: 'center',
      backgroundColor: colors.errorSurface,
      borderBottomColor: colors.errorBorder,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      minHeight: 42,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    message: {
      color: colors.errorText,
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
    },
    retry: {
      color: colors.accentText,
      fontSize: 12,
      fontWeight: '700',
      marginLeft: 12,
    },
    pressed: { opacity: 0.7 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
