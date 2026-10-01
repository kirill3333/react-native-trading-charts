import { create } from 'zustand';

import {
  DEFAULT_SYNTHETIC_SETTINGS,
  validateSyntheticSettings,
  type SyntheticSettings,
} from '../synthetic/settings';

type SyntheticSettingsState = {
  settings: SyntheticSettings;
  applySettings: (settings: SyntheticSettings) => void;
};

export const useSyntheticSettingsStore = create<SyntheticSettingsState>(
  (set) => ({
    settings: { ...DEFAULT_SYNTHETIC_SETTINGS },
    applySettings: (settings) => {
      if (Object.keys(validateSyntheticSettings(settings)).length > 0) {
        throw new TypeError('Invalid synthetic settings');
      }
      // A new object also restarts a session when the values did not change.
      set({ settings: { ...settings } });
    },
  })
);
