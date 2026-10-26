import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { createThemedStyles } from '../createThemedStyles';
import { ChartControlButton } from './ChartControlButton';
import { CHART_INDICATORS } from '../chartIndicators';
import {
  ChartControlMenu,
  type ChartControlMenuKind,
} from './ChartControlMenu';
import { useChartSettingsStore } from '../stores/chartSettingsStore';
import { useChartControlsStore } from '../stores/chartControlsStore';
import { type AppThemeColors } from '../theme';
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
  const hasIndicators = useChartSettingsStore(({ settings }) =>
    CHART_INDICATORS.some(({ key }) => settings[key])
  );
  const hasPanels = useChartControlsStore(
    (state) => state.showMacd || state.showRsi || state.showVolume
  );

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
        <ChartControlButton
          label="Chart indicators"
          icon="show-chart"
          isLandscape={isLandscape}
          active={hasIndicators}
          expanded={menu === 'indicators'}
          onPress={() => setMenu('indicators')}
        />
        <ChartControlButton
          label="Chart panels"
          icon="view-agenda"
          isLandscape={isLandscape}
          active={hasPanels}
          expanded={menu === 'panels'}
          onPress={() => setMenu('panels')}
        />
        <ChartControlButton
          label="Chart type"
          icon="candlestick-chart"
          isLandscape={isLandscape}
          expanded={menu === 'charts'}
          onPress={() => setMenu('charts')}
        />
        <View style={styles.spacer} />
        <ChartControlButton
          label="Chart navigation"
          icon="open-with"
          isLandscape={isLandscape}
          expanded={menu === 'navigation'}
          onPress={() => setMenu('navigation')}
        />
        <ChartControlButton
          label="Open chart settings"
          icon="settings"
          isLandscape={isLandscape}
          hitSlop={4}
          onPress={() =>
            navigation.navigate('ChartSettings', {
              orientation: isLandscape ? 'landscape' : 'portrait_up',
            })
          }
        />
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
  });
}

const THEMED_STYLES = createThemedStyles(createStyles);
