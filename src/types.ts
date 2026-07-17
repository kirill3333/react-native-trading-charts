import { type ViewProps } from 'react-native';

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

export type YAxisValueFormat = PriceValueFormat | CompactValueFormat;

export type XAxisOptions = {
  visible?: boolean;
  height?: number;
  locale?: string;
  timeZone?: string;
  showSeconds?: boolean;
};

export type PriceScaleMargins = {
  top: number;
  bottom: number;
};

export type YAxisOptions = {
  visible?: boolean;
  position?: 'left' | 'right';
  width?: number;
  scaleMargins?: PriceScaleMargins;
  valueFormat?: YAxisValueFormat;
};

export type GestureOptions = {
  pan?: boolean;
  zoom?: boolean;
};

export type CurrentPriceOptions = {
  visible?: boolean;
  showLabel?: boolean;
};

export type CrosshairOptions = {
  enabled?: boolean;
  showTooltip?: boolean;
};

export type TradingChartsViewProps = ViewProps & {
  chartId: string;
  timeframeMs?: number;
  initialVisibleCount?: number;
  theme?: ChartTheme;
  xAxis?: XAxisOptions;
  yAxis?: YAxisOptions;
  gestures?: GestureOptions;
  currentPrice?: CurrentPriceOptions;
  crosshair?: CrosshairOptions;
};

export type ResolvedChartConfig = {
  timeframeMs: number;
  initialVisibleCount: number;
  theme: Required<ChartTheme>;
  xAxis: Required<XAxisOptions>;
  yAxis: Omit<Required<YAxisOptions>, 'valueFormat'> & {
    valueFormat: Required<PriceValueFormat> | Required<CompactValueFormat>;
  };
  gestures: Required<GestureOptions>;
  currentPrice: Required<CurrentPriceOptions>;
  crosshair: Required<CrosshairOptions>;
};
