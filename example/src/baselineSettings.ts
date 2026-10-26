import { type ChartBaselineAppearance } from 'react-native-trading-charts';
import { type ChartSettings } from './stores/chartSettingsStore';
import { APP_THEMES } from './theme';

export function buildBaselineAppearance(settings: ChartSettings) {
  const theme = APP_THEMES[settings.themeMode];
  const input = settings.baselineAppearance;
  const top = input.topLineColor ?? theme.colors.positive;
  const bottom = input.bottomLineColor ?? theme.colors.negative;
  return {
    width: input.width ?? 1.5,
    style: input.style ?? 'solid',
    topLineColor: top,
    bottomLineColor: bottom,
    topFill: {
      topColor: input.topFill?.topColor ?? `${top.slice(0, 7)}66`,
      bottomColor: input.topFill?.bottomColor ?? `${top.slice(0, 7)}14`,
    },
    bottomFill: {
      topColor: input.bottomFill?.topColor ?? `${bottom.slice(0, 7)}14`,
      bottomColor: input.bottomFill?.bottomColor ?? `${bottom.slice(0, 7)}66`,
    },
    baseLine: {
      visible: input.baseLine?.visible ?? true,
      color:
        input.baseLine?.color ??
        theme.chartAppearance.grid?.color ??
        theme.colors.border,
      width: input.baseLine?.width ?? 1,
      style: input.baseLine?.style ?? 'dashed',
    },
  } satisfies ChartBaselineAppearance;
}
