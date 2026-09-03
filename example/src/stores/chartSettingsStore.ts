import {
  type ChartLineStyle,
  type ChartSeriesType,
  type OhlcValueSource,
} from 'react-native-trading-charts';
import { create } from 'zustand';

import { type AppThemeMode } from '../theme';

export type AxisSpacing = 'time' | 'logical';
export type PriceFormat = 'auto' | 'price' | 'compact';
export type ScaleMarginPreset = 'tight' | 'default' | 'loose';
export type CrosshairLineStyleSetting = 'solid' | 'dashed';
export type ChartLocale = 'en-GB' | 'en-US';
export type ChartTimeZone = 'utc' | 'device';
export type SeriesLineWidth = 1 | 1.5 | 2.5;
export type IndicatorLineWidth = 0.5 | SeriesLineWidth;
export type PaneHeightWeight = 0.5 | 1 | 2 | 3;
export type MovingAveragePeriod = 10 | 20 | 50 | 100 | 200;
export type MacdFastPeriod = 8 | 12 | 16;
export type MacdSlowPeriod = 21 | 26 | 32;
export type MacdSignalPeriod = 5 | 9 | 12;

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
  macdPaneHeightWeight: PaneHeightWeight;
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
  macdFastPeriod: MacdFastPeriod;
  macdSlowPeriod: MacdSlowPeriod;
  macdSignalPeriod: MacdSignalPeriod;
  macdValueSource: OhlcValueSource;
  macdLineWidth: IndicatorLineWidth;
  macdLineStyle: ChartLineStyle;
  macdLineColor: string | null;
  macdGradientEnabled: boolean;
  macdGradientTopColor: string | null;
  macdGradientBottomColor: string | null;
  macdSignalLineWidth: IndicatorLineWidth;
  macdSignalLineStyle: ChartLineStyle;
  macdSignalLineColor: string | null;
  macdSignalGradientEnabled: boolean;
  macdSignalGradientTopColor: string | null;
  macdSignalGradientBottomColor: string | null;
  macdPositiveIncreasingColor: string | null;
  macdPositiveDecreasingColor: string | null;
  macdNegativeIncreasingColor: string | null;
  macdNegativeDecreasingColor: string | null;
  macdTextColor: string | null;
  macdZeroLineColor: string | null;
  themeMode: AppThemeMode;
  xAxisVisible: boolean;
  xAxisShowSeconds: boolean;
  xAxisSpacing: AxisSpacing;
  yAxisVisible: boolean;
  yAxisFormat: PriceFormat;
  yAxisUseGrouping: boolean;
  yAxisScaleMargins: ScaleMarginPreset;
  panEnabled: boolean;
  zoomEnabled: boolean;
  currentPriceVisible: boolean;
  currentPriceShowLabel: boolean;
  currentPricePinToEdge: boolean;
  priceExtremesVisible: boolean;
  allTimeExtremesVisible: boolean;
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
  macdPaneHeightWeight: 1,
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
  macdFastPeriod: 12,
  macdSlowPeriod: 26,
  macdSignalPeriod: 9,
  macdValueSource: 'close',
  macdLineWidth: 1,
  macdLineStyle: 'solid',
  macdLineColor: null,
  macdGradientEnabled: false,
  macdGradientTopColor: null,
  macdGradientBottomColor: null,
  macdSignalLineWidth: 1,
  macdSignalLineStyle: 'solid',
  macdSignalLineColor: null,
  macdSignalGradientEnabled: false,
  macdSignalGradientTopColor: null,
  macdSignalGradientBottomColor: null,
  macdPositiveIncreasingColor: null,
  macdPositiveDecreasingColor: null,
  macdNegativeIncreasingColor: null,
  macdNegativeDecreasingColor: null,
  macdTextColor: null,
  macdZeroLineColor: null,
  themeMode: 'dark',
  xAxisVisible: true,
  xAxisShowSeconds: false,
  xAxisSpacing: 'time',
  yAxisVisible: true,
  yAxisFormat: 'auto',
  yAxisUseGrouping: true,
  yAxisScaleMargins: 'default',
  panEnabled: true,
  zoomEnabled: true,
  currentPriceVisible: true,
  currentPriceShowLabel: true,
  currentPricePinToEdge: true,
  priceExtremesVisible: true,
  allTimeExtremesVisible: false,
  crosshairEnabled: true,
  crosshairShowTooltip: true,
  crosshairLineStyle: 'dashed',
  crosshairTooltipOpacity: 0.85,
  locale: 'en-GB',
  timeZone: 'utc',
  currencySymbol: '',
};

type ChartSettingsStore = {
  settings: ChartSettings;
  updateSettings: (patch: Partial<ChartSettings>) => void;
  resetSettings: () => void;
};

export const useChartSettingsStore = create<ChartSettingsStore>((set) => ({
  settings: { ...DEFAULT_CHART_SETTINGS },
  updateSettings: (patch) =>
    set((state) => ({ settings: { ...state.settings, ...patch } })),
  resetSettings: () => set({ settings: { ...DEFAULT_CHART_SETTINGS } }),
}));
