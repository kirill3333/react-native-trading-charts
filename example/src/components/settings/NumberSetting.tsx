import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';
import { SettingsRow } from './SettingsRow';

type NumberSettingProps = {
  label: string;
  description: string;
  value: number;
  integer?: boolean;
  onValueChange: (value: number) => void;
};

export function parseSettingNumber(
  text: string,
  integer: boolean
): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (integer && (!Number.isInteger(value) || value > 0xffffffff)) return null;
  return value;
}

export function NumberSetting({
  label,
  description,
  value,
  integer = false,
  onValueChange,
}: NumberSettingProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string>();
  useEffect(() => {
    setDraft(String(value));
    setError(undefined);
  }, [value]);
  const commit = () => {
    const parsed = parseSettingNumber(draft, integer);
    if (parsed == null) {
      setError(
        integer
          ? 'Enter an integer from 1 to 4294967295'
          : 'Enter a positive number'
      );
      return;
    }
    setError(undefined);
    setDraft(String(parsed));
    onValueChange(parsed);
  };
  return (
    <SettingsRow label={label} description={description}>
      <View style={styles.control}>
        <TextInput
          accessibilityLabel={label}
          accessibilityValue={error ? { text: error } : undefined}
          autoCorrect={false}
          keyboardAppearance={theme.dark ? 'dark' : 'light'}
          keyboardType={integer ? 'number-pad' : 'decimal-pad'}
          selectTextOnFocus
          value={draft}
          onChangeText={setDraft}
          onEndEditing={commit}
          style={[styles.input, error != null && styles.invalidInput]}
        />
        {error != null ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </View>
    </SettingsRow>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    control: { width: 104 },
    input: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      color: colors.text,
      fontSize: 12,
      minHeight: 36,
      paddingHorizontal: 8,
      textAlign: 'center',
    },
    invalidInput: { borderColor: colors.errorBorder },
    error: { color: colors.errorText, fontSize: 10, marginTop: 4 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
