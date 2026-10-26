import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { type ChartConnectionStatus } from '../api/useChartDataFeed';
import { type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';
import { createThemedStyles } from '../createThemedStyles';

type ConnectionBadgeProps = {
  status: ChartConnectionStatus;
};

export function ConnectionBadge({ status }: ConnectionBadgeProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  if (status === 'historical' || status === 'error' || status === 'no-data') {
    return null;
  }
  if (status === 'live') {
    return (
      <View pointerEvents="none" style={styles.liveBadge}>
        <View style={styles.liveDot} />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={styles.connectionBadge}>
      {status !== 'paused' && status !== 'offline' ? (
        <ActivityIndicator color={theme.colors.accentText} size="small" />
      ) : null}
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    liveBadge: {
      alignItems: 'center',
      backgroundColor: colors.liveSurface,
      borderRadius: 12,
      flexDirection: 'row',
      left: 12,
      paddingHorizontal: 9,
      paddingVertical: 6,
      position: 'absolute',
      top: 12,
    },
    liveDot: {
      backgroundColor: colors.positive,
      borderRadius: 4,
      height: 7,
      marginRight: 6,
      width: 7,
    },
    connectionBadge: {
      alignItems: 'center',
      alignSelf: 'center',
      backgroundColor: colors.connectionSurface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 9,
      position: 'absolute',
      top: 12,
    },
  });
}

const THEMED_STYLES = createThemedStyles(createStyles);
