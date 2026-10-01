import { useState } from 'react';

import { useSyntheticSettingsStore } from '../stores/syntheticSettingsStore';
import {
  validateSyntheticSettings,
  type SyntheticSettings,
} from '../synthetic/settings';

function draftFromSettings(settings: SyntheticSettings) {
  return {
    candleCount: String(settings.candleCount),
    minPrice: String(settings.minPrice),
    maxPrice: String(settings.maxPrice),
    intensity: String(settings.intensity),
    eventsPerSecond: String(settings.eventsPerSecond),
  };
}

function parseNumber(text: string): number {
  return text.trim() === '' ? NaN : Number(text.replace(',', '.'));
}

export function useSyntheticSettingsDraft(onClose: () => void) {
  const settings = useSyntheticSettingsStore((state) => state.settings);
  const applySettings = useSyntheticSettingsStore(
    (state) => state.applySettings
  );
  const [draft, setDraft] = useState(() => draftFromSettings(settings));
  const values: SyntheticSettings = {
    candleCount: parseNumber(draft.candleCount),
    minPrice: parseNumber(draft.minPrice),
    maxPrice: parseNumber(draft.maxPrice),
    intensity: parseNumber(draft.intensity),
    eventsPerSecond: parseNumber(draft.eventsPerSecond),
  };
  const errors = validateSyntheticSettings(values);
  const valid = Object.keys(errors).length === 0;

  const apply = () => {
    if (!valid) return;
    applySettings(values);
    onClose();
  };
  return { draft, setDraft, errors, valid, apply };
}
