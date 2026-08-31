import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { PANE_HEIGHT_WEIGHT_OPTIONS } from './settingsOptions';

export function PaneHeightsSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );

  return (
    <SettingsSection title="Pane heights">
      <SettingSegments
        description="Relative share of the available chart height"
        label="Main chart"
        onValueChange={(mainPaneHeightWeight) =>
          updateSettings({ mainPaneHeightWeight })
        }
        options={PANE_HEIGHT_WEIGHT_OPTIONS}
        value={settings.mainPaneHeightWeight}
      />
      <SettingSegments
        label="Volume"
        onValueChange={(volumePaneHeightWeight) =>
          updateSettings({ volumePaneHeightWeight })
        }
        options={PANE_HEIGHT_WEIGHT_OPTIONS}
        value={settings.volumePaneHeightWeight}
      />
      <SettingSegments
        label="RSI"
        onValueChange={(rsiPaneHeightWeight) =>
          updateSettings({ rsiPaneHeightWeight })
        }
        options={PANE_HEIGHT_WEIGHT_OPTIONS}
        value={settings.rsiPaneHeightWeight}
      />
      <SettingSegments
        label="MACD"
        onValueChange={(macdPaneHeightWeight) =>
          updateSettings({ macdPaneHeightWeight })
        }
        options={PANE_HEIGHT_WEIGHT_OPTIONS}
        value={settings.macdPaneHeightWeight}
      />
    </SettingsSection>
  );
}
