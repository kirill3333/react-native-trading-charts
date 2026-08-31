import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';
import { SPACING_OPTIONS } from './settingsOptions';

export function XAxisSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );

  return (
    <SettingsSection title="X axis">
      <SettingSwitch
        label="Visible"
        onValueChange={(xAxisVisible) => updateSettings({ xAxisVisible })}
        value={settings.xAxisVisible}
      />
      <SettingSwitch
        disabled={!settings.xAxisVisible}
        label="Show seconds"
        onValueChange={(xAxisShowSeconds) =>
          updateSettings({ xAxisShowSeconds })
        }
        value={settings.xAxisShowSeconds}
      />
      <SettingSegments
        disabled={!settings.xAxisVisible}
        label="Spacing"
        onValueChange={(xAxisSpacing) => updateSettings({ xAxisSpacing })}
        options={SPACING_OPTIONS}
        value={settings.xAxisSpacing}
      />
    </SettingsSection>
  );
}
