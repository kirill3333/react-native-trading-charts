import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_THEMES, type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';
import { ChartControls } from './ChartControls';

type ChartWorkspaceProps = {
  isLandscape: boolean;
  onToggleOrientation: () => void;
  header: ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
};

export function ChartWorkspace({
  isLandscape,
  onToggleOrientation,
  header,
  toolbar,
  children,
}: ChartWorkspaceProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  return (
    <SafeAreaView style={styles.screen}>
      {!isLandscape && header}
      <View
        style={[styles.workspace, isLandscape && styles.workspaceLandscape]}
      >
        <ChartControls
          isLandscape={isLandscape}
          onToggleOrientation={onToggleOrientation}
        />
        <View style={styles.chartColumn}>
          {toolbar}
          <View style={styles.chartContainer}>{children}</View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    workspace: { flex: 1, flexDirection: 'column-reverse' },
    workspaceLandscape: { flexDirection: 'row' },
    chartColumn: { flex: 1, minWidth: 0, minHeight: 0 },
    chartContainer: { flex: 1, position: 'relative' },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
