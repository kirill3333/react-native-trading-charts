import { Pressable, StyleSheet, Text } from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

type SyntheticSettingsActionsProps = { valid: boolean; onApply: () => void };

export function SyntheticSettingsActions({
  valid,
  onApply,
}: SyntheticSettingsActionsProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  return (
    <>
      <Text style={styles.description}>
        Apply replaces the candle history and restarts generation.
      </Text>
      <Pressable
        accessibilityLabel="Apply synthetic settings"
        accessibilityRole="button"
        accessibilityState={{ disabled: !valid }}
        disabled={!valid}
        onPress={onApply}
        style={({ pressed }) => [
          styles.applyButton,
          !valid && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.applyText}>Apply</Text>
      </Pressable>
    </>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    description: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    applyButton: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
      borderRadius: 12,
    },
    applyText: { color: colors.onAccent, fontWeight: '800', fontSize: 14 },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.7 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
