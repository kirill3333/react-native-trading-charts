import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { useAppTheme } from '../../../themeContext';
import { HexColorSetting } from '../HexColorSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';
import {
  INDICATOR_LINE_WIDTH_OPTIONS,
  LINE_OPTIONS,
  MACD_FAST_PERIOD_OPTIONS,
  MACD_SIGNAL_PERIOD_OPTIONS,
  MACD_SLOW_PERIOD_OPTIONS,
  VALUE_SOURCE_OPTIONS,
} from './settingsOptions';

export function MacdSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );
  const theme = useAppTheme();

  return (
    <SettingsSection title="MACD">
      <SettingSegments
        label="Fast period"
        onValueChange={(macdFastPeriod) =>
          updateSettings({ macdFastPeriod })
        }
        options={MACD_FAST_PERIOD_OPTIONS}
        value={settings.macdFastPeriod}
      />
      <SettingSegments
        label="Slow period"
        onValueChange={(macdSlowPeriod) =>
          updateSettings({ macdSlowPeriod })
        }
        options={MACD_SLOW_PERIOD_OPTIONS}
        value={settings.macdSlowPeriod}
      />
      <SettingSegments
        label="Signal period"
        onValueChange={(macdSignalPeriod) =>
          updateSettings({ macdSignalPeriod })
        }
        options={MACD_SIGNAL_PERIOD_OPTIONS}
        value={settings.macdSignalPeriod}
      />
      <SettingSegments
        label="Value source"
        onValueChange={(macdValueSource) =>
          updateSettings({ macdValueSource })
        }
        options={VALUE_SOURCE_OPTIONS}
        value={settings.macdValueSource}
      />
      <SettingSegments
        label="MACD width"
        onValueChange={(macdLineWidth) =>
          updateSettings({ macdLineWidth })
        }
        options={INDICATOR_LINE_WIDTH_OPTIONS}
        value={settings.macdLineWidth}
      />
      <SettingSegments
        label="MACD style"
        onValueChange={(macdLineStyle) =>
          updateSettings({ macdLineStyle })
        }
        options={LINE_OPTIONS}
        value={settings.macdLineStyle}
      />
      <HexColorSetting
        label="MACD color"
        onValueChange={(macdLineColor) => updateSettings({ macdLineColor })}
        value={settings.macdLineColor ?? theme.macd.lineColor}
      />
      <SettingSwitch
        label="MACD gradient"
        onValueChange={(macdGradientEnabled) =>
          updateSettings({ macdGradientEnabled })
        }
        value={settings.macdGradientEnabled}
      />
      {settings.macdGradientEnabled ? (
        <>
          <HexColorSetting
            label="MACD gradient top"
            onValueChange={(macdGradientTopColor) =>
              updateSettings({ macdGradientTopColor })
            }
            value={
              settings.macdGradientTopColor ?? theme.macd.gradientTopColor
            }
          />
          <HexColorSetting
            label="MACD gradient bottom"
            onValueChange={(macdGradientBottomColor) =>
              updateSettings({ macdGradientBottomColor })
            }
            value={
              settings.macdGradientBottomColor ??
              theme.macd.gradientBottomColor
            }
          />
        </>
      ) : null}
      <SettingSegments
        label="Signal width"
        onValueChange={(macdSignalLineWidth) =>
          updateSettings({ macdSignalLineWidth })
        }
        options={INDICATOR_LINE_WIDTH_OPTIONS}
        value={settings.macdSignalLineWidth}
      />
      <SettingSegments
        label="Signal style"
        onValueChange={(macdSignalLineStyle) =>
          updateSettings({ macdSignalLineStyle })
        }
        options={LINE_OPTIONS}
        value={settings.macdSignalLineStyle}
      />
      <HexColorSetting
        label="Signal color"
        onValueChange={(macdSignalLineColor) =>
          updateSettings({ macdSignalLineColor })
        }
        value={settings.macdSignalLineColor ?? theme.macd.signalLineColor}
      />
      <SettingSwitch
        label="Signal gradient"
        onValueChange={(macdSignalGradientEnabled) =>
          updateSettings({ macdSignalGradientEnabled })
        }
        value={settings.macdSignalGradientEnabled}
      />
      {settings.macdSignalGradientEnabled ? (
        <>
          <HexColorSetting
            label="Signal gradient top"
            onValueChange={(macdSignalGradientTopColor) =>
              updateSettings({ macdSignalGradientTopColor })
            }
            value={
              settings.macdSignalGradientTopColor ??
              theme.macd.signalGradientTopColor
            }
          />
          <HexColorSetting
            label="Signal gradient bottom"
            onValueChange={(macdSignalGradientBottomColor) =>
              updateSettings({ macdSignalGradientBottomColor })
            }
            value={
              settings.macdSignalGradientBottomColor ??
              theme.macd.signalGradientBottomColor
            }
          />
        </>
      ) : null}
      <HexColorSetting
        label="Positive increasing"
        onValueChange={(macdPositiveIncreasingColor) =>
          updateSettings({ macdPositiveIncreasingColor })
        }
        value={
          settings.macdPositiveIncreasingColor ??
          theme.macd.positiveIncreasingColor
        }
      />
      <HexColorSetting
        label="Positive decreasing"
        onValueChange={(macdPositiveDecreasingColor) =>
          updateSettings({ macdPositiveDecreasingColor })
        }
        value={
          settings.macdPositiveDecreasingColor ??
          theme.macd.positiveDecreasingColor
        }
      />
      <HexColorSetting
        label="Negative increasing"
        onValueChange={(macdNegativeIncreasingColor) =>
          updateSettings({ macdNegativeIncreasingColor })
        }
        value={
          settings.macdNegativeIncreasingColor ??
          theme.macd.negativeIncreasingColor
        }
      />
      <HexColorSetting
        label="Negative decreasing"
        onValueChange={(macdNegativeDecreasingColor) =>
          updateSettings({ macdNegativeDecreasingColor })
        }
        value={
          settings.macdNegativeDecreasingColor ??
          theme.macd.negativeDecreasingColor
        }
      />
      <HexColorSetting
        label="Legend text"
        onValueChange={(macdTextColor) => updateSettings({ macdTextColor })}
        value={settings.macdTextColor ?? theme.macd.textColor}
      />
      <HexColorSetting
        label="Zero line"
        onValueChange={(macdZeroLineColor) =>
          updateSettings({ macdZeroLineColor })
        }
        value={settings.macdZeroLineColor ?? theme.macd.zeroLineColor}
      />
    </SettingsSection>
  );
}
