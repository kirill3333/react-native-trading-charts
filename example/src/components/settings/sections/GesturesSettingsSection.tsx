import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';

export function GesturesSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );

  return (
    <SettingsSection title="Gestures">
      <SettingSwitch
        label="Pan"
        onValueChange={(panEnabled) => updateSettings({ panEnabled })}
        value={settings.panEnabled}
      />
      <SettingSwitch
        label="Zoom"
        onValueChange={(zoomEnabled) => updateSettings({ zoomEnabled })}
        value={settings.zoomEnabled}
      />
    </SettingsSection>
  );
}
