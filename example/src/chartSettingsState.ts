export type ChartThemeMode = 'default' | 'highContrast';
export type AxisSpacing = 'time' | 'logical';
export type AxisPosition = 'left' | 'right';
export type PriceFormat = 'auto' | 'price' | 'compact';
export type ScaleMarginPreset = 'tight' | 'default' | 'loose';
export type CrosshairLineStyleSetting = 'solid' | 'dashed';
export type ChartLocale = 'en-GB' | 'en-US';
export type ChartTimeZone = 'utc' | 'device';

export type ChartSettings = {
  themeMode: ChartThemeMode;
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
  themeMode: 'default',
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
