import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';
import { LINE_OPTIONS, OPACITY_OPTIONS } from './settingsOptions';

export function CrosshairSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );
  const detailsDisabled = !settings.crosshairEnabled;
  const tooltipDetailsDisabled =
    detailsDisabled || !settings.crosshairShowTooltip;

  return (
    <SettingsSection title="Crosshair">
      <SettingSwitch
        label="Enabled"
        onValueChange={(crosshairEnabled) =>
          updateSettings({ crosshairEnabled })
        }
        value={settings.crosshairEnabled}
      />
      <SettingSwitch
        disabled={detailsDisabled}
        label="Tooltip"
        onValueChange={(crosshairShowTooltip) =>
          updateSettings({ crosshairShowTooltip })
        }
        value={settings.crosshairShowTooltip}
      />
      <SettingSegments
        disabled={detailsDisabled}
        label="Line"
        onValueChange={(crosshairLineStyle) =>
          updateSettings({ crosshairLineStyle })
        }
        options={LINE_OPTIONS}
        value={settings.crosshairLineStyle}
      />
      <SettingSegments
        disabled={tooltipDetailsDisabled}
        label="Tooltip opacity"
        onValueChange={(crosshairTooltipOpacity) =>
          updateSettings({ crosshairTooltipOpacity })
        }
        options={OPACITY_OPTIONS}
        value={settings.crosshairTooltipOpacity}
      />
    </SettingsSection>
  );
}
