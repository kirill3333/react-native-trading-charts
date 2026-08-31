import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';
import {
  FORMAT_OPTIONS,
  MARGIN_OPTIONS,
  POSITION_OPTIONS,
} from './settingsOptions';

export function YAxisSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );

  return (
    <SettingsSection title="Y axis">
      <SettingSwitch
        label="Visible"
        onValueChange={(yAxisVisible) => updateSettings({ yAxisVisible })}
        value={settings.yAxisVisible}
      />
      <SettingSegments
        disabled={!settings.yAxisVisible}
        label="Position"
        onValueChange={(yAxisPosition) => updateSettings({ yAxisPosition })}
        options={POSITION_OPTIONS}
        value={settings.yAxisPosition}
      />
      <SettingSegments
        description="Uses zero-count formatting for prices below 0.1"
        disabled={!settings.yAxisVisible}
        label="Value format"
        onValueChange={(yAxisFormat) => updateSettings({ yAxisFormat })}
        options={FORMAT_OPTIONS}
        value={settings.yAxisFormat}
      />
      <SettingSwitch
        disabled={!settings.yAxisVisible}
        label="Digit grouping"
        onValueChange={(yAxisUseGrouping) =>
          updateSettings({ yAxisUseGrouping })
        }
        value={settings.yAxisUseGrouping}
      />
      <SettingSegments
        disabled={!settings.yAxisVisible}
        label="Scale margins"
        onValueChange={(yAxisScaleMargins) =>
          updateSettings({ yAxisScaleMargins })
        }
        options={MARGIN_OPTIONS}
        value={settings.yAxisScaleMargins}
      />
    </SettingsSection>
  );
}
