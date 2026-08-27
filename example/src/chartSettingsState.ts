import {
  type ChartLineStyle,
  type ChartSeriesType,
  type OhlcValueSource,
} from 'react-native-trading-charts';

import { type AppThemeMode } from './theme';

export type AxisSpacing = 'time' | 'logical';
export type AxisPosition = 'left' | 'right';
export type PriceFormat = 'auto' | 'price' | 'compact';
export type ScaleMarginPreset = 'tight' | 'default' | 'loose';
export type CrosshairLineStyleSetting = 'solid' | 'dashed';
export type ChartLocale = 'en-GB' | 'en-US';
export type ChartTimeZone = 'utc' | 'device';
export type SeriesLineWidth = 1 | 1.5 | 2.5;
export type IndicatorLineWidth = 0.5 | SeriesLineWidth;
export type PaneHeightWeight = 0.5 | 1 | 2 | 3;
export type MovingAveragePeriod = 10 | 20 | 50 | 100 | 200;

export type ChartSettings = {
  seriesType: ChartSeriesType;
  seriesLineWidth: SeriesLineWidth;
  mainUpColorOverride: string | null;
  mainDownColorOverride: string | null;
  mainLineColorOverride: string | null;
  mainAreaFillTopColorOverride: string | null;
  mainAreaFillBottomColorOverride: string | null;
  volumeUpColorOverride: string | null;
  volumeDownColorOverride: string | null;
  mainPaneHeightWeight: PaneHeightWeight;
  volumePaneHeightWeight: PaneHeightWeight;
  rsiPaneHeightWeight: PaneHeightWeight;
  rsiLineWidth: IndicatorLineWidth;
  rsiLineColorOverride: string | null;
  rsiTextColorOverride: string | null;
  rsiBandColorOverride: string | null;
  rsiLevelLineColorOverride: string | null;
  smaEnabled: boolean;
  smaPeriod: MovingAveragePeriod;
  smaValueSource: OhlcValueSource;
  smaLineWidth: IndicatorLineWidth;
  smaLineStyle: ChartLineStyle;
  smaLineColor: string;
  smaGradientEnabled: boolean;
  smaGradientTopColor: string;
  smaGradientBottomColor: string;
  emaEnabled: boolean;
  emaPeriod: MovingAveragePeriod;
  emaValueSource: OhlcValueSource;
  emaLineWidth: IndicatorLineWidth;
  emaLineStyle: ChartLineStyle;
  emaLineColor: string;
  emaGradientEnabled: boolean;
  emaGradientTopColor: string;
  emaGradientBottomColor: string;
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
  mainUpColorOverride: null,
  mainDownColorOverride: null,
  mainLineColorOverride: null,
  mainAreaFillTopColorOverride: null,
  mainAreaFillBottomColorOverride: null,
  volumeUpColorOverride: null,
  volumeDownColorOverride: null,
  mainPaneHeightWeight: 3,
  volumePaneHeightWeight: 1,
  rsiPaneHeightWeight: 1,
  rsiLineWidth: 0.5,
  rsiLineColorOverride: null,
  rsiTextColorOverride: null,
  rsiBandColorOverride: null,
  rsiLevelLineColorOverride: null,
  smaEnabled: false,
  smaPeriod: 20,
  smaValueSource: 'close',
  smaLineWidth: 0.5,
  smaLineStyle: 'solid',
  smaLineColor: '#2E90F5',
  smaGradientEnabled: false,
  smaGradientTopColor: '#C51BFF',
  smaGradientBottomColor: '#2E90F5',
  emaEnabled: false,
  emaPeriod: 50,
  emaValueSource: 'close',
  emaLineWidth: 0.5,
  emaLineStyle: 'dashed',
  emaLineColor: '#F5A623',
  emaGradientEnabled: false,
  emaGradientTopColor: '#FFE08A',
  emaGradientBottomColor: '#F5A623',
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
