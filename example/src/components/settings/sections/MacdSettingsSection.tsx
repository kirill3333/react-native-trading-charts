import { LineAppearanceFields } from '../LineAppearanceFields';
import { patchLineSettings, readLineSettings } from '../../../lineSettings';
import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { useAppTheme } from '../../../themeContext';
import { HexColorSetting } from '../HexColorSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import {
  MACD_FAST_PERIOD_OPTIONS,
  MACD_SIGNAL_PERIOD_OPTIONS,
  MACD_SLOW_PERIOD_OPTIONS,
  VALUE_SOURCE_OPTIONS,
} from './settingsOptions';

export function MacdSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore((state) => state.updateSettings);
  const theme = useAppTheme();

  return (
    <SettingsSection title="MACD">
      <SettingSegments
        label="Fast period"
        onValueChange={(macdFastPeriod) => updateSettings({ macdFastPeriod })}
        options={MACD_FAST_PERIOD_OPTIONS}
        value={settings.macdFastPeriod}
      />
      <SettingSegments
        label="Slow period"
        onValueChange={(macdSlowPeriod) => updateSettings({ macdSlowPeriod })}
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
        onValueChange={(macdValueSource) => updateSettings({ macdValueSource })}
        options={VALUE_SOURCE_OPTIONS}
        value={settings.macdValueSource}
      />
      <LineAppearanceFields
        label="MACD"
        value={readLineSettings(settings, 'macd')}
        onChange={(patch) => updateSettings(patchLineSettings('macd', patch))}
      />
      <LineAppearanceFields
        label="Signal"
        value={readLineSettings(settings, 'signal')}
        onChange={(patch) => updateSettings(patchLineSettings('signal', patch))}
      />
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
