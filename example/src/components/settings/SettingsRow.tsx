import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

type SettingsRowProps = {
  children: ReactNode;
  description?: string;
  disabled?: boolean;
  label: string;
};

export function SettingsRow({
  children,
  description,
  disabled = false,
  label,
}: SettingsRowProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.control}>{children}</View>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      minHeight: 58,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    copy: { flex: 1, paddingRight: 12 },
    label: { color: colors.text, fontSize: 14, fontWeight: '700' },
    description: {
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 3,
    },
    control: { alignItems: 'flex-end', flexShrink: 0 },
    disabled: { opacity: 0.42 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
