import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { Pressable, StyleSheet, View } from 'react-native';
import { TradingCharts } from 'react-native-trading-charts';

import { useChartControlsStore } from '../stores/chartControlsStore';
import { APP_THEMES, type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';

export function ChartControls() {
  const navigation = useNavigation();
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const chartId = useChartControlsStore((state) => state.activeChartId);
  const showMacd = useChartControlsStore((state) => state.showMacd);
  const showRsi = useChartControlsStore((state) => state.showRsi);
  const showVolume = useChartControlsStore((state) => state.showVolume);
  const isChartHalfHeight = useChartControlsStore(
    (state) => state.isChartHalfHeight
  );
  const canToggleChartHeight = useChartControlsStore(
    (state) => state.fullChartHeight != null
  );
  const toggleMacd = useChartControlsStore((state) => state.toggleMacd);
  const toggleRsi = useChartControlsStore((state) => state.toggleRsi);
  const toggleVolume = useChartControlsStore((state) => state.toggleVolume);
  const toggleChartHeight = useChartControlsStore(
    (state) => state.toggleChartHeight
  );

  return (
    <View style={styles.controls}>
      <Pressable
        accessibilityLabel={showMacd ? 'Hide MACD' : 'Show MACD'}
        accessibilityRole="switch"
        accessibilityState={{ checked: showMacd }}
        onPress={toggleMacd}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <MaterialIcons
          color={showMacd ? theme.macd.lineColor : theme.colors.iconMuted}
          name="ssid-chart"
          size={24}
        />
      </Pressable>
      <Pressable
        accessibilityLabel={showRsi ? 'Hide RSI' : 'Show RSI'}
        accessibilityRole="switch"
        accessibilityState={{ checked: showRsi }}
        onPress={toggleRsi}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <MaterialIcons
          color={showRsi ? theme.colors.accent : theme.colors.iconMuted}
          name="show-chart"
          size={24}
        />
      </Pressable>
      <Pressable
        accessibilityLabel={showVolume ? 'Hide volume' : 'Show volume'}
        accessibilityRole="switch"
        accessibilityState={{ checked: showVolume }}
        onPress={toggleVolume}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <MaterialIcons
          color={showVolume ? theme.colors.positive : theme.colors.iconMuted}
          name="bar-chart"
          size={24}
        />
      </Pressable>
      <Pressable
        accessibilityLabel="Zoom in chart"
        accessibilityRole="button"
        hitSlop={4}
        onPress={() => {
          if (chartId != null) {
            TradingCharts.zoom(chartId, 1.25);
          }
        }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <MaterialIcons color={theme.colors.text} name="zoom-in" size={24} />
      </Pressable>
      <Pressable
        accessibilityLabel="Zoom out chart"
        accessibilityRole="button"
        hitSlop={4}
        onPress={() => {
          if (chartId != null) {
            TradingCharts.zoom(chartId, 0.8);
          }
        }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <MaterialIcons color={theme.colors.text} name="zoom-out" size={24} />
      </Pressable>
      <Pressable
        accessibilityLabel={
          isChartHalfHeight
            ? 'Restore full chart height'
            : 'Reduce chart to half height'
        }
        accessibilityRole="switch"
        accessibilityState={{
          checked: isChartHalfHeight,
          disabled: !canToggleChartHeight,
        }}
        disabled={!canToggleChartHeight}
        onPress={toggleChartHeight}
        style={({ pressed }) => [
          styles.button,
          !canToggleChartHeight && styles.buttonDisabled,
          pressed && styles.pressed,
        ]}
      >
        <MaterialIcons
          color={
            isChartHalfHeight ? theme.colors.positive : theme.colors.accentText
          }
          name="height"
          size={24}
        />
      </Pressable>
      <Pressable
        accessibilityLabel="Open chart settings"
        accessibilityRole="button"
        hitSlop={4}
        onPress={() => navigation.navigate('ChartSettings')}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <MaterialIcons
          color={theme.colors.accentText}
          name="settings"
          size={24}
        />
      </Pressable>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    controls: {
      alignItems: 'center',
      borderTopColor: colors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    button: {
      alignItems: 'center',
      backgroundColor: colors.control,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      height: 40,
      justifyContent: 'center',
      marginHorizontal: 4,
      minWidth: 48,
      width: 48,
    },
    buttonDisabled: { opacity: 0.4 },
    pressed: { opacity: 0.7 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
