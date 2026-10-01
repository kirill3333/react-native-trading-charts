import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

type SyntheticSettingsHeaderProps = { onClose: () => void };

export function SyntheticSettingsHeader({
  onClose,
}: SyntheticSettingsHeaderProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Synthetic data</Text>
      <Pressable
        accessibilityLabel="Close synthetic settings"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.closeButton}
      >
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    header: {
      minHeight: 56,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomColor: colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    title: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
    closeButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 16 },
    closeText: { color: colors.accentText, fontWeight: '800', fontSize: 14 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
