import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';

export function ThemeSettingsSection() {
  const themeMode = useChartSettingsStore(
    (state) => state.settings.themeMode
  );
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );

  return (
    <SettingsSection title="Theme">
      <SettingSwitch
        description="Use light colors across the app and chart"
        label="Light theme"
        onValueChange={(lightTheme) =>
          updateSettings({ themeMode: lightTheme ? 'light' : 'dark' })
        }
        value={themeMode === 'light'}
      />
    </SettingsSection>
  );
}
