import { useChartSettingsStore } from '../../stores/chartSettingsStore';
import { SettingSwitch } from './SettingSwitch';

type Indicator =
  'sma' | 'ema' | 'boll' | 'volume' | 'williamsR' | 'kdj' | 'rsi' | 'macd';

export function LegendSetting({ indicator }: { indicator: Indicator }) {
  const key = `${indicator}LegendVisible` as const;
  const visible = useChartSettingsStore((state) => state.settings[key]);
  const update = useChartSettingsStore((state) => state.updateSettings);
  return (
    <SettingSwitch
      label="Show legend"
      value={visible}
      onValueChange={(value) => update({ [key]: value })}
    />
  );
}
