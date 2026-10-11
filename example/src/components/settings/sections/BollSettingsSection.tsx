import {
  type BollLineSettings,
  useChartSettingsStore,
} from '../../../stores/chartSettingsStore';
import { HexColorSetting } from '../HexColorSetting';
import { NumberSetting } from '../NumberSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';
import {
  INDICATOR_LINE_WIDTH_OPTIONS,
  LINE_OPTIONS,
  VALUE_SOURCE_OPTIONS,
} from './settingsOptions';

function BollLineSettingsForm({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BollLineSettings;
  onChange: (value: BollLineSettings) => void;
}) {
  const update = (patch: Partial<BollLineSettings>) =>
    onChange({ ...value, ...patch });
  return (
    <>
      <SettingSegments
        label={`${label} width`}
        value={value.width}
        options={INDICATOR_LINE_WIDTH_OPTIONS}
        onValueChange={(width) => update({ width })}
      />
      <SettingSegments
        label={`${label} style`}
        value={value.style}
        options={LINE_OPTIONS}
        onValueChange={(style) => update({ style })}
      />
      <HexColorSetting
        label={`${label} color`}
        value={value.color}
        onValueChange={(color) => update({ color })}
      />
      <SettingSwitch
        label={`${label} gradient`}
        value={value.gradientEnabled}
        onValueChange={(gradientEnabled) => update({ gradientEnabled })}
      />
      {value.gradientEnabled ? (
        <>
          <HexColorSetting
            label={`${label} gradient top`}
            value={value.gradientTopColor}
            onValueChange={(gradientTopColor) => update({ gradientTopColor })}
          />
          <HexColorSetting
            label={`${label} gradient bottom`}
            value={value.gradientBottomColor}
            onValueChange={(gradientBottomColor) =>
              update({ gradientBottomColor })
            }
          />
        </>
      ) : null}
    </>
  );
}

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
          <BollLineSettingsForm
            label="Upper"
            value={settings.bollUpperLine}
            onChange={(bollUpperLine) => updateSettings({ bollUpperLine })}
          />
          <BollLineSettingsForm
            label="Middle"
            value={settings.bollMiddleLine}
            onChange={(bollMiddleLine) => updateSettings({ bollMiddleLine })}
          />
          <BollLineSettingsForm
            label="Lower"
            value={settings.bollLowerLine}
            onChange={(bollLowerLine) => updateSettings({ bollLowerLine })}
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
