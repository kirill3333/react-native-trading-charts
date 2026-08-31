import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { useAppTheme } from '../../../themeContext';
import { HexColorSetting } from '../HexColorSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { INDICATOR_LINE_WIDTH_OPTIONS } from './settingsOptions';

export function RsiSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );
  const theme = useAppTheme();

  return (
    <SettingsSection title="RSI">
      <SettingSegments
        label="Line width"
        onValueChange={(rsiLineWidth) => updateSettings({ rsiLineWidth })}
        options={INDICATOR_LINE_WIDTH_OPTIONS}
        value={settings.rsiLineWidth}
      />
      <HexColorSetting
        description="Color of the RSI curve"
        label="Line color"
        onValueChange={(rsiLineColorOverride) =>
          updateSettings({ rsiLineColorOverride })
        }
        value={settings.rsiLineColorOverride ?? theme.rsiColor}
      />
      <HexColorSetting
        description="Color of the RSI title and value"
        label="Text color"
        onValueChange={(rsiTextColorOverride) =>
          updateSettings({ rsiTextColorOverride })
        }
        value={settings.rsiTextColorOverride ?? theme.rsiTextColor}
      />
      <HexColorSetting
        description="Fill between oversold and overbought"
        label="Band color"
        onValueChange={(rsiBandColorOverride) =>
          updateSettings({ rsiBandColorOverride })
        }
        value={settings.rsiBandColorOverride ?? theme.rsiBandColor}
      />
      <HexColorSetting
        description="Dashed oversold and overbought levels"
        label="Level color"
        onValueChange={(rsiLevelLineColorOverride) =>
          updateSettings({ rsiLevelLineColorOverride })
        }
        value={
          settings.rsiLevelLineColorOverride ?? theme.rsiLevelLineColor
        }
      />
    </SettingsSection>
  );
}
