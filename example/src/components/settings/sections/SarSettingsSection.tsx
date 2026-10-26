import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { HexColorSetting } from '../HexColorSetting';
import { NumberSetting } from '../NumberSetting';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';

export function SarSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore((state) => state.updateSettings);
  return (
    <SettingsSection title="SAR">
      <SettingSwitch
        label="Enabled"
        description="Parabolic SAR over the main OHLC series"
        value={settings.sarEnabled}
        onValueChange={(sarEnabled) => updateSettings({ sarEnabled })}
      />
      {settings.sarEnabled ? (
        <>
          <NumberSetting
            label="SAR step"
            description="Initial acceleration and increment, e.g. 0.02"
            value={settings.sarStep}
            validate={(step) =>
              step > settings.sarMaximum
                ? `Step must be at most ${settings.sarMaximum}`
                : undefined
            }
            onValueChange={(sarStep) => updateSettings({ sarStep })}
          />
          <NumberSetting
            label="SAR maximum"
            description="Acceleration limit, e.g. 0.20"
            value={settings.sarMaximum}
            validate={(maximum) =>
              maximum < settings.sarStep || maximum > 1
                ? `Maximum must be between ${settings.sarStep} and 1`
                : undefined
            }
            onValueChange={(sarMaximum) => updateSettings({ sarMaximum })}
          />
          <HexColorSetting
            label="SAR up color"
            value={settings.sarUpColor}
            onValueChange={(sarUpColor) => updateSettings({ sarUpColor })}
          />
          <HexColorSetting
            label="SAR down color"
            value={settings.sarDownColor}
            onValueChange={(sarDownColor) => updateSettings({ sarDownColor })}
          />
          <HexColorSetting
            label="SAR reversal color"
            description="First point after a trend reversal"
            value={settings.sarReversalColor}
            onValueChange={(sarReversalColor) =>
              updateSettings({ sarReversalColor })
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
