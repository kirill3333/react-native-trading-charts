import {
  type ChartLineStyle,
  type ChartSeriesType,
  type OhlcValueSource,
} from 'react-native-trading-charts';

import {
  type AxisPosition,
  type AxisSpacing,
  type ChartLocale,
  type ChartSettings,
  type ChartTimeZone,
  type IndicatorLineWidth,
  type MacdFastPeriod,
  type MacdSignalPeriod,
  type MacdSlowPeriod,
  type MovingAveragePeriod,
  type PaneHeightWeight,
  type PriceFormat,
  type ScaleMarginPreset,
  type SeriesLineWidth,
} from '../../../stores/chartSettingsStore';
import { type SettingSegmentOption } from '../SettingSegments';

export const SERIES_OPTIONS = [
  { label: 'Candles', value: 'candlestick' },
  { label: 'Hollow', value: 'hollowCandlestick' },
  { label: 'Bars', value: 'bar' },
  { label: 'Line', value: 'line' },
  { label: 'Area', value: 'area' },
] satisfies ReadonlyArray<SettingSegmentOption<ChartSeriesType>>;

export const SPACING_OPTIONS = [
  { label: 'Time', value: 'time' },
  { label: 'Logical', value: 'logical' },
] satisfies ReadonlyArray<SettingSegmentOption<AxisSpacing>>;

export const SERIES_LINE_WIDTH_OPTIONS = [
  { label: 'Thin', value: 1 },
  { label: 'Medium', value: 1.5 },
  { label: 'Thick', value: 2.5 },
] satisfies ReadonlyArray<SettingSegmentOption<SeriesLineWidth>>;

export const INDICATOR_LINE_WIDTH_OPTIONS = [
  { label: 'Hairline', value: 0.5 },
  ...SERIES_LINE_WIDTH_OPTIONS,
] satisfies ReadonlyArray<SettingSegmentOption<IndicatorLineWidth>>;

export const SMA_PERIOD_OPTIONS = [
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 },
] satisfies ReadonlyArray<SettingSegmentOption<MovingAveragePeriod>>;

export const EMA_PERIOD_OPTIONS = [
  { label: '20', value: 20 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
] satisfies ReadonlyArray<SettingSegmentOption<MovingAveragePeriod>>;

export const MACD_FAST_PERIOD_OPTIONS = [
  { label: '8', value: 8 },
  { label: '12', value: 12 },
  { label: '16', value: 16 },
] satisfies ReadonlyArray<SettingSegmentOption<MacdFastPeriod>>;

export const MACD_SLOW_PERIOD_OPTIONS = [
  { label: '21', value: 21 },
  { label: '26', value: 26 },
  { label: '32', value: 32 },
] satisfies ReadonlyArray<SettingSegmentOption<MacdSlowPeriod>>;

export const MACD_SIGNAL_PERIOD_OPTIONS = [
  { label: '5', value: 5 },
  { label: '9', value: 9 },
  { label: '12', value: 12 },
] satisfies ReadonlyArray<SettingSegmentOption<MacdSignalPeriod>>;

export const VALUE_SOURCE_OPTIONS = [
  { label: 'Open', value: 'open' },
  { label: 'High', value: 'high' },
  { label: 'Low', value: 'low' },
  { label: 'Close', value: 'close' },
] satisfies ReadonlyArray<SettingSegmentOption<OhlcValueSource>>;

export const PANE_HEIGHT_WEIGHT_OPTIONS = [
  { label: '½×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '3×', value: 3 },
] satisfies ReadonlyArray<SettingSegmentOption<PaneHeightWeight>>;

export const POSITION_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
] satisfies ReadonlyArray<SettingSegmentOption<AxisPosition>>;

export const FORMAT_OPTIONS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Price', value: 'price' },
  { label: 'Compact', value: 'compact' },
] satisfies ReadonlyArray<SettingSegmentOption<PriceFormat>>;

export const MARGIN_OPTIONS = [
  { label: 'Tight', value: 'tight' },
  { label: 'Default', value: 'default' },
  { label: 'Loose', value: 'loose' },
] satisfies ReadonlyArray<SettingSegmentOption<ScaleMarginPreset>>;

export const LINE_OPTIONS = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
] satisfies ReadonlyArray<SettingSegmentOption<ChartLineStyle>>;

export const OPACITY_OPTIONS = [
  { label: '60%', value: 0.6 },
  { label: '85%', value: 0.85 },
  { label: '100%', value: 1 },
] satisfies ReadonlyArray<
  SettingSegmentOption<ChartSettings['crosshairTooltipOpacity']>
>;

export const LOCALE_OPTIONS = [
  { label: 'en-GB', value: 'en-GB' },
  { label: 'en-US', value: 'en-US' },
] satisfies ReadonlyArray<SettingSegmentOption<ChartLocale>>;

export const TIME_ZONE_OPTIONS = [
  { label: 'UTC', value: 'utc' },
  { label: 'Device', value: 'device' },
] satisfies ReadonlyArray<SettingSegmentOption<ChartTimeZone>>;
