import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { HexColorSetting } from '../HexColorSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';
import {
  EMA_PERIOD_OPTIONS,
  INDICATOR_LINE_WIDTH_OPTIONS,
  LINE_OPTIONS,
  VALUE_SOURCE_OPTIONS,
} from './settingsOptions';

export function EmaSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );

  return (
    <SettingsSection title="EMA">
      <SettingSwitch
        description="Exponential moving average seeded with SMA"
        label="Enabled"
        onValueChange={(emaEnabled) => updateSettings({ emaEnabled })}
        value={settings.emaEnabled}
      />
      {settings.emaEnabled ? (
        <>
          <SettingSegments
            label="Period"
            onValueChange={(emaPeriod) => updateSettings({ emaPeriod })}
            options={EMA_PERIOD_OPTIONS}
            value={settings.emaPeriod}
          />
          <SettingSegments
            label="Value source"
            onValueChange={(emaValueSource) =>
              updateSettings({ emaValueSource })
            }
            options={VALUE_SOURCE_OPTIONS}
            value={settings.emaValueSource}
          />
          <SettingSegments
            label="Line width"
            onValueChange={(emaLineWidth) =>
              updateSettings({ emaLineWidth })
            }
            options={INDICATOR_LINE_WIDTH_OPTIONS}
            value={settings.emaLineWidth}
          />
          <SettingSegments
            label="Line style"
            onValueChange={(emaLineStyle) =>
              updateSettings({ emaLineStyle })
            }
            options={LINE_OPTIONS}
            value={settings.emaLineStyle}
          />
          <HexColorSetting
            description="Base color used when gradient is disabled"
            label="Line color"
            onValueChange={(emaLineColor) =>
              updateSettings({ emaLineColor })
            }
            value={settings.emaLineColor}
          />
          <SettingSwitch
            label="Vertical gradient"
            onValueChange={(emaGradientEnabled) =>
              updateSettings({ emaGradientEnabled })
            }
            value={settings.emaGradientEnabled}
          />
          {settings.emaGradientEnabled ? (
            <>
              <HexColorSetting
                label="Gradient top"
                onValueChange={(emaGradientTopColor) =>
                  updateSettings({ emaGradientTopColor })
                }
                value={settings.emaGradientTopColor}
              />
              <HexColorSetting
                label="Gradient bottom"
                onValueChange={(emaGradientBottomColor) =>
                  updateSettings({ emaGradientBottomColor })
                }
                value={settings.emaGradientBottomColor}
              />
            </>
          ) : null}
        </>
      ) : null}
    </SettingsSection>
  );
}
