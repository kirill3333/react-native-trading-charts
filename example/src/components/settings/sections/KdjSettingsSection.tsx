import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { LegendSetting } from '../LegendSetting';
import { LineAppearanceFields } from '../LineAppearanceFields';
import { NumberSetting } from '../NumberSetting';
import { SettingsSection } from '../SettingsSection';

export function KdjSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore((state) => state.updateSettings);

  return (
    <SettingsSection title="KDJ">
      <LegendSetting indicator="kdj" />
      <NumberSetting
        label="KDJ period"
        description="Candles in the high-low window"
        integer
        value={settings.kdjPeriod}
        onValueChange={(kdjPeriod) => updateSettings({ kdjPeriod })}
      />
      <NumberSetting
        label="K/D smoothing (m1)"
        description="Smoothing divisor for both K and D"
        integer
        value={settings.kdjM1}
        onValueChange={(kdjM1) => updateSettings({ kdjM1 })}
      />
      <NumberSetting
        label="J multiplier (m2)"
        description="Weight of K in J = m2 × K − 2 × D"
        integer
        value={settings.kdjM2}
        onValueChange={(kdjM2) => updateSettings({ kdjM2 })}
      />
      <LineAppearanceFields
        label="K"
        value={settings.kdjKLine}
        onChange={(patch) =>
          updateSettings({ kdjKLine: { ...settings.kdjKLine, ...patch } })
        }
      />
      <LineAppearanceFields
        label="D"
        value={settings.kdjDLine}
        onChange={(patch) =>
          updateSettings({ kdjDLine: { ...settings.kdjDLine, ...patch } })
        }
      />
      <LineAppearanceFields
        label="J"
        value={settings.kdjJLine}
        onChange={(patch) =>
          updateSettings({ kdjJLine: { ...settings.kdjJLine, ...patch } })
        }
      />
    </SettingsSection>
  );
}
