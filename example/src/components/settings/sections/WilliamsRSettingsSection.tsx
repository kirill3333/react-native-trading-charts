import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { LegendSetting } from '../LegendSetting';
import { LineAppearanceFields } from '../LineAppearanceFields';
import { NumberSetting } from '../NumberSetting';
import { SettingsSection } from '../SettingsSection';
import { HexColorSetting } from '../HexColorSetting';
import { useAppTheme } from '../../../themeContext';

export function WilliamsRSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore((state) => state.updateSettings);
  const theme = useAppTheme();
  return (
    <SettingsSection title="Williams %R">
      <LegendSetting indicator="williamsR" />
      <NumberSetting
        label="Williams %R period"
        description="Candles in the high-low window"
        integer
        value={settings.williamsRPeriod}
        onValueChange={(williamsRPeriod) => updateSettings({ williamsRPeriod })}
      />
      <NumberSetting
        label="Oversold"
        description="Lower reference level"
        allowNonPositive
        validate={(value) =>
          value >= -100 && value < settings.williamsROverbought
            ? undefined
            : 'Enter a level from −100 to below the overbought level'
        }
        value={settings.williamsROversold}
        onValueChange={(williamsROversold) =>
          updateSettings({ williamsROversold })
        }
      />
      <NumberSetting
        label="Overbought"
        description="Upper reference level"
        allowNonPositive
        validate={(value) =>
          value <= 0 && value > settings.williamsROversold
            ? undefined
            : 'Enter a level above oversold and at most 0'
        }
        value={settings.williamsROverbought}
        onValueChange={(williamsROverbought) =>
          updateSettings({ williamsROverbought })
        }
      />
      <LineAppearanceFields
        label="Williams %R"
        value={settings.williamsRLine}
        onChange={(patch) =>
          updateSettings({
            williamsRLine: { ...settings.williamsRLine, ...patch },
          })
        }
      />
      <HexColorSetting
        label="Level color"
        description="Reference lines"
        value={settings.williamsRLevelLineColor}
        onValueChange={(williamsRLevelLineColor) =>
          updateSettings({ williamsRLevelLineColor })
        }
      />
      <HexColorSetting
        label="Band color"
        description="Fill between the reference lines"
        value={settings.williamsRBandColor}
        onValueChange={(williamsRBandColor) =>
          updateSettings({ williamsRBandColor })
        }
      />
      <HexColorSetting
        label="Text color"
        description="Legend title"
        value={settings.williamsRTextColor ?? theme.rsiTextColor}
        onValueChange={(williamsRTextColor) =>
          updateSettings({ williamsRTextColor })
        }
      />
    </SettingsSection>
  );
}
