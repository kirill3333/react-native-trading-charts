import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { HexColorSetting } from '../HexColorSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';
import {
  INDICATOR_LINE_WIDTH_OPTIONS,
  LINE_OPTIONS,
  SMA_PERIOD_OPTIONS,
  VALUE_SOURCE_OPTIONS,
} from './settingsOptions';

export function SmaSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );

  return (
    <SettingsSection title="SMA">
      <SettingSwitch
        description="Simple moving average over the main OHLC series"
        label="Enabled"
        onValueChange={(smaEnabled) => updateSettings({ smaEnabled })}
        value={settings.smaEnabled}
      />
      {settings.smaEnabled ? (
        <>
          <SettingSegments
            label="Period"
            onValueChange={(smaPeriod) => updateSettings({ smaPeriod })}
            options={SMA_PERIOD_OPTIONS}
            value={settings.smaPeriod}
          />
          <SettingSegments
            label="Value source"
            onValueChange={(smaValueSource) =>
              updateSettings({ smaValueSource })
            }
            options={VALUE_SOURCE_OPTIONS}
            value={settings.smaValueSource}
          />
          <SettingSegments
            label="Line width"
            onValueChange={(smaLineWidth) =>
              updateSettings({ smaLineWidth })
            }
            options={INDICATOR_LINE_WIDTH_OPTIONS}
            value={settings.smaLineWidth}
          />
          <SettingSegments
            label="Line style"
            onValueChange={(smaLineStyle) =>
              updateSettings({ smaLineStyle })
            }
            options={LINE_OPTIONS}
            value={settings.smaLineStyle}
          />
          <HexColorSetting
            description="Base color used when gradient is disabled"
            label="Line color"
            onValueChange={(smaLineColor) =>
              updateSettings({ smaLineColor })
            }
            value={settings.smaLineColor}
          />
          <SettingSwitch
            label="Vertical gradient"
            onValueChange={(smaGradientEnabled) =>
              updateSettings({ smaGradientEnabled })
            }
            value={settings.smaGradientEnabled}
          />
          {settings.smaGradientEnabled ? (
            <>
              <HexColorSetting
                label="Gradient top"
                onValueChange={(smaGradientTopColor) =>
                  updateSettings({ smaGradientTopColor })
                }
                value={settings.smaGradientTopColor}
              />
              <HexColorSetting
                label="Gradient bottom"
                onValueChange={(smaGradientBottomColor) =>
                  updateSettings({ smaGradientBottomColor })
                }
                value={settings.smaGradientBottomColor}
              />
            </>
          ) : null}
        </>
      ) : null}
    </SettingsSection>
  );
}
