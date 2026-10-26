import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { createThemedStyles } from '../../createThemedStyles';
import { type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';
import { SettingsRow } from './SettingsRow';
import {
  MAX_INTEGER_SETTING_VALUE,
  parseSettingNumber,
} from '../../settingNumber';

type NumberSettingProps = {
  label: string;
  description: string;
  value: number;
  integer?: boolean;
  allowNonPositive?: boolean;
  validate?: (value: number) => string | undefined;
  onValueChange: (value: number) => void;
};

export function NumberSetting({
  label,
  description,
  value,
  integer = false,
  allowNonPositive = false,
  validate,
  onValueChange,
}: NumberSettingProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const [draft, setDraft] = useState<{
    value: number;
    text: string;
    error: string | undefined;
  }>({ value, text: String(value), error: undefined });
  // Reset before children commit, while preserving the native input and focus.
  if (!Object.is(draft.value, value)) {
    setDraft({ value, text: String(value), error: undefined });
  }
  const { error } = draft;
  const decimalError = allowNonPositive
    ? 'Enter a finite number'
    : 'Enter a positive number';
  const decimalKeyboard = allowNonPositive
    ? 'numbers-and-punctuation'
    : 'decimal-pad';
  const commit = () => {
    const parsed = parseSettingNumber(draft.text, integer, allowNonPositive);
    if (parsed == null) {
      setDraft({
        ...draft,
        error: integer
          ? `Enter an integer from 1 to ${MAX_INTEGER_SETTING_VALUE}`
          : decimalError,
      });
      return;
    }
    const validationError = validate?.(parsed);
    if (validationError != null) {
      setDraft({ ...draft, error: validationError });
      return;
    }
    setDraft({ value, text: String(parsed), error: undefined });
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
          keyboardType={integer ? 'number-pad' : decimalKeyboard}
          selectTextOnFocus
          value={draft.text}
          onChangeText={(text) => setDraft({ ...draft, text })}
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

const THEMED_STYLES = createThemedStyles(createStyles);
