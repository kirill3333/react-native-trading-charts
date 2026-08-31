import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

type MarketsErrorStateProps = {
  error: unknown;
  onRetry: () => void;
};

export function MarketsErrorState({ error, onRetry }: MarketsErrorStateProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];

  return (
    <View style={styles.centerState}>
      <Text style={styles.errorTitle}>Could not load markets</Text>
      <Text style={styles.errorMessage}>{errorMessage(error)}</Text>
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

export function MarketsInlineError({ error, onRetry }: MarketsErrorStateProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];

  return (
    <Pressable onPress={onRetry} style={styles.inlineError}>
      <Text numberOfLines={1} style={styles.inlineErrorText}>
        Refresh failed: {errorMessage(error)}
      </Text>
      <Text style={styles.inlineRetry}>Retry</Text>
    </Pressable>
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Unknown network error';
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    centerState: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: 28,
    },
    errorTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
    },
    errorMessage: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 8,
      maxWidth: 320,
      textAlign: 'center',
    },
    retryButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      marginTop: 18,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },
    retryButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: '700',
    },
    inlineError: {
      alignItems: 'center',
      backgroundColor: colors.errorSurface,
      borderColor: colors.errorBorder,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      marginBottom: 12,
      marginHorizontal: 20,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    inlineErrorText: { color: colors.errorText, flex: 1, fontSize: 12 },
    inlineRetry: {
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
