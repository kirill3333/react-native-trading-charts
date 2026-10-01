import { StyleSheet, Text, View } from 'react-native';

import { type PerformanceSample } from '../../performance';
import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

function format(value: number | null | undefined, suffix = '') {
  return value == null ? '—' : `${value.toFixed(1)}${suffix}`;
}

export function SyntheticPerformanceReadout({
  sample,
  android,
  landscape,
}: {
  sample: PerformanceSample | null;
  android: boolean;
  landscape: boolean;
}) {
  const { mode } = useAppTheme();
  const styles = THEMED_STYLES[mode];
  const compact = android && !landscape;
  const main = sample?.threads.find((thread) => thread.isMainThread);
  const js = sample?.threads.find((thread) => thread.isJSThread);
  const cpu = (
    <>
      <PerformanceMetric
        compact={compact}
        label="Main CPU"
        value={format(main?.cpuPercent, '%')}
      />
      <PerformanceMetric
        compact={compact}
        label="JS CPU"
        value={format(js?.cpuPercent, '%')}
      />
      {android && (
        <PerformanceMetric
          compact={compact}
          label="GL CPU"
          value={format(sample?.glThread?.cpuPercent, '%')}
        />
      )}
    </>
  );
  const fps = (
    <>
      <PerformanceMetric
        compact={compact}
        label="UI FPS"
        value={format(sample?.uiFPS)}
      />
      <PerformanceMetric
        compact={compact}
        label={android ? 'GL FPS' : 'Metal FPS'}
        value={format(android ? sample?.glFPS : sample?.metalFPS)}
      />
    </>
  );
  return (
    <View
      style={[styles.panel, compact && styles.compactPanel]}
      accessibilityLabel="Application performance"
    >
      <View style={[styles.row, compact && styles.compactRow]}>
        {cpu}
        {fps}
      </View>
    </View>
  );
}

function PerformanceMetric({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact: boolean;
}) {
  const { mode } = useAppTheme();
  const styles = THEMED_STYLES[mode];
  return (
    <View
      style={styles.metric}
      accessible
      accessibilityLabel={`${label} ${value}`}
    >
      <Text
        style={[styles.label, compact && styles.compactLabel]}
        numberOfLines={compact ? 1 : undefined}
        adjustsFontSizeToFit={compact}
        minimumFontScale={0.8}
      >
        {label}
      </Text>
      <Text
        style={[styles.value, compact && styles.compactValue]}
        numberOfLines={compact ? 1 : undefined}
        adjustsFontSizeToFit={compact}
        minimumFontScale={0.8}
      >
        {value}
      </Text>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', columnGap: 12 },
    panel: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderBottomColor: colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    compactPanel: { paddingHorizontal: 10, paddingVertical: 8 },
    compactRow: { columnGap: 6 },
    compactLabel: { fontSize: 12 },
    compactValue: { fontSize: 18 },
    metric: { flex: 1, minWidth: 0, gap: 3 },
    label: { color: colors.accentText, fontSize: 14, fontWeight: '600' },
    value: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
