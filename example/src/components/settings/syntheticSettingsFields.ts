import { type SyntheticSettingKey } from '../../synthetic/settings';

type SettingField = {
  key: SyntheticSettingKey;
  label: string;
  description: string;
  decimal?: boolean;
};

export const SYNTHETIC_SETTINGS_FIELDS: ReadonlyArray<SettingField> = [
  {
    key: 'candleCount',
    label: 'Initial candles',
    description: '1–100,000 one-second candles',
  },
  {
    key: 'minPrice',
    label: 'Minimum price',
    description: 'Greater than zero',
    decimal: true,
  },
  {
    key: 'maxPrice',
    label: 'Maximum price',
    description: 'Greater than the minimum',
    decimal: true,
  },
  {
    key: 'intensity',
    label: 'Price movement',
    description:
      '0: constant midpoint · 50: trends and pullbacks · 100: alternate limits',
  },
  {
    key: 'eventsPerSecond',
    label: 'Events per second',
    description: '1–1,000 generated trades per second',
  },
];
