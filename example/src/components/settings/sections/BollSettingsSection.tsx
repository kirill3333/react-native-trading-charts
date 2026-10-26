import { LineAppearanceFields } from '../LineAppearanceFields';
import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { HexColorSetting } from '../HexColorSetting';
import { NumberSetting } from '../NumberSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';
import { VALUE_SOURCE_OPTIONS } from './settingsOptions';

export function BollSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore((state) => state.updateSettings);
  return (
    <SettingsSection title="BOLL">
      <SettingSwitch
        label="Enabled"
        description="Bollinger Bands over the main OHLC series"
        value={settings.bollEnabled}
        onValueChange={(bollEnabled) => updateSettings({ bollEnabled })}
      />
      {settings.bollEnabled ? (
        <>
          <NumberSetting
            label="BOLL period"
            description="Number of candles in the SMA and standard deviation window"
            integer
            value={settings.bollPeriod}
            onValueChange={(bollPeriod) => updateSettings({ bollPeriod })}
          />
          <NumberSetting
            label="Standard deviation multiplier"
            description="Distance of each band from the SMA"
            value={settings.bollStdDevMultiplier}
            onValueChange={(bollStdDevMultiplier) =>
              updateSettings({ bollStdDevMultiplier })
            }
          />
          <SettingSegments
            label="Value source"
            value={settings.bollValueSource}
            options={VALUE_SOURCE_OPTIONS}
            onValueChange={(bollValueSource) =>
              updateSettings({ bollValueSource })
            }
          />
          <LineAppearanceFields
            label="Upper"
            value={settings.bollUpperLine}
            onChange={(patch) =>
              updateSettings({
                bollUpperLine: { ...settings.bollUpperLine, ...patch },
              })
            }
          />
          <LineAppearanceFields
            label="Middle"
            value={settings.bollMiddleLine}
            onChange={(patch) =>
              updateSettings({
                bollMiddleLine: { ...settings.bollMiddleLine, ...patch },
              })
            }
          />
          <LineAppearanceFields
            label="Lower"
            value={settings.bollLowerLine}
            onChange={(patch) =>
              updateSettings({
                bollLowerLine: { ...settings.bollLowerLine, ...patch },
              })
            }
          />
          <SettingSwitch
            label="Band fill"
            value={settings.bollFillEnabled}
            onValueChange={(bollFillEnabled) =>
              updateSettings({ bollFillEnabled })
            }
          />
          {settings.bollFillEnabled ? (
            <>
              <HexColorSetting
                label="Fill top"
                description="Use #RRGGBBAA to set opacity"
                value={settings.bollFillTopColor}
                onValueChange={(bollFillTopColor) =>
                  updateSettings({ bollFillTopColor })
                }
              />
              <HexColorSetting
                label="Fill bottom"
                description="Use the same colors for a solid fill"
                value={settings.bollFillBottomColor}
                onValueChange={(bollFillBottomColor) =>
                  updateSettings({ bollFillBottomColor })
                }
              />
            </>
          ) : null}
        </>
      ) : null}
    </SettingsSection>
  );
}
