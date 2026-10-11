import { type ComponentProps } from 'react';
import { AppThemeProvider } from '../themeContext';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { buildBollSeries } from '../chartSettingsConfig';
import {
  DEFAULT_CHART_SETTINGS,
  useChartSettingsStore,
} from '../stores/chartSettingsStore';
import {
  NumberSetting,
  parseSettingNumber,
} from '../components/settings/NumberSetting';
import { TextInput } from 'react-native';

describe('BOLL example settings', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    useChartSettingsStore.getState().resetSettings();
  });
  it('builds defaults, applies styles and restores settings', () => {
    expect(DEFAULT_CHART_SETTINGS.bollEnabled).toBe(false);
    expect(buildBollSeries(DEFAULT_CHART_SETTINGS)).toMatchObject({
      type: 'boll',
      paneId: 'main',
      source: { period: 20, stdDevMultiplier: 2, valueSource: 'close' },
      appearance: {
        fill: {
          enabled: true,
          topColor: '#2E90F533',
          bottomColor: '#2E90F50D',
        },
      },
    });
    useChartSettingsStore.getState().updateSettings({
      bollEnabled: true,
      bollPeriod: 8,
      bollStdDevMultiplier: 1.25,
      bollValueSource: 'low',
      bollFillEnabled: false,
      bollUpperLine: {
        ...DEFAULT_CHART_SETTINGS.bollUpperLine,
        style: 'dashed',
        gradientEnabled: true,
        gradientTopColor: '#112233',
        gradientBottomColor: '#445566',
      },
    });
    expect(
      buildBollSeries(useChartSettingsStore.getState().settings)
    ).toMatchObject({
      source: { period: 8, stdDevMultiplier: 1.25, valueSource: 'low' },
      appearance: {
        upperLine: {
          style: 'dashed',
          gradient: { topColor: '#112233', bottomColor: '#445566' },
        },
        fill: { enabled: false },
      },
    });
    useChartSettingsStore.getState().resetSettings();
    expect(useChartSettingsStore.getState().settings).toEqual(
      DEFAULT_CHART_SETTINGS
    );
  });
  it('commits only valid completed input and syncs external reset', () => {
    const onValueChange = jest.fn();
    act(() => {
      renderer = create(
        <AppThemeProvider mode="dark">
          <NumberSetting
            label="Period"
            description="Period"
            integer
            value={20}
            onValueChange={onValueChange}
          />
        </AppThemeProvider>
      );
    });
    const field = () => {
      // SAFETY: NumberSetting renders TextInput and supplies a zero-argument onEndEditing callback.
      return renderer!.root.findByType(TextInput).props as ComponentProps<
        typeof TextInput
      > & { onEndEditing: () => void };
    };
    act(() => {
      field().onChangeText?.('12');
    });
    expect(onValueChange).not.toHaveBeenCalled();
    act(() => {
      field().onEndEditing?.();
    });
    expect(onValueChange).toHaveBeenLastCalledWith(12);
    act(() => {
      field().onChangeText?.('0');
    });
    act(() => {
      field().onEndEditing?.();
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(field().accessibilityValue?.text).toBeDefined();
    act(() =>
      renderer!.update(
        <AppThemeProvider mode="dark">
          <NumberSetting
            label="Period"
            description="Period"
            integer
            value={50}
            onValueChange={onValueChange}
          />
        </AppThemeProvider>
      )
    );
    expect(field().value).toBe('50');
    expect(field().accessibilityValue?.text).toBeUndefined();
  });
  it('accepts decimal commas and rejects invalid numbers', () => {
    expect(parseSettingNumber('1,5', false)).toBe(1.5);
    for (const value of ['', '0', '-1', 'Infinity', 'abc', '1.'])
      expect(parseSettingNumber(value, false)).toBeNull();
    expect(parseSettingNumber('1.5', true)).toBeNull();
    expect(parseSettingNumber('4294967296', true)).toBeNull();
  });
});
