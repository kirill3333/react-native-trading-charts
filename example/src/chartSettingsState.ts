import { type ChartSeriesType } from 'react-native-trading-charts';

import { type AppThemeMode } from './theme';

export type AxisSpacing = 'time' | 'logical';
export type AxisPosition = 'left' | 'right';
export type PriceFormat = 'auto' | 'price' | 'compact';
export type ScaleMarginPreset = 'tight' | 'default' | 'loose';
export type CrosshairLineStyleSetting = 'solid' | 'dashed';
export type ChartLocale = 'en-GB' | 'en-US';
export type ChartTimeZone = 'utc' | 'device';
export type SeriesLineWidth = 1 | 1.5 | 2.5;
export type PaneHeightWeight = 0.5 | 1 | 2 | 3;

export type ChartSettings = {
  seriesType: ChartSeriesType;
  seriesLineWidth: SeriesLineWidth;
  mainPaneHeightWeight: PaneHeightWeight;
  volumePaneHeightWeight: PaneHeightWeight;
  rsiPaneHeightWeight: PaneHeightWeight;
  themeMode: AppThemeMode;
  xAxisVisible: boolean;
  xAxisShowSeconds: boolean;
  xAxisSpacing: AxisSpacing;
  yAxisVisible: boolean;
  yAxisPosition: AxisPosition;
  yAxisFormat: PriceFormat;
  yAxisUseGrouping: boolean;
  yAxisScaleMargins: ScaleMarginPreset;
  panEnabled: boolean;
  zoomEnabled: boolean;
  currentPriceVisible: boolean;
  currentPriceShowLabel: boolean;
  currentPricePinToEdge: boolean;
  priceExtremesVisible: boolean;
  crosshairEnabled: boolean;
  crosshairShowTooltip: boolean;
  crosshairLineStyle: CrosshairLineStyleSetting;
  crosshairTooltipOpacity: 0.6 | 0.85 | 1;
  locale: ChartLocale;
  timeZone: ChartTimeZone;
  currencySymbol: string;
};

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  seriesType: 'candlestick',
  seriesLineWidth: 1.5,
  mainPaneHeightWeight: 3,
  volumePaneHeightWeight: 1,
  rsiPaneHeightWeight: 1,
  themeMode: 'dark',
  xAxisVisible: true,
  xAxisShowSeconds: false,
  xAxisSpacing: 'time',
  yAxisVisible: true,
  yAxisPosition: 'right',
  yAxisFormat: 'auto',
  yAxisUseGrouping: true,
  yAxisScaleMargins: 'default',
  panEnabled: true,
  zoomEnabled: true,
  currentPriceVisible: true,
  currentPriceShowLabel: true,
  currentPricePinToEdge: true,
  priceExtremesVisible: true,
  crosshairEnabled: true,
  crosshairShowTooltip: true,
  crosshairLineStyle: 'dashed',
  crosshairTooltipOpacity: 0.85,
  locale: 'en-GB',
  timeZone: 'utc',
  currencySymbol: '',
};

export type ChartSettingsAction =
  { type: 'update'; patch: Partial<ChartSettings> } | { type: 'reset' };

export function chartSettingsReducer(
  state: ChartSettings,
  action: ChartSettingsAction
): ChartSettings {
  if (action.type === 'reset') {
    return { ...DEFAULT_CHART_SETTINGS };
  }
  return { ...state, ...action.patch };
}
