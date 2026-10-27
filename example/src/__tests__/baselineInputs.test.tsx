import { afterEach, expect, it } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { type ComponentProps } from 'react';
import { TextInput } from 'react-native';
import { BaselineSettingsFields } from '../components/settings/sections/BaselineSettingsFields';
import { useChartSettingsStore } from '../stores/chartSettingsStore';
import { AppThemeProvider } from '../themeContext';

let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  if (renderer) act(() => renderer?.unmount());
  useChartSettingsStore.getState().resetSettings();
});

it('rejects an out-of-range position and accepts zero and negative prices', () => {
  act(() => {
    renderer = create(
      <AppThemeProvider mode="dark">
        <BaselineSettingsFields />
      </AppThemeProvider>
    );
  });
  const field = (label: string) => {
    // SAFETY: these TextInputs are NumberSetting fields with a no-argument commit handler.
    return renderer!.root
      .findAllByType(TextInput)
      .find((item) => item.props.accessibilityLabel === label)!
      .props as ComponentProps<typeof TextInput> & { onEndEditing: () => void };
  };
  act(() => {
    field('Base position (%)').onChangeText?.('101');
  });
  act(() => {
    field('Base position (%)').onEndEditing();
  });
  expect(useChartSettingsStore.getState().settings.baselinePercentage).toBe(50);
  act(() => {
    field('Base position (%)').onChangeText?.('0');
  });
  act(() => {
    field('Base position (%)').onEndEditing();
  });
  expect(useChartSettingsStore.getState().settings.baselinePercentage).toBe(0);
  act(() =>
    useChartSettingsStore.getState().updateSettings({ baselineMode: 'price' })
  );
  act(() => {
    field('Base price').onChangeText?.('-5.25');
  });
  act(() => {
    field('Base price').onEndEditing();
  });
  expect(useChartSettingsStore.getState().settings.baselinePrice).toBe(-5.25);
});
