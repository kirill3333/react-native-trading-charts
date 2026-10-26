import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  ChartControlMenu,
  type ChartControlMenuKind,
} from './ChartControlMenu';
import { useChartSettingsStore } from '../stores/chartSettingsStore';
import { useChartControlsStore } from '../stores/chartControlsStore';
import { APP_THEMES, type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';

type ChartControlsProps = {
  isLandscape: boolean;
  onToggleOrientation: () => void;
};

export function ChartControls({
  isLandscape,
  onToggleOrientation,
}: ChartControlsProps) {
  const navigation = useNavigation();
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const [menu, setMenu] = useState<ChartControlMenuKind | null>(null);
  const hasIndicators = useChartSettingsStore(
    ({ settings }) =>
      settings.sarEnabled ||
      settings.bollEnabled ||
      settings.emaEnabled ||
      settings.smaEnabled
  );
  const hasPanels = useChartControlsStore(
    (state) => state.showMacd || state.showRsi || state.showVolume
  );
  const buttonStyle = [styles.button, isLandscape && styles.buttonLandscape];

  return (
    <>
      <ScrollView
        horizontal={!isLandscape}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={[styles.container, isLandscape && styles.containerLandscape]}
        contentContainerStyle={[
          styles.controls,
          isLandscape && styles.controlsLandscape,
        ]}
      >
        <Pressable
          accessibilityLabel="Chart indicators"
          accessibilityRole="button"
          accessibilityState={{ expanded: menu === 'indicators' }}
          onPress={() => setMenu('indicators')}
          style={({ pressed }) => [buttonStyle, pressed && styles.pressed]}
        >
          <MaterialIcons
            color={
              hasIndicators ? theme.colors.accentText : theme.colors.iconMuted
            }
            name="show-chart"
            size={24}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Chart panels"
          accessibilityRole="button"
          accessibilityState={{ expanded: menu === 'panels' }}
          onPress={() => setMenu('panels')}
          style={({ pressed }) => [buttonStyle, pressed && styles.pressed]}
        >
          <MaterialIcons
            color={hasPanels ? theme.colors.accentText : theme.colors.iconMuted}
            name="view-agenda"
            size={24}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Chart type"
          accessibilityRole="button"
          accessibilityState={{ expanded: menu === 'charts' }}
          onPress={() => setMenu('charts')}
          style={({ pressed }) => [buttonStyle, pressed && styles.pressed]}
        >
          <MaterialIcons
            color={theme.colors.accentText}
            name="candlestick-chart"
            size={24}
          />
        </Pressable>
        <View style={styles.spacer} />
        <Pressable
          accessibilityLabel="Chart navigation"
          accessibilityRole="button"
          accessibilityState={{ expanded: menu === 'navigation' }}
          onPress={() => setMenu('navigation')}
          style={({ pressed }) => [buttonStyle, pressed && styles.pressed]}
        >
          <MaterialIcons
            color={theme.colors.accentText}
            name="open-with"
            size={24}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Open chart settings"
          accessibilityRole="button"
          hitSlop={4}
          onPress={() =>
            navigation.navigate('ChartSettings', {
              orientation: isLandscape ? 'landscape' : 'portrait_up',
            })
          }
          style={({ pressed }) => [buttonStyle, pressed && styles.pressed]}
        >
          <MaterialIcons
            color={theme.colors.accentText}
            name="settings"
            size={24}
          />
        </Pressable>
      </ScrollView>
      {menu != null && (
        <ChartControlMenu
          kind={menu}
          isLandscape={isLandscape}
          onClose={() => setMenu(null)}
          onToggleOrientation={onToggleOrientation}
        />
      )}
    </>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    container: {
      flexGrow: 0,
      borderTopColor: colors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    containerLandscape: {
      width: 60,
      borderTopWidth: 0,
      borderRightColor: colors.borderSubtle,
      borderRightWidth: StyleSheet.hairlineWidth,
    },
    controls: {
      flexGrow: 1,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    controlsLandscape: {
      flexDirection: 'column',
      paddingHorizontal: 8,
      paddingVertical: 8,
      gap: 4,
    },
    spacer: { flexGrow: 1, minWidth: 8, minHeight: 8 },
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
    buttonLandscape: {
      height: 44,
      width: 44,
      minWidth: 44,
      marginHorizontal: 0,
    },
    pressed: { opacity: 0.7 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
