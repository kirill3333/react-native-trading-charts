import { type ViewProps } from 'react-native';
import {
  type PaneResizeNativeEvent,
  type PriceScaleChangeNativeEvent,
  type ScaleChangeNativeEvent,
  type VisibleRangeChangeNativeEvent,
} from './TradingChartsViewNativeComponent';

export type OhlcCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Traded volume. Packed as 0 when omitted, so native code and
   * getCandles() cannot distinguish "no volume" from "zero volume". */
  volume?: number;
};

export type TradeEvent = {
  timestamp: number;
  price: number;
  size?: number;
};

export type ChartSeriesType =
  | 'candlestick'
  | 'hollowCandlestick'
  | 'bar'
  | 'line';

export type OhlcValueSource = 'open' | 'high' | 'low' | 'close';

export type ChartLineAppearance = {
  width?: number;
  color?: string;
  gradient?: {
    topColor: string;
    bottomColor: string;
  };
};

export type ChartSeriesOptions =
  | {
      type?: 'candlestick' | 'hollowCandlestick' | 'bar';
      source?: never;
      gapThresholdMs?: never;
    }
  | {
      type: 'line';
      source?: OhlcValueSource;
      gapThresholdMs?: number;
    };

export type HistogramPoint = {
  timestamp: number;
  value: number;
};

export type VolumeValueFormat = {
  type: 'volume';
  precision?: number;
  locale?: string;
  useGrouping?: boolean;
};

export type ChartPanePriceScaleOptions = {
  priceScaleId: string;
  visible?: boolean;
  scaleMargins?: PriceScaleMargins;
  valueFormat?: YAxisValueFormat | VolumeValueFormat;
};

export type ChartPaneOptions = {
  paneId: string;
  heightWeight: number;
  minHeight?: number;
  priceScale: ChartPanePriceScaleOptions;
};

type AdditionalSeriesBase = {
  seriesId: string;
  paneId: string;
  priceScaleId: string;
  visible?: boolean;
};

export type AdditionalOhlcSeriesOptions = AdditionalSeriesBase &
  (
    | { type: 'candlestick' | 'hollowCandlestick' | 'bar' }
    | {
        type: 'line';
        source?: OhlcValueSource;
        gapThresholdMs?: number;
        appearance?: ChartLineAppearance;
      }
  );

export type HistogramSeriesOptions = AdditionalSeriesBase & {
  type: 'histogram';
  source?:
    | { type: 'ohlcvVolume'; seriesId: string }
    | { type: 'data' };
  appearance?: {
    color?: string;
    upColor?: string;
    downColor?: string;
  };
};

export type AdditionalChartSeriesOptions =
  | AdditionalOhlcSeriesOptions
  | HistogramSeriesOptions;

/**
 * Result of resolving an imperative addSeries() call: identifiers and the
 * source are normalized and `visible` defaults to true. Appearance colors
 * stay optional — when omitted, the native side falls back to the live chart
 * configuration (theme), exactly as if the field were absent.
 */
export type NormalizedAdditionalChartSeriesOptions =
  | (AdditionalOhlcSeriesOptions & { visible: boolean })
  | (Omit<HistogramSeriesOptions, 'visible' | 'source'> & {
      visible: boolean;
      source:
        | { type: 'ohlcvVolume'; seriesId: string }
        | { type: 'data' };
    });

export type ChartSeriesDataPoint = OhlcCandle | HistogramPoint;

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
  line?: ChartLineAppearance;
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

// Event payloads are declared once next to the Fabric codegen contract and
// re-exported here so both sides can never drift apart.
export type VisibleRangeChangeEvent = VisibleRangeChangeNativeEvent;

export type ScaleChangeEvent = ScaleChangeNativeEvent;

export type PaneResizeEvent = PaneResizeNativeEvent;

export type PriceScaleChangeEvent = PriceScaleChangeNativeEvent;

export type TradingChartsViewProps = ViewProps & {
  chartId: string;
  timeframeMs?: number;
  initialVisibleCount?: number;
  defaultScale?: number;
  series?: ChartSeriesOptions;
  panes?: ReadonlyArray<ChartPaneOptions>;
  additionalSeries?: ReadonlyArray<AdditionalChartSeriesOptions>;
  panesResizable?: boolean;
  theme?: ChartTheme;
  appearance?: ChartAppearance;
  formatters?: ChartFormatters;
  xAxis?: XAxisOptions;
  yAxis?: YAxisOptions;
  gestures?: GestureOptions;
  currentPrice?: CurrentPriceOptions;
  priceExtremes?: PriceExtremesOptions;
  crosshair?: CrosshairOptions;
  onVisibleRangeChange?: (event: VisibleRangeChangeEvent) => void;
  onScaleChange?: (event: ScaleChangeEvent) => void;
  onYAxisScaleChange?: (event: ScaleChangeEvent) => void;
  onPaneResize?: (event: PaneResizeEvent) => void;
  onPriceScaleChange?: (event: PriceScaleChangeEvent) => void;
  onSelectedCandleChange?: (candle: OhlcCandle | null) => void;
};

export type ResolvedChartConfig = {
  timeframeMs: number;
  initialVisibleCount: number;
  defaultScale: number;
  series:
    | { type: 'candlestick' | 'hollowCandlestick' | 'bar' }
    | {
        type: 'line';
        source: OhlcValueSource;
        gapThresholdMs?: number;
      };
  panes: ResolvedChartPaneOptions[];
  additionalSeries: ResolvedAdditionalChartSeriesOptions[];
  panesResizable: boolean;
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

export type ResolvedChartPaneOptions = {
  paneId: string;
  heightWeight: number;
  minHeight: number;
  priceScale: {
    priceScaleId: string;
    visible: boolean;
    scaleMargins: PriceScaleMargins;
    valueFormat: ResolvedYAxisValueFormat | Required<VolumeValueFormat>;
  };
};

export type ResolvedAdditionalChartSeriesOptions =
  | (AdditionalOhlcSeriesOptions & { visible: boolean })
  | (Omit<HistogramSeriesOptions, 'visible' | 'source' | 'appearance'> & {
      visible: boolean;
      source:
        | { type: 'ohlcvVolume'; seriesId: string }
        | { type: 'data' };
      appearance: {
        color: string;
        upColor: string;
        downColor: string;
      };
    });

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
  line: {
    width: number;
    color: string;
    gradient?: { topColor: string; bottomColor: string };
  };
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
