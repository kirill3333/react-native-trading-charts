import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { patchLineSettings, readLineSettings } from '../../../lineSettings';
import { LineAppearanceFields } from '../LineAppearanceFields';
import { NumberSetting } from '../NumberSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';
import { VALUE_SOURCE_OPTIONS } from './settingsOptions';

const AVERAGES = {
  sma: {
    title: 'SMA',
    enabled: 'smaEnabled',
    period: 'smaPeriod',
    source: 'smaValueSource',
    description: 'Simple moving average over the main OHLC series',
    periodDescription: 'Number of candles in the moving average window',
  },
  ema: {
    title: 'EMA',
    enabled: 'emaEnabled',
    period: 'emaPeriod',
    source: 'emaValueSource',
    description: 'Exponential moving average seeded with SMA',
    periodDescription: 'Number of candles used to seed and smooth the average',
  },
} as const;
const LINE_LABELS = {
  width: 'Line width',
  style: 'Line style',
  color: 'Line color',
  gradientEnabled: 'Vertical gradient',
  gradientTopColor: 'Gradient top',
  gradientBottomColor: 'Gradient bottom',
};

export function MovingAverageSettingsSection({
  kind,
}: {
  kind: keyof typeof AVERAGES;
}) {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore((state) => state.updateSettings);
  const config = AVERAGES[kind];
  const line = readLineSettings(settings, kind);
  return (
    <SettingsSection title={config.title}>
      <SettingSwitch
        label="Enabled"
        description={config.description}
        value={settings[config.enabled]}
        onValueChange={(value) => updateSettings({ [config.enabled]: value })}
      />
      {settings[config.enabled] && (
        <>
          <NumberSetting
            label={`${config.title} period`}
            description={config.periodDescription}
            integer
            value={settings[config.period]}
            onValueChange={(value) =>
              updateSettings({ [config.period]: value })
            }
          />
          <SettingSegments
            label="Value source"
            options={VALUE_SOURCE_OPTIONS}
            value={settings[config.source]}
            onValueChange={(value) =>
              updateSettings({ [config.source]: value })
            }
          />
          <LineAppearanceFields
            label="Line"
            labels={LINE_LABELS}
            colorDescription="Base color used when gradient is disabled"
            value={line}
            onChange={(patch) => updateSettings(patchLineSettings(kind, patch))}
          />
        </>
      )}
    </SettingsSection>
  );
}
