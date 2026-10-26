import { afterEach, describe, expect, it } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { type ComponentProps } from 'react';
import { TextInput } from 'react-native';
import { buildSarSeries } from '../chartSettingsConfig';
import {
  DEFAULT_CHART_SETTINGS,
  useChartSettingsStore,
} from '../stores/chartSettingsStore';
import { SarSettingsSection } from '../components/settings/sections/SarSettingsSection';
import { SettingSwitch } from '../components/settings/SettingSwitch';
import { HexColorSetting } from '../components/settings/HexColorSetting';
import { AppThemeProvider } from '../themeContext';

describe('SAR settings', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    useChartSettingsStore.getState().resetSettings();
  });
  it('builds defaults and restores all parameters and colors', () => {
    expect(DEFAULT_CHART_SETTINGS.sarEnabled).toBe(false);
    expect(buildSarSeries(DEFAULT_CHART_SETTINGS)).toMatchObject({
      type: 'sar',
      paneId: 'main',
      priceScaleId: 'main',
      source: { type: 'ohlcvSar', seriesId: 'main', step: 0.02, maximum: 0.2 },
      appearance: {
        upColor: '#38D98A',
        downColor: '#FF3B64',
        reversalColor: '#9791A5',
      },
    });
    useChartSettingsStore.getState().updateSettings({
      sarEnabled: true,
      sarStep: 0.05,
      sarMaximum: 0.4,
      sarUpColor: '#112233',
      sarDownColor: '#445566',
      sarReversalColor: '#77889980',
    });
    expect(
      buildSarSeries(useChartSettingsStore.getState().settings)
    ).toMatchObject({
      source: { step: 0.05, maximum: 0.4 },
      appearance: {
        upColor: '#112233',
        downColor: '#445566',
        reversalColor: '#77889980',
      },
    });
    useChartSettingsStore.getState().resetSettings();
    expect(useChartSettingsStore.getState().settings).toEqual(
      DEFAULT_CHART_SETTINGS
    );
  });
  it('toggles SAR, validates related inputs and applies all three colors', () => {
    act(() => {
      renderer = create(
        <AppThemeProvider mode="dark">
          <SarSettingsSection />
        </AppThemeProvider>
      );
    });
    act(() => {
      // SAFETY: SettingsSection renders this header with its no-argument toggle handler.
      const header = renderer!.root.findByProps({
        accessibilityLabel: 'SAR',
        accessibilityRole: 'button',
      }).props as { onPress: () => void };
      header.onPress();
    });
    act(() => {
      // SAFETY: this node is the typed SettingSwitch rendered by SarSettingsSection.
      const toggle = renderer!.root.findByType(SettingSwitch)
        .props as ComponentProps<typeof SettingSwitch>;
      toggle.onValueChange(true);
    });
    expect(useChartSettingsStore.getState().settings.sarEnabled).toBe(true);
    const field = (label: string) => {
      // SAFETY: NumberSetting supplies these TextInput props and a no-argument commit callback.
      return renderer!.root
        .findAllByType(TextInput)
        .find((item) => item.props.accessibilityLabel === label)!
        .props as ComponentProps<typeof TextInput> & {
        onEndEditing: () => void;
      };
    };
    const enter = (label: string, value: string) => {
      act(() => {
        field(label).onChangeText?.(value);
      });
      act(() => {
        field(label).onEndEditing();
      });
    };
    enter('SAR step', '0.3');
    expect(field('SAR step').accessibilityValue?.text).toBeDefined();
    expect(useChartSettingsStore.getState().settings.sarStep).toBe(0.02);
    enter('SAR maximum', '1.1');
    expect(field('SAR maximum').accessibilityValue?.text).toBeDefined();
    enter('SAR maximum', '0.01');
    expect(useChartSettingsStore.getState().settings.sarMaximum).toBe(0.2);
    enter('SAR maximum', '0,4');
    enter('SAR step', '0,3');
    expect(useChartSettingsStore.getState().settings).toMatchObject({
      sarStep: 0.3,
      sarMaximum: 0.4,
    });
    const colors = ['#112233', '#445566', '#778899'];
    act(() =>
      renderer!.root.findAllByType(HexColorSetting).forEach((item, index) => {
        // SAFETY: findAllByType returns the HexColorSetting controls from this section.
        const props = item.props as ComponentProps<typeof HexColorSetting>;
        props.onValueChange(colors[index]!);
      })
    );
    expect(
      buildSarSeries(useChartSettingsStore.getState().settings).appearance
    ).toEqual({
      upColor: colors[0],
      downColor: colors[1],
      reversalColor: colors[2],
    });
    act(() => useChartSettingsStore.getState().resetSettings());
    expect(renderer!.root.findAllByType(HexColorSetting)).toHaveLength(0);
    act(() =>
      useChartSettingsStore.getState().updateSettings({ sarEnabled: true })
    );
    expect(field('SAR step').value).toBe('0.02');
    expect(field('SAR step').accessibilityValue?.text).toBeUndefined();
  });
});
