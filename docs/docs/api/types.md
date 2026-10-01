---
description: 'TypeScript declarations for chart data, configuration and event payloads.'
---

# Types

Use these TypeScript types when chart data and configuration live outside the JSX. For example, declaring a feed result as `OhlcCandle[]` helps catch missing fields, while `ChartPaneOptions[]` checks a reusable pane configuration.

Public types below can be imported from `react-native-trading-charts`. Shared helper definitions are included to make the declarations readable. They describe the accepted shapes; the linked guides explain defaults, runtime validation and examples. Import `ViewProps` from React Native if you need to refer to the standard view props directly. Internal resolved configuration types are not required to use the library.

```ts
import type {
  OhlcCandle,
  ChartPaneOptions,
  TradingChartsViewProps,
} from 'react-native-trading-charts';
```

## Data & selection

Use these shapes to describe the values you send and receive. The [data guide](/docs/data) covers history loading, timestamps and updates.

Selection items share these identity fields:

```ts
type CrosshairSeriesIdentity = Readonly<{
  seriesId: string;
  paneId: string;
  priceScaleId: string;
}>;
```

### OhlcCandle {#ohlccandle}

```ts
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
```

### TradeEvent {#tradeevent}

```ts
export type TradeEvent = {
  timestamp: number;
  price: number;
  size?: number;
};
```

### HistogramPoint {#histogrampoint}

```ts
export type HistogramPoint = {
  timestamp: number;
  value: number;
};
```

### ChartSeriesDataPoint {#chartseriesdatapoint}

```ts
export type ChartSeriesDataPoint = OhlcCandle | HistogramPoint;
```

### PriceLineOptions {#pricelineoptions}

```ts
export type PriceLineOptions = Readonly<{
  id: string;
  price: number;
  label: string;
  color: string;
}>;
```

### CrosshairSeriesValue {#crosshairseriesvalue}

```ts
export type CrosshairSeriesValue =
  | (CrosshairSeriesIdentity &
      Readonly<{
        kind: 'ohlc';
        seriesType: 'candlestick' | 'hollowCandlestick' | 'bar';
        candle: OhlcCandle | null;
      }>)
  | (CrosshairSeriesIdentity &
      Readonly<{
        kind: 'scalar';
        seriesType: 'line' | 'area' | 'histogram';
        sourceType:
          'data' | 'ohlcvVolume' | 'ohlcvRsi' | 'ohlcvSma' | 'ohlcvEma';
        value: number | null;
      }>)
  | (CrosshairSeriesIdentity &
      Readonly<{
        kind: 'macd';
        seriesType: 'macd';
        sourceType: 'ohlcvMacd';
        macd: number | null;
        signal: number | null;
        histogram: number | null;
      }>);
```

## Chart & series configuration

These options describe the view and its series. For sources, pane IDs and runtime setup, see [Additional series](/docs/additional-series).

The shared identity fields used by each additional-series variant are:

```ts
type AdditionalSeriesBase = {
  seriesId: string;
  paneId: string;
  priceScaleId: string;
  visible?: boolean;
};
```

### TradingChartsViewProps {#tradingchartsviewprops}

```ts
export type TradingChartsViewProps = ViewProps & {
  chartId: string;
  resolution?: ChartResolution;
  tradeAggregation?: TradeAggregationOptions;
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
  onYAxisPress?: (event: YAxisPressEvent) => void;
  onSelectedCandleChange?: (
    candle: OhlcCandle | null,
    seriesValues: ReadonlyArray<CrosshairSeriesValue>
  ) => void;
};
```

### ChartSeriesType {#chartseriestype}

```ts
export type ChartSeriesType =
  'candlestick' | 'hollowCandlestick' | 'bar' | 'line' | 'area';
```

### ChartSeriesOptions {#chartseriesoptions}

```ts
export type ChartSeriesOptions =
  | {
      type?: 'candlestick' | 'hollowCandlestick' | 'bar';
      source?: never;
      gapThresholdMs?: never;
    }
  | {
      type: 'line' | 'area';
      source?: OhlcValueSource;
      gapThresholdMs?: number;
    };
```

### OhlcValueSource {#ohlcvaluesource}

```ts
export type OhlcValueSource = 'open' | 'high' | 'low' | 'close';
```

### ChartPaneOptions {#chartpaneoptions}

```ts
export type ChartPaneOptions = {
  paneId: string;
  heightWeight: number;
  minHeight?: number;
  priceScale: ChartPanePriceScaleOptions;
};
```

### ChartPanePriceScaleOptions {#chartpanepricescaleoptions}

```ts
export type ChartPanePriceScaleOptions = {
  priceScaleId: string;
  visible?: boolean;
  scaleMargins?: PriceScaleMargins;
  valueFormat?: YAxisValueFormat | VolumeValueFormat;
};
```

### AdditionalChartSeriesOptions {#additionalchartseriesoptions}

```ts
export type AdditionalChartSeriesOptions =
  | AdditionalOhlcSeriesOptions
  | HistogramSeriesOptions
  | RsiSeriesOptions
  | MovingAverageSeriesOptions
  | MacdSeriesOptions;
```

### AdditionalOhlcSeriesOptions {#additionalohlcseriesoptions}

```ts
export type AdditionalOhlcSeriesOptions = AdditionalSeriesBase &
  (
    | { type: 'candlestick' | 'hollowCandlestick' | 'bar' }
    | {
        type: 'line';
        source?: OhlcValueSource;
        gapThresholdMs?: number;
        appearance?: ChartLineAppearance;
      }
    | {
        type: 'area';
        source?: OhlcValueSource;
        gapThresholdMs?: number;
        appearance?: ChartAreaAppearance;
      }
  );
```

### HistogramSeriesOptions {#histogramseriesoptions}

```ts
export type HistogramSeriesOptions = AdditionalSeriesBase & {
  type: 'histogram';
  source?: { type: 'ohlcvVolume'; seriesId: string } | { type: 'data' };
  appearance?: {
    color?: string;
    upColor?: string;
    downColor?: string;
  };
};
```

### MovingAverageSeriesOptions {#movingaverageseriesoptions}

```ts
export type MovingAverageSeriesOptions = AdditionalSeriesBase & {
  type: 'line';
  source: {
    type: 'ohlcvSma' | 'ohlcvEma';
    seriesId: string;
    period: number;
    valueSource?: OhlcValueSource;
  };
  gapThresholdMs?: number;
  appearance?: ChartLineAppearance;
};
```

### RsiSeriesOptions {#rsiseriesoptions}

```ts
export type RsiSeriesOptions = AdditionalSeriesBase & {
  type: 'line';
  source: {
    type: 'ohlcvRsi';
    seriesId: string;
    period?: number;
  };
  levels?: RsiLevels;
  gapThresholdMs?: number;
  appearance?: RsiSeriesAppearance;
};
```

### RsiLevels {#rsilevels}

```ts
export type RsiLevels = {
  oversold?: number;
  overbought?: number;
};
```

### MacdSeriesOptions {#macdseriesoptions}

```ts
export type MacdSeriesOptions = AdditionalSeriesBase & {
  type: 'macd';
  source: {
    type: 'ohlcvMacd';
    seriesId: string;
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
    valueSource?: OhlcValueSource;
  };
  gapThresholdMs?: number;
  appearance?: MacdSeriesAppearance;
};
```

### NormalizedAdditionalChartSeriesOptions {#normalizedadditionalchartseriesoptions}

Describes the normalized shape used by `addSeries`: visibility and source defaults are filled in; appearance remains optional so native rendering can follow the current theme. Callers pass `AdditionalChartSeriesOptions`.

```ts
export type NormalizedAdditionalChartSeriesOptions =
  | (AdditionalOhlcSeriesOptions & { visible: boolean })
  | (Omit<RsiSeriesOptions, 'visible' | 'source' | 'levels'> & {
      visible: boolean;
      source: {
        type: 'ohlcvRsi';
        seriesId: string;
        period: number;
      };
      levels: Required<RsiLevels>;
    })
  | (Omit<MovingAverageSeriesOptions, 'visible' | 'source'> & {
      visible: boolean;
      source: {
        type: 'ohlcvSma' | 'ohlcvEma';
        seriesId: string;
        period: number;
        valueSource: OhlcValueSource;
      };
    })
  | (Omit<MacdSeriesOptions, 'visible' | 'source'> & {
      visible: boolean;
      source: {
        type: 'ohlcvMacd';
        seriesId: string;
        fastPeriod: number;
        slowPeriod: number;
        signalPeriod: number;
        valueSource: OhlcValueSource;
      };
    })
  | (Omit<HistogramSeriesOptions, 'visible' | 'source'> & {
      visible: boolean;
      source: { type: 'ohlcvVolume'; seriesId: string } | { type: 'data' };
    });
```

## Time & aggregation

These types describe intervals and market sessions. [Time & trade aggregation](/docs/time-aggregation) explains how they group raw trades into candles.

### ResolutionUnit {#resolutionunit}

```ts
export type ResolutionUnit =
  'second' | 'minute' | 'hour' | 'day' | 'week' | 'month';
```

### ChartResolution {#chartresolution}

```ts
export type ChartResolution =
  | {
      unit: ResolutionUnit;
      multiplier?: number;
    }
  | {
      unit: 'fixed';
      durationMs: number;
    };
```

### TradeAggregationOptions {#tradeaggregationoptions}

```ts
export type TradeAggregationOptions = {
  bucketOrigin?: 'epoch' | 'session' | { timestamp: number };
  calendar?: TradingCalendar;
  outsideSession?: 'ignore' | 'reject';
  candleTimestamp?: 'bucketStart' | 'tradingDateUtc';
};
```

### TradingCalendar {#tradingcalendar}

```ts
export type TradingCalendar = {
  timeZone: string;
  sessions?: ReadonlyArray<TradingSession>;
  holidays?: ReadonlyArray<string>;
  overrides?: ReadonlyArray<TradingCalendarOverride>;
  weekStartsOn?: 'monday' | 'sunday';
};
```

### TradingCalendarOverride {#tradingcalendaroverride}

```ts
export type TradingCalendarOverride = {
  date: string;
  sessions: ReadonlyArray<TradingSessionSegment>;
};
```

### TradingSession {#tradingsession}

```ts
export type TradingSession = TradingSessionSegment & {
  days: ReadonlyArray<TradingWeekday>;
};
```

### TradingSessionSegment {#tradingsessionsegment}

```ts
export type TradingSessionSegment = {
  start: string;
  end: string;
  startDayOffset?: -1 | 0;
  endDayOffset?: 0 | 1;
};
```

### TradingWeekday {#tradingweekday}

```ts
export type TradingWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';
```

## Theme & appearance

Use these types for shared colors and styles on individual parts of the chart. See [Themes & appearance](/docs/styling) for the defaults and override rules.

### ChartTheme {#charttheme}

```ts
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
```

### ChartAppearance {#chartappearance}

```ts
export type ChartAppearance = {
  backgroundColor?: string;
  grid?: {
    color?: string;
    opacity?: number;
  };
  candles?: {
    upColor?: string;
    downColor?: string;
    radius?: number;
  };
  bars?: {
    upColor?: string;
    downColor?: string;
    lineWidth?: number;
  };
  line?: ChartLineAppearance;
  area?: ChartAreaAppearance;
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
  priceLines?: {
    label?: {
      border?: Pick<ChartBorderStyle, 'radius'>;
    };
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
```

### ChartLineStyle {#chartlinestyle}

```ts
export type ChartLineStyle = 'solid' | 'dashed';
```

### ChartLineAppearance {#chartlineappearance}

```ts
export type ChartLineAppearance = {
  width?: number;
  color?: string;
  style?: ChartLineStyle;
  gradient?: {
    topColor: string;
    bottomColor: string;
  };
};
```

### ChartAreaAppearance {#chartareaappearance}

```ts
export type ChartAreaAppearance = ChartLineAppearance & {
  fill?: {
    topColor?: string;
    bottomColor?: string;
  };
};
```

### ChartTextStyle {#charttextstyle}

```ts
export type ChartTextStyle = {
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: ChartFontWeight;
};
```

### ChartFontWeight {#chartfontweight}

```ts
export type ChartFontWeight = 'regular' | 'medium' | 'semibold' | 'bold';
```

### ChartBorderStyle {#chartborderstyle}

```ts
export type ChartBorderStyle = {
  color?: string;
  width?: number;
  radius?: number;
};
```

### ChartBadgeStyle {#chartbadgestyle}

```ts
export type ChartBadgeStyle = {
  backgroundColor?: string;
  text?: ChartTextStyle;
  border?: ChartBorderStyle;
};
```

### ChartDirectionalBadgeStyle {#chartdirectionalbadgestyle}

```ts
export type ChartDirectionalBadgeStyle = Omit<
  ChartBadgeStyle,
  'backgroundColor'
> & {
  upBackgroundColor?: string;
  downBackgroundColor?: string;
};
```

### RsiSeriesAppearance {#rsiseriesappearance}

```ts
export type RsiSeriesAppearance = ChartLineAppearance & {
  textColor?: string;
  levelLineColor?: string;
  bandColor?: string;
};
```

### MacdSeriesAppearance {#macdseriesappearance}

```ts
export type MacdSeriesAppearance = {
  macdLine?: ChartLineAppearance;
  signalLine?: ChartLineAppearance;
  histogram?: MacdHistogramAppearance;
  textColor?: string;
  zeroLineColor?: string;
};
```

### MacdHistogramAppearance {#macdhistogramappearance}

```ts
export type MacdHistogramAppearance = {
  positiveIncreasingColor?: string;
  positiveDecreasingColor?: string;
  negativeIncreasingColor?: string;
  negativeDecreasingColor?: string;
};
```

## Axes & formatting

These options control scales and label text. [Axes & formatting](/docs/axes) shows how to set precision and date formats for each label role.

### XAxisOptions {#xaxisoptions}

```ts
export type XAxisOptions = {
  visible?: boolean;
  height?: number;
  locale?: string;
  timeZone?: string;
  showSeconds?: boolean;
  spacing?: 'time' | 'logical';
};
```

### YAxisOptions {#yaxisoptions}

```ts
export type YAxisOptions = {
  visible?: boolean;
  width?: number;
  defaultScale?: number;
  scaleMargins?: PriceScaleMargins;
  valueFormat?: YAxisValueFormat;
};
```

### PriceScaleMargins {#pricescalemargins}

```ts
export type PriceScaleMargins = {
  top: number;
  bottom: number;
};
```

### YAxisValueFormat {#yaxisvalueformat}

```ts
export type YAxisValueFormat =
  PriceValueFormat | CompactValueFormat | SignificantValueFormat;
```

### PriceValueFormat {#pricevalueformat}

```ts
export type PriceValueFormat = {
  type: 'price';
  precision?: number;
  minMove?: number;
  locale?: string;
  currencySymbol?: string;
  useGrouping?: boolean;
};
```

### CompactValueFormat {#compactvalueformat}

```ts
export type CompactValueFormat = {
  type: 'compact';
  precision?: number;
  minMove?: number;
  locale?: string;
  currencySymbol?: string;
};
```

### SignificantValueFormat {#significantvalueformat}

```ts
export type SignificantValueFormat = {
  type: 'significant';
  significantDigits?: number;
  minMove?: number;
  locale?: string;
  currencySymbol?: string;
  useGrouping?: boolean;
};
```

### VolumeValueFormat {#volumevalueformat}

```ts
export type VolumeValueFormat = {
  type: 'volume';
  precision?: number;
  locale?: string;
  useGrouping?: boolean;
};
```

### PriceDisplayFormat {#pricedisplayformat}

```ts
export type PriceDisplayFormat =
  | Omit<PriceValueFormat, 'minMove'>
  | (Omit<CompactValueFormat, 'minMove'> & { useGrouping?: boolean })
  | Omit<SignificantValueFormat, 'minMove'>;
```

### ChartFormatters {#chartformatters}

```ts
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
```

### DatePatternFormat {#datepatternformat}

```ts
export type DatePatternFormat = {
  pattern: string;
  locale?: string;
  timeZone?: string;
};
```

### XAxisDateFormats {#xaxisdateformats}

```ts
export type XAxisDateFormats = {
  locale?: string;
  timeZone?: string;
  seconds?: string;
  time?: string;
  day?: string;
  month?: string;
  year?: string;
};
```

## Interaction & overlays

These types configure gestures and the labels drawn over price data. See [Crosshair & tooltips](/docs/crosshair) for selection behavior.

### GestureOptions {#gestureoptions}

```ts
export type GestureOptions = {
  pan?: boolean;
  zoom?: boolean;
  yAxisScale?: boolean;
};
```

### CrosshairOptions {#crosshairoptions}

```ts
export type CrosshairOptions = {
  enabled?: boolean;
  showTooltip?: boolean;
  showTooltipHeader?: boolean;
  tooltipBackgroundOpacity?: number;
  lineStyle?: CrosshairLineStyle;
  tooltipFields?: ReadonlyArray<CrosshairTooltipField>;
  tooltipLabels?: CrosshairTooltipLabels;
};
```

### CrosshairLineStyle {#crosshairlinestyle}

```ts
export type CrosshairLineStyle = ChartLineStyle;
```

### CrosshairTooltipField {#crosshairtooltipfield}

```ts
export type CrosshairTooltipField =
  | 'open'
  | 'close'
  | 'high'
  | 'low'
  | 'amplitude'
  | 'changePercent'
  | 'change'
  | 'volume';
```

### CrosshairTooltipLabels {#crosshairtooltiplabels}

```ts
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
```

### CurrentPriceOptions {#currentpriceoptions}

```ts
export type CurrentPriceOptions = {
  visible?: boolean;
  showLabel?: boolean;
  pinToEdge?: boolean;
};
```

### PriceExtremesOptions {#priceextremesoptions}

```ts
export type PriceExtremesOptions = {
  visible?: boolean;
};
```

## Events

Use these payloads in view callbacks. The [event reference](/docs/api/events) explains when each callback runs.

### VisibleRangeChangeEvent {#visiblerangechangeevent}

```ts
export type VisibleRangeChangeEvent = Readonly<{
  from: number;
  to: number;
  firstVisibleIndex: number;
  lastVisibleIndex: number;
  totalCount: number;
  atStart: boolean;
  atEnd: boolean;
}>;
```

### ScaleChangeEvent {#scalechangeevent}

```ts
export type ScaleChangeEvent = Readonly<{
  scale: number;
}>;
```

### PaneResizeEvent {#paneresizeevent}

```ts
export type PaneResizeEvent = Readonly<{
  firstPaneId: string;
  firstHeightWeight: number;
  secondPaneId: string;
  secondHeightWeight: number;
  finished: boolean;
}>;
```

### PriceScaleChangeEvent {#pricescalechangeevent}

```ts
export type PriceScaleChangeEvent = Readonly<{
  paneId: string;
  priceScaleId: string;
  scale: number;
}>;
```

### YAxisPressEvent {#yaxispressevent}

```ts
export type YAxisPressEvent = Readonly<{
  x: number;
  y: number;
  price: number;
  paneId: string;
  priceScaleId: string;
}>;
```

## Trade batching

The batcher accepts an interval and returns methods for managing queued trades. See [Trade batcher](/docs/api/trade-batcher) for validation and teardown.

### TradeBatcherOptions {#tradebatcheroptions}

```ts
export type TradeBatcherOptions = {
  /** Flush interval in milliseconds. Defaults to 32. */
  intervalMs?: number;
};
```

### TradeBatcher {#tradebatcher}

```ts
export type TradeBatcher = {
  /**
   * Queue one trade. Validates synchronously, so invalid or out-of-order
   * input throws in the caller's stack instead of inside the flush timer.
   */
  add(trade: TradeEvent): void;
  /** Send everything queued so far. */
  flush(): void;
  /** Permanently stop the batcher, drop queued trades, and cancel its timer. */
  dispose(): void;
};
```
