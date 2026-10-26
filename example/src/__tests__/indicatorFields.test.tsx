import { type ComponentProps } from 'react';
import { afterEach, describe, expect, it } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AppThemeProvider } from '../themeContext';
import { APP_THEMES } from '../theme';
import { useChartSettingsStore } from '../stores/chartSettingsStore';
import { LineAppearanceFields } from '../components/settings/LineAppearanceFields';
import { MovingAverageSettingsSection } from '../components/settings/sections/MovingAverageSettingsSection';
import { MacdSettingsSection } from '../components/settings/sections/MacdSettingsSection';
import { BollSettingsSection } from '../components/settings/sections/BollSettingsSection';
import {
  buildMovingAverageSeries,
  buildMacdSeries,
  buildBollSeries,
} from '../chartSettingsConfig';

let renderer: ReactTestRenderer;
function line(index: number) {
  // SAFETY: The node is selected by the exact LineAppearanceFields component type.
  return renderer.root.findAllByType(LineAppearanceFields)[index]!
    .props as ComponentProps<typeof LineAppearanceFields>;
}
function expand(title: string) {
  // SAFETY: SettingsSection supplies this zero-argument callback to its Pressable header.
  const props = renderer.root.findByProps({
    accessibilityLabel: title,
    accessibilityRole: 'button',
  }).props as {
    onPress: () => void;
  };
  act(() => props.onPress());
}
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  useChartSettingsStore.getState().resetSettings();
});
describe('shared indicator fields', () => {
  it('edits SMA and EMA independently', () => {
    useChartSettingsStore
      .getState()
      .updateSettings({ smaEnabled: true, emaEnabled: true });
    act(() => {
      renderer = create(
        <AppThemeProvider mode="dark">
          <MovingAverageSettingsSection kind="sma" />
          <MovingAverageSettingsSection kind="ema" />
        </AppThemeProvider>
      );
    });
    expand('SMA');
    expand('EMA');
    act(() => line(0).onChange({ width: 2.5, gradientEnabled: true }));
    act(() => line(1).onChange({ color: '#123456' }));
    const series = buildMovingAverageSeries(
      useChartSettingsStore.getState().settings
    );
    expect(series[0]).toMatchObject({
      seriesId: 'sma',
      appearance: { width: 2.5, gradient: expect.any(Object) },
    });
    expect(series[1]).toMatchObject({
      seriesId: 'ema',
      appearance: { color: '#123456' },
    });
    expect(line(0).value.color).not.toBe('#123456');
  });
  it('keeps unedited MACD colors tied to the theme after width changes', () => {
    act(() => {
      renderer = create(
        <AppThemeProvider mode="dark">
          <MacdSettingsSection />
        </AppThemeProvider>
      );
    });
    expand('MACD');
    act(() => line(0).onChange({ width: 2.5 }));
    act(() => line(1).onChange({ color: '#123456' }));
    expect(useChartSettingsStore.getState().settings.macdLineColor).toBeNull();
    act(() => {
      useChartSettingsStore.getState().updateSettings({ themeMode: 'light' });
      renderer.update(
        <AppThemeProvider mode="light">
          <MacdSettingsSection />
        </AppThemeProvider>
      );
    });
    expect(line(0).value.color).toBe(APP_THEMES.light.macd.lineColor);
    expect(line(1).value.color).toBe('#123456');
    expect(
      buildMacdSeries(useChartSettingsStore.getState().settings).appearance
    ).toMatchObject({
      macdLine: { width: 2.5, color: APP_THEMES.light.macd.lineColor },
      signalLine: { color: '#123456' },
    });
    act(() => useChartSettingsStore.getState().resetSettings());
    expect(
      useChartSettingsStore.getState().settings.macdSignalLineColor
    ).toBeNull();
  });
  it('updates one BOLL line without replacing its other fields or siblings', () => {
    useChartSettingsStore.getState().updateSettings({ bollEnabled: true });
    act(() => {
      renderer = create(
        <AppThemeProvider mode="dark">
          <BollSettingsSection />
        </AppThemeProvider>
      );
    });
    expand('BOLL');
    const before = buildBollSeries(
      useChartSettingsStore.getState().settings
    ).appearance;
    act(() => line(0).onChange({ width: 2.5 }));
    const after = buildBollSeries(
      useChartSettingsStore.getState().settings
    ).appearance;
    expect(after).toEqual({
      ...before,
      upperLine: { ...before?.upperLine, width: 2.5 },
    });
  });
});
