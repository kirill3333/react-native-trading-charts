import { type ChartSettings } from './stores/chartSettingsStore';

type BooleanSettingKey = {
  [K in keyof ChartSettings]: ChartSettings[K] extends boolean ? K : never;
}[keyof ChartSettings];
export const CHART_INDICATORS = [
  { key: 'bollEnabled', label: 'BOLL', description: 'Bollinger Bands' },
  {
    key: 'sarEnabled',
    label: 'SAR',
    description: 'Parabolic stop and reverse',
  },
  {
    key: 'emaEnabled',
    label: 'EMA',
    description: 'Exponential moving average',
  },
  { key: 'smaEnabled', label: 'SMA', description: 'Simple moving average' },
] as const satisfies ReadonlyArray<{
  key: BooleanSettingKey;
  label: string;
  description: string;
}>;
