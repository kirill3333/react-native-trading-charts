import { StyleSheet, Text, TextInput, View } from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

type SyntheticSettingsFieldProps = {
  label: string;
  description: string;
  decimal?: boolean;
  value: string;
  error?: string;
  onChangeText: (text: string) => void;
};

export function SyntheticSettingsField({
  label,
  description,
  decimal,
  value,
  error,
  onChangeText,
}: SyntheticSettingsFieldProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.description}>{description}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityValue={error ? { text: error } : undefined}
        autoCorrect={false}
        keyboardAppearance={theme.dark ? 'dark' : 'light'}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        value={value}
        onChangeText={onChangeText}
        style={[styles.input, error != null && styles.invalidInput]}
      />
      {error != null && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    field: { gap: 6 },
    label: { color: colors.text, fontWeight: '700', fontSize: 14 },
    description: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    input: {
      color: colors.text,
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 8,
      paddingHorizontal: 12,
      minHeight: 44,
      fontSize: 16,
    },
    invalidInput: { borderColor: colors.errorBorder },
    error: { color: colors.errorText, fontSize: 12 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
