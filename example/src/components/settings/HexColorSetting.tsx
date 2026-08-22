import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { isHexColor, normalizeHexColor } from '../../hexColor';
import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';
import { SettingsRow } from './SettingsRow';

type HexColorSettingProps = {
  description?: string;
  label: string;
  onValueChange: (value: string) => void;
  value: string;
};

export function HexColorSetting({
  description,
  label,
  onValueChange,
  value,
}: HexColorSettingProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const [draft, setDraft] = useState(value);
  const valid = isHexColor(draft);

  useEffect(() => setDraft(value), [value]);

  const updateDraft = (nextValue: string) => {
    const normalized = normalizeHexColor(nextValue);
    setDraft(normalized);
    if (isHexColor(normalized)) onValueChange(normalized);
  };

  return (
    <SettingsRow description={description} label={label}>
      <View style={styles.control}>
        <View style={styles.inputRow}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[styles.swatch, valid && { backgroundColor: draft }]}
          />
          <TextInput
            accessibilityLabel={`${label} HEX color`}
            accessibilityValue={valid ? undefined : { text: 'Invalid color' }}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardAppearance={theme.dark ? 'dark' : 'light'}
            maxLength={9}
            onChangeText={updateDraft}
            placeholder="#RRGGBB"
            placeholderTextColor={theme.colors.inputPlaceholder}
            selectTextOnFocus
            spellCheck={false}
            style={[styles.input, !valid && styles.inputInvalid]}
            value={draft}
          />
        </View>
        {!valid ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            Use #RRGGBB or #RRGGBBAA
          </Text>
        ) : null}
      </View>
    </SettingsRow>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    control: { alignItems: 'flex-end' },
    inputRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    swatch: {
      backgroundColor: 'transparent',
      borderColor: colors.border,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      height: 24,
      width: 24,
    },
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
      width: 104,
    },
    inputInvalid: { borderColor: colors.errorBorder },
    error: {
      color: colors.errorText,
      fontSize: 10,
      marginTop: 4,
    },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
