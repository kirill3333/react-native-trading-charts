import { type ComponentProps } from 'react';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { Pressable, StyleSheet, Text } from 'react-native';
import { TradingCharts } from 'react-native-trading-charts';

import { createThemedStyles } from '../createThemedStyles';
import { useChartControlsStore } from '../stores/chartControlsStore';
import { isPerformanceAvailable } from '../performance';
import { type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';
import { SettingSwitch } from './settings/SettingSwitch';

type ChartNavigationActionsProps = {
  isLandscape: boolean;
  onToggleOrientation: () => void;
};

type NavigationActionProps = {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  disabled?: boolean;
  onPress: () => void;
};

function NavigationAction({
  icon,
  label,
  disabled = false,
  onPress,
}: NavigationActionProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <MaterialIcons name={icon} size={22} color={theme.colors.accentText} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

export function ChartNavigationActions({
  isLandscape,
  onToggleOrientation,
}: ChartNavigationActionsProps) {
  const chartId = useChartControlsStore((state) => state.activeChartId);
  const showPerformance = useChartControlsStore(
    (state) => state.showPerformance
  );
  const togglePerformance = useChartControlsStore(
    (state) => state.togglePerformance
  );
  return (
    <>
      <NavigationAction
        icon="zoom-in"
        label="Zoom in"
        disabled={chartId == null}
        onPress={() => {
          if (chartId != null) TradingCharts.zoom(chartId, 1.25);
        }}
      />
      <NavigationAction
        icon="zoom-out"
        label="Zoom out"
        disabled={chartId == null}
        onPress={() => {
          if (chartId != null) TradingCharts.zoom(chartId, 0.8);
        }}
      />
      <NavigationAction
        icon="screen-rotation"
        label={isLandscape ? 'Switch to portrait' : 'Switch to landscape'}
        onPress={onToggleOrientation}
      />
      <NavigationAction
        icon="last-page"
        label="Go to latest candle"
        disabled={chartId == null}
        onPress={() => {
          if (chartId != null) TradingCharts.scrollToRealTime(chartId);
        }}
      />
      <SettingSwitch
        label="Performance"
        description="CPU usage and frame rate"
        disabled={chartId == null || !isPerformanceAvailable}
        value={showPerformance}
        onValueChange={togglePerformance}
      />
    </>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    label: { flex: 1, color: colors.text, fontSize: 15 },
    disabled: { opacity: 0.4 },
    pressed: { backgroundColor: colors.control },
  });
}

const THEMED_STYLES = createThemedStyles(createStyles);
