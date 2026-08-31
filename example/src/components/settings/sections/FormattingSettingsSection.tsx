import { StyleSheet, TextInput } from 'react-native';

import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { APP_THEMES, type AppThemeColors } from '../../../theme';
import { useAppTheme } from '../../../themeContext';
import { SettingSegments } from '../SettingSegments';
import { SettingsRow } from '../SettingsRow';
import { SettingsSection } from '../SettingsSection';
import { LOCALE_OPTIONS, TIME_ZONE_OPTIONS } from './settingsOptions';

export function FormattingSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];

  return (
    <SettingsSection title="Formatting">
      <SettingSegments
        label="Locale"
        onValueChange={(locale) => updateSettings({ locale })}
        options={LOCALE_OPTIONS}
        value={settings.locale}
      />
      <SettingSegments
        label="Time zone"
        onValueChange={(timeZone) => updateSettings({ timeZone })}
        options={TIME_ZONE_OPTIONS}
        value={settings.timeZone}
      />
      <SettingsRow
        description="Optional prefix for every displayed price"
        label="Currency symbol"
      >
        <TextInput
          accessibilityLabel="Currency symbol"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardAppearance={theme.dark ? 'dark' : 'light'}
          maxLength={4}
          onChangeText={(currencySymbol) =>
            updateSettings({ currencySymbol })
          }
          placeholder="None"
          placeholderTextColor={theme.colors.inputPlaceholder}
          selectTextOnFocus
          style={styles.input}
          value={settings.currencySymbol}
        />
      </SettingsRow>
    </SettingsSection>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    input: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      color: colors.text,
      fontSize: 13,
      minHeight: 36,
      minWidth: 76,
      paddingHorizontal: 10,
      textAlign: 'center',
    },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
