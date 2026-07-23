import { type NativeSyntheticEvent, type ViewProps } from 'react-native';

export type OhlcCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type TradeEvent = {
  timestamp: number;
  price: number;
  size?: number;
};

export type ChartSeriesType = 'candlestick' | 'bar';

export type ChartSeriesOptions = {
  type?: ChartSeriesType;
};

export type ChartTheme = {
  backgroundColor?: string;
  gridColor?: string;
  axisTextColor?: string;
  upColor?: string;
  downColor?: string;
  crosshairColor?: string;
  tooltipBackgroundColor?: string;
  tooltipTextColor?: string;
};

export type ChartFontWeight =
  | 'regular'
  | 'medium'
  | 'semibold'
  | 'bold';

export type ChartTextStyle = {
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: ChartFontWeight;
};

export type ChartBorderStyle = {
  color?: string;
  width?: number;
  radius?: number;
};

export type ChartBadgeStyle = {
  backgroundColor?: string;
  text?: ChartTextStyle;
  border?: ChartBorderStyle;
};

export type ChartDirectionalBadgeStyle = Omit<
  ChartBadgeStyle,
  'backgroundColor'
> & {
  upBackgroundColor?: string;
  downBackgroundColor?: string;
};

export type ChartAppearance = {
  backgroundColor?: string;
  grid?: {
    color?: string;
    opacity?: number;
  };
  candles?: {
    upColor?: string;
    downColor?: string;
  };
  bars?: {
    upColor?: string;
    downColor?: string;
    lineWidth?: number;
  };
  xAxis?: { text?: ChartTextStyle };
  yAxis?: { text?: ChartTextStyle };
  priceExtremes?: {
    text?: ChartTextStyle;
    connectorColor?: string;
    backgroundColor?: string;
  };
  currentPrice?: {
    line?: {
      upColor?: string;
      downColor?: string;
    };
    label?: ChartDirectionalBadgeStyle;
  };
  crosshair?: {
    line?: {
      color?: string;
      opacity?: number;
    };
    priceLabel?: ChartBadgeStyle;
    timeLabel?: ChartBadgeStyle;
  };
  tooltip?: {
    backgroundColor?: string;
    backgroundOpacity?: number;
    headerText?: ChartTextStyle;
    labelText?: ChartTextStyle;
    valueText?: ChartTextStyle;
    positiveValueColor?: string;
    negativeValueColor?: string;
    border?: ChartBorderStyle;
  };
};

export type PriceValueFormat = {
  type: 'price';
  precision?: number;
  minMove?: number;
  locale?: string;
  currencySymbol?: string;
  useGrouping?: boolean;
};

export type CompactValueFormat = {
  type: 'compact';
  precision?: number;
  minMove?: number;
  locale?: string;
  currencySymbol?: string;
};

export type SignificantValueFormat = {
  type: 'significant';
  significantDigits?: number;
  minMove?: number;
  locale?: string;
  currencySymbol?: string;
  useGrouping?: boolean;
};

export type YAxisValueFormat =
  | PriceValueFormat
  | CompactValueFormat
  | SignificantValueFormat;

export type PriceDisplayFormat =
  | Omit<PriceValueFormat, 'minMove'>
  | (Omit<CompactValueFormat, 'minMove'> & { useGrouping?: boolean })
  | Omit<SignificantValueFormat, 'minMove'>;

export type DatePatternFormat = {
  pattern: string;
  locale?: string;
  timeZone?: string;
};

export type XAxisDateFormats = {
  locale?: string;
  timeZone?: string;
  seconds?: string;
  time?: string;
  day?: string;
  month?: string;
  year?: string;
};

export type ChartFormatters = {
  date?: {
    xAxis?: XAxisDateFormats;
    crosshairTimeBadge?: DatePatternFormat;
    tooltipHeader?: DatePatternFormat;
  };
  price?: {
    yAxis?: YAxisValueFormat;
    priceExtremes?: PriceDisplayFormat;
    currentPrice?: PriceDisplayFormat;
    crosshairPrice?: PriceDisplayFormat;
    tooltip?: PriceDisplayFormat;
  };
};

export type XAxisOptions = {
  visible?: boolean;
  height?: number;
  locale?: string;
  timeZone?: string;
  showSeconds?: boolean;
  spacing?: 'time' | 'logical';
};

export type PriceScaleMargins = {
  top: number;
  bottom: number;
};

export type YAxisOptions = {
  visible?: boolean;
  position?: 'left' | 'right';
  width?: number;
  defaultScale?: number;
  scaleMargins?: PriceScaleMargins;
  valueFormat?: YAxisValueFormat;
};

export type GestureOptions = {
  pan?: boolean;
  zoom?: boolean;
  yAxisScale?: boolean;
};

export type CurrentPriceOptions = {
  visible?: boolean;
  showLabel?: boolean;
  pinToEdge?: boolean;
};

export type PriceExtremesOptions = {
  visible?: boolean;
};

export type CrosshairLineStyle = 'solid' | 'dashed';

export type CrosshairTooltipLabels = {
  open?: string;
  close?: string;
  high?: string;
  low?: string;
  amplitude?: string;
  changePercent?: string;
  change?: string;
  volume?: string;
};

export type CrosshairOptions = {
  enabled?: boolean;
  showTooltip?: boolean;
  tooltipBackgroundOpacity?: number;
  lineStyle?: CrosshairLineStyle;
  tooltipLabels?: CrosshairTooltipLabels;
};

export type VisibleRangeChangeEvent = {
  from: number;
  to: number;
  firstVisibleIndex: number;
  lastVisibleIndex: number;
  totalCount: number;
  atStart: boolean;
  atEnd: boolean;
};

export type ScaleChangeEvent = {
  scale: number;
};

export type TradingChartsViewProps = ViewProps & {
  chartId: string;
  timeframeMs?: number;
  initialVisibleCount?: number;
  defaultScale?: number;
  series?: ChartSeriesOptions;
  theme?: ChartTheme;
  appearance?: ChartAppearance;
  formatters?: ChartFormatters;
  xAxis?: XAxisOptions;
  yAxis?: YAxisOptions;
  gestures?: GestureOptions;
  currentPrice?: CurrentPriceOptions;
  priceExtremes?: PriceExtremesOptions;
  crosshair?: CrosshairOptions;
  onVisibleRangeChange?: (
    event: NativeSyntheticEvent<VisibleRangeChangeEvent>
  ) => void;
  onScaleChange?: (event: NativeSyntheticEvent<ScaleChangeEvent>) => void;
  onYAxisScaleChange?: (
    event: NativeSyntheticEvent<ScaleChangeEvent>
  ) => void;
  onSelectedCandleChange?: (candle: OhlcCandle | null) => void;
};

export type ResolvedChartConfig = {
  timeframeMs: number;
  initialVisibleCount: number;
  defaultScale: number;
  series: Required<ChartSeriesOptions>;
  theme: Required<ChartTheme>;
  appearance: ResolvedChartAppearance;
  formatters: ResolvedChartFormatters;
  xAxis: Required<XAxisOptions>;
  yAxis: Omit<Required<YAxisOptions>, 'valueFormat'> & {
    valueFormat: ResolvedYAxisValueFormat;
  };
  gestures: Required<GestureOptions>;
  currentPrice: Required<CurrentPriceOptions>;
  priceExtremes: Required<PriceExtremesOptions>;
  crosshair: Omit<Required<CrosshairOptions>, 'tooltipLabels'> & {
    tooltipLabels: Required<CrosshairTooltipLabels>;
  };
};

export type ResolvedChartTextStyle = {
  color: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: ChartFontWeight;
};

export type ResolvedChartBorderStyle = Required<ChartBorderStyle>;

export type ResolvedChartAppearance = {
  backgroundColor: string;
  grid: { color: string; opacity: number };
  candles: { upColor: string; downColor: string };
  bars: { upColor: string; downColor: string; lineWidth: number };
  xAxis: { text: ResolvedChartTextStyle };
  yAxis: { text: ResolvedChartTextStyle };
  priceExtremes: {
    text: ResolvedChartTextStyle;
    connectorColor: string;
    backgroundColor: string;
  };
  currentPrice: {
    line: { upColor: string; downColor: string };
    label: {
      upBackgroundColor: string;
      downBackgroundColor: string;
      text: ResolvedChartTextStyle;
      border: ResolvedChartBorderStyle;
    };
  };
  crosshair: {
    line: { color: string; opacity: number };
    priceLabel: {
      backgroundColor: string;
      text: ResolvedChartTextStyle;
      border: ResolvedChartBorderStyle;
    };
    timeLabel: {
      backgroundColor: string;
      text: ResolvedChartTextStyle;
      border: ResolvedChartBorderStyle;
    };
  };
  tooltip: {
    backgroundColor: string;
    backgroundOpacity: number;
    headerText: ResolvedChartTextStyle;
    labelText: ResolvedChartTextStyle;
    valueText: ResolvedChartTextStyle;
    positiveValueColor: string;
    negativeValueColor: string;
    border: ResolvedChartBorderStyle;
  };
};

export type ResolvedYAxisValueFormat =
  | Required<PriceValueFormat>
  | Required<CompactValueFormat>
  | Required<SignificantValueFormat>;

export type ResolvedPriceDisplayFormat =
  | {
      type: 'price' | 'compact';
      precision: number;
      locale: string;
      currencySymbol: string;
      useGrouping: boolean;
    }
  | {
      type: 'significant';
      significantDigits: number;
      locale: string;
      currencySymbol: string;
      useGrouping: boolean;
    };

export type ResolvedDatePatternFormat = Required<DatePatternFormat>;

export type ResolvedChartFormatters = {
  date: {
    xAxis: Required<XAxisDateFormats>;
    crosshairTimeBadge: ResolvedDatePatternFormat;
    tooltipHeader: ResolvedDatePatternFormat;
  };
  price: {
    yAxis: ResolvedYAxisValueFormat;
    priceExtremes: ResolvedPriceDisplayFormat;
    currentPrice: ResolvedPriceDisplayFormat;
    crosshairPrice: ResolvedPriceDisplayFormat;
    tooltip: ResolvedPriceDisplayFormat;
  };
};
