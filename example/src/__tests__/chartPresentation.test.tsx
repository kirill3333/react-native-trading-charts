import { type ComponentProps } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ChartControlButton } from '../components/ChartControlButton';
import { ChartControlMenu } from '../components/ChartControlMenu';
import { SettingSwitch } from '../components/settings/SettingSwitch';
import { AppThemeProvider } from '../themeContext';
import { APP_THEMES } from '../theme';
import {
  useChartSettingsStore,
  DEFAULT_CHART_SETTINGS,
} from '../stores/chartSettingsStore';
import { buildAdditionalSeries, buildChartPanes } from '../chartSettingsConfig';
import { formatMarketPrice, tickerPair } from '../marketPresentation';

let renderer: ReactTestRenderer;
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  useChartSettingsStore.getState().resetSettings();
});
describe('chart composition', () => {
  it('keeps overlay order and attaches each enabled panel series to its pane', () => {
    const settings = {
      ...DEFAULT_CHART_SETTINGS,
      smaEnabled: true,
      emaEnabled: true,
      bollEnabled: true,
      sarEnabled: true,
    };
    const visibility = { showVolume: true, showRsi: true, showMacd: true };
    const series = buildAdditionalSeries(settings, visibility)!;
    expect(series.map((item) => item.seriesId)).toEqual([
      'sma',
      'ema',
      'boll',
      'sar',
      'volume',
      'rsi',
      'macd',
    ]);
    expect(series.map((item) => item.paneId)).toEqual([
      'main',
      'main',
      'main',
      'main',
      'volume',
      'rsi',
      'macd',
    ]);
    expect(
      buildChartPanes(settings, { ...visibility, minMove: 0.01 })?.map(
        (pane) => pane.paneId
      )
    ).toEqual(['main', 'volume', 'rsi', 'macd']);
    expect(
      buildAdditionalSeries(DEFAULT_CHART_SETTINGS, {
        showVolume: false,
        showRsi: false,
        showMacd: false,
      })
    ).toBeUndefined();
    expect(
      buildChartPanes(DEFAULT_CHART_SETTINGS, {
        minMove: 0.01,
        showVolume: false,
        showRsi: false,
        showMacd: false,
      })
    ).toBeUndefined();
    expect(
      buildAdditionalSeries(settings, {
        showVolume: false,
        showRsi: true,
        showMacd: false,
      })?.map((item) => item.seriesId)
    ).toEqual(['sma', 'ema', 'boll', 'sar', 'rsi']);
  });
  it('formats market prices without changing precision or pair naming', () => {
    expect(formatMarketPrice(1234.5, 2)).toBe('1,234.50');
    expect(formatMarketPrice(0.000123, 6)).toBe('0.000123');
    expect(
      tickerPair({
        symbol: 'BTCUSDT',
        lastPriceText: '10.00',
        lastPrice: 10,
        change24hPercent: 0,
        turnover24h: 100,
        precision: 2,
        minMove: 0.01,
      })
    ).toEqual({ base: 'BTC', quote: 'USDT' });
  });
});
describe('chart controls', () => {
  it.each(['dark', 'light'] as const)(
    'preserves button accessibility and dimensions in %s mode',
    (mode) => {
      const onPress = jest.fn();
      const render = (isLandscape: boolean) => (
        <AppThemeProvider mode={mode}>
          <ChartControlButton
            label="Chart indicators"
            icon="show-chart"
            isLandscape={isLandscape}
            active={false}
            expanded={false}
            hitSlop={4}
            onPress={onPress}
          />
        </AppThemeProvider>
      );
      act(() => {
        renderer = create(render(false));
      });
      const button = () => {
        // SAFETY: This labelled native node is rendered by ChartControlButton's Pressable.
        return renderer.root.findByProps({
          accessibilityLabel: 'Chart indicators',
          accessibilityRole: 'button',
        }).props as {
          accessibilityState: { expanded: boolean };
          hitSlop: number;
          onPress: () => void;
          style: (state: { pressed: boolean }) => StyleProp<ViewStyle>;
        };
      };
      expect(button().accessibilityState).toEqual({ expanded: false });
      expect(button().hitSlop).toBe(4);
      act(() => button().onPress());
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(
        StyleSheet.flatten(button().style({ pressed: false }))
      ).toMatchObject({
        width: 48,
        height: 40,
        backgroundColor: APP_THEMES[mode].colors.control,
      });
      act(() => renderer.update(render(true)));
      expect(
        StyleSheet.flatten(button().style({ pressed: false }))
      ).toMatchObject({
        width: 44,
        height: 44,
        marginHorizontal: 0,
      });
    }
  );
  it('shows every indicator toggle and updates only the selected setting', () => {
    act(() => {
      renderer = create(
        <AppThemeProvider mode="dark">
          <SafeAreaInsetsContext.Provider
            value={{ top: 0, bottom: 0, left: 0, right: 0 }}
          >
            <ChartControlMenu
              kind="indicators"
              isLandscape={false}
              onClose={() => undefined}
              onToggleOrientation={() => undefined}
            />
          </SafeAreaInsetsContext.Provider>
        </AppThemeProvider>
      );
    });
    const toggles = renderer.root.findAllByType(SettingSwitch).map((node) => {
      // SAFETY: These nodes are selected by the exact SettingSwitch type.
      return node.props as ComponentProps<typeof SettingSwitch>;
    });
    expect(toggles.map(({ label }) => label)).toEqual([
      'BOLL',
      'SAR',
      'EMA',
      'SMA',
    ]);
    act(() => toggles[1]!.onValueChange(true));
    expect(useChartSettingsStore.getState().settings).toEqual({
      ...DEFAULT_CHART_SETTINGS,
      sarEnabled: true,
    });
  });
});
