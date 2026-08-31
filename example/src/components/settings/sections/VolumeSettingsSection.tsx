import { buildVolumeAppearance } from '../../../chartSettingsConfig';
import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { HexColorSetting } from '../HexColorSetting';
import { SettingsSection } from '../SettingsSection';

export function VolumeSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );
  const appearance = buildVolumeAppearance(settings);

  return (
    <SettingsSection title="Volume">
      <HexColorSetting
        description="Volume bars for rising candles"
        label="Up color"
        onValueChange={(volumeUpColorOverride) =>
          updateSettings({ volumeUpColorOverride })
        }
        value={appearance.upColor}
      />
      <HexColorSetting
        description="Volume bars for falling candles"
        label="Down color"
        onValueChange={(volumeDownColorOverride) =>
          updateSettings({ volumeDownColorOverride })
        }
        value={appearance.downColor}
      />
    </SettingsSection>
  );
}
