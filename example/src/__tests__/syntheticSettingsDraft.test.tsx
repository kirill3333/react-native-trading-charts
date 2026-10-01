import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useSyntheticSettingsDraft } from '../hooks/useSyntheticSettingsDraft';
import { useSyntheticSettingsStore } from '../stores/syntheticSettingsStore';
import { DEFAULT_SYNTHETIC_SETTINGS } from '../synthetic/settings';

describe('synthetic settings draft', () => {
  let renderer: ReactTestRenderer;
  let form: ReturnType<typeof useSyntheticSettingsDraft>;
  const close = jest.fn();

  function Harness() {
    form = useSyntheticSettingsDraft(close);
    return null;
  }

  beforeEach(() => {
    close.mockClear();
    useSyntheticSettingsStore
      .getState()
      .applySettings(DEFAULT_SYNTHETIC_SETTINGS);
    act(() => {
      renderer = create(<Harness />);
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('keeps edits local until Apply and accepts decimal commas', () => {
    act(() =>
      form.setDraft((current) => ({
        ...current,
        candleCount: '50',
        minPrice: '95,5',
        eventsPerSecond: '1000',
      }))
    );
    expect(useSyntheticSettingsStore.getState().settings).toEqual(
      DEFAULT_SYNTHETIC_SETTINGS
    );
    expect(form.valid).toBe(true);
    act(() => form.apply());
    expect(useSyntheticSettingsStore.getState().settings).toMatchObject({
      candleCount: 50,
      minPrice: 95.5,
      eventsPerSecond: 1000,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('discards an unapplied draft on close and restores saved values on reopen', () => {
    act(() => form.setDraft((current) => ({ ...current, candleCount: '12' })));
    act(() => {
      renderer.unmount();
    });
    expect(useSyntheticSettingsStore.getState().settings).toEqual(
      DEFAULT_SYNTHETIC_SETTINGS
    );
    act(() => {
      renderer = create(<Harness />);
    });
    expect(form.draft.candleCount).toBe('1000');
  });

  it('blocks empty and invalid fields, including an inverted price range', () => {
    act(() => form.setDraft((current) => ({ ...current, intensity: '' })));
    expect(form.valid).toBe(false);
    expect(form.errors.intensity).toContain('0 to 100');
    act(() => form.apply());
    expect(close).not.toHaveBeenCalled();
    act(() =>
      form.setDraft((current) => ({
        ...current,
        intensity: '100',
        maxPrice: '80',
      }))
    );
    expect(form.valid).toBe(false);
    expect(form.errors.maxPrice).toContain('above the minimum');
    act(() => form.setDraft((current) => ({ ...current, maxPrice: '120' })));
    expect(form.valid).toBe(true);
  });
});
