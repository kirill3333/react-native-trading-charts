export type SyntheticSettings = {
  candleCount: number;
  minPrice: number;
  maxPrice: number;
  intensity: number;
  eventsPerSecond: number;
};

export const DEFAULT_SYNTHETIC_SETTINGS: SyntheticSettings = {
  candleCount: 1_000,
  minPrice: 90,
  maxPrice: 110,
  intensity: 50,
  eventsPerSecond: 10,
};

export type SyntheticSettingKey = keyof SyntheticSettings;
export type SyntheticSettingsErrors = {
  candleCount?: string;
  minPrice?: string;
  maxPrice?: string;
  intensity?: string;
  eventsPerSecond?: string;
};

export function validateSyntheticSettings(
  settings: SyntheticSettings
): SyntheticSettingsErrors {
  const errors: SyntheticSettingsErrors = {};
  if (
    !Number.isInteger(settings.candleCount) ||
    settings.candleCount < 1 ||
    settings.candleCount > 100_000
  ) {
    errors.candleCount = 'Enter a whole number from 1 to 100,000';
  }
  if (!Number.isFinite(settings.minPrice) || settings.minPrice <= 0) {
    errors.minPrice = 'Enter a finite price greater than zero';
  }
  if (
    !Number.isFinite(settings.maxPrice) ||
    settings.maxPrice <= settings.minPrice
  ) {
    errors.maxPrice = 'Enter a finite price above the minimum';
  }
  if (
    !Number.isInteger(settings.intensity) ||
    settings.intensity < 0 ||
    settings.intensity > 100
  ) {
    errors.intensity = 'Enter a whole number from 0 to 100';
  }
  if (
    !Number.isInteger(settings.eventsPerSecond) ||
    settings.eventsPerSecond < 1 ||
    settings.eventsPerSecond > 1_000
  ) {
    errors.eventsPerSecond = 'Enter a whole number from 1 to 1,000';
  }
  return errors;
}
