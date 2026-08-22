# react-native-trading-charts

`react-native-trading-charts` is a high-speed, resource-efficient React Native
library for rendering live and historical trading data from traditional and
crypto markets. React owns configuration and data delivery; native code owns
chart state, gestures, geometry, and rendering.

The library uses a shared C++ chart and geometry engine, Metal on iOS, and
OpenGL ES 3 on Android. Frames are rendered on demand, immutable snapshots are
reused between updates, and high-frequency trade streams can be batched before
they cross the native boundary.

## Why Native Trading Charts?

React Native trading charts are commonly built with either a WebView or a
general-purpose 2D engine such as Skia. Both are useful tools, but each carries
costs that are unnecessary for a purpose-built OHLC renderer.

A WebView embeds a browser runtime and its view lifecycle. Chart updates pass
through an additional execution context, while the browser still handles the
JavaScript, DOM, CSS, layout, and rendering pipeline required by the charting
application. That flexibility is valuable for reusing web charts, but it makes
native performance and resource usage harder to control.

Skia provides an extensive cross-platform 2D graphics API. Trading charts need
only a small subset of that functionality, while the application still carries
the runtime and memory cost of a general-purpose graphics engine.

`react-native-trading-charts` takes a narrower approach: trading semantics and
geometry live in a small shared C++ engine, while each platform uses its native
GPU API and native text stack. The result is designed specifically for dense,
frequently updated market data without introducing a browser or a third-party
2D rendering runtime.

## Key Features

- **Zero third-party runtime dependencies beyond React Native.** React and
  React Native are peer dependencies; the package does not add a browser,
  graphics framework, or utility runtime.
- **Shared C++ engine and geometry.** Candle storage, raw-trade aggregation,
  viewport behavior, autoscale, ticks, selection, and tessellation are shared
  by iOS and Android.
- **Native GPU rendering.** Metal renders on iOS and OpenGL ES 3 renders on
  Android.
- **Resource-efficient frames.** Rendering is on demand, unchanged snapshots
  are cached, and content geometry is reused for crosshair-only updates.
- **Multiple display types.** Candlestick, hollow candlestick, OHLC bar, line,
  area, and histogram series are supported.
- **Multiple panes and series.** Add independently scaled panes, derived volume
  and RSI, comparison series, and custom histogram data.
- **Detailed presentation control.** Configure themes, role-specific styles,
  native number/date formatting, axes, badges, and tooltips.
- **Streaming-ready data APIs.** Send completed candles, raw trades, batches,
  or use the built-in trade batcher to reduce native calls.
- **Native interaction.** Pan, pinch zoom, Y-axis scaling, momentum, crosshair,
  current-price overlays, and visible extrema are handled natively.

## Installation

> **TODO:** npm installation commands will be added here.

## Table of Contents

- [Quick Start](#quick-start)
- [Data and Streaming](#data-and-streaming)
- [Series Types](#series-types)
  - [Candlestick](#candlestick)
  - [Hollow Candlestick](#hollow-candlestick)
  - [OHLC Bar](#ohlc-bar)
  - [Line](#line)
  - [Area](#area)
  - [Histogram](#histogram)
- [Styling and Theming](#styling-and-theming)
- [Multiple Panes and Additional Series](#multiple-panes-and-additional-series)
- [Time, Resolution, and Trade Aggregation](#time-resolution-and-trade-aggregation)
- [Axes and Value Formatting](#axes-and-value-formatting)
- [Gestures and Viewport](#gestures-and-viewport)
- [Crosshair and Price Overlays](#crosshair-and-price-overlays)
- [Events](#events)
- [Imperative API](#imperative-api)
- [Architecture and Performance](#architecture-and-performance)
- [Platform Support and Limitations](#platform-support-and-limitations)
- [Contributing](#contributing)
- [License](#license)

## Quick Start

Create a view with a stable `chartId`, then send data to that ID through
`TradingCharts`:

```tsx
import {
  TradingCharts,
  TradingChartsView,
  type OhlcCandle,
} from 'react-native-trading-charts';

const history: OhlcCandle[] = [
  {
    timestamp: 1_720_000_000_000,
    open: 64_610,
    high: 64_680,
    low: 64_590,
    close: 64_633,
    volume: 12.5,
  },
];

export function BtcChart() {
  return (
    <TradingChartsView
      style={{ flex: 1 }}
      chartId="btc-1m"
      resolution={{ unit: 'minute' }}
      series={{ type: 'candlestick' }}
    />
  );
}

TradingCharts.setHistory('btc-1m', history);

TradingCharts.updateCandle('btc-1m', {
  timestamp: 1_720_000_060_000,
  open: 64_633,
  high: 64_650,
  low: 64_620,
  close: 64_642,
  volume: 3.1,
});
```

`chartId` must be unique and stable while the view is mounted. Write commands
sent before mount are retained by the native registry and replayed when the
matching chart registers. Reads are not queued.

The library does not open a WebSocket or make network requests. The consuming
application owns subscriptions, authentication, reconnect logic, parsing, and
delivery of market data.

### `TradingChartsView` props

The component also accepts standard React Native `ViewProps`, including
`style` and accessibility props.

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `chartId` | `string` | Required | Unique, non-empty ID used by the imperative API and native registry. |
| `resolution` | `ChartResolution` | `{ unit: 'minute', multiplier: 1 }` | Raw-trade aggregation interval. |
| `tradeAggregation` | `TradeAggregationOptions` | Epoch-aligned, ignore out-of-session trades | Calendar and bucket behavior for raw trades. |
| `initialVisibleCount` | Positive integer | `100` | Number of candles targeted by the initial viewport. |
| `defaultScale` | Positive number | `1` | Initial horizontal zoom applied after `initialVisibleCount`. |
| `series` | `ChartSeriesOptions` | `{ type: 'candlestick' }` | Main-series display type and value source. |
| `panes` | `ChartPaneOptions[]` | One `main` pane | Pane layout and pane price scales. |
| `additionalSeries` | `AdditionalChartSeriesOptions[]` | `[]` | Series rendered in addition to the reserved `main` series. |
| `panesResizable` | `boolean` | `true` when multiple panes exist | Enables dragging pane separators. |
| `theme` | `ChartTheme` | Dark theme | High-level color tokens. |
| `appearance` | `ChartAppearance` | Derived from `theme` | Role-specific native presentation. |
| `formatters` | `ChartFormatters` | Derived from axis options | Role-specific date and price formats. |
| `xAxis` | `XAxisOptions` | Visible, time spacing, UTC | Time-axis behavior and dimensions. |
| `yAxis` | `YAxisOptions` | Visible on the right | Main price-axis behavior and formatting. |
| `gestures` | `GestureOptions` | All enabled | Native pan, horizontal zoom, and Y-scale gestures. |
| `currentPrice` | `CurrentPriceOptions` | Visible with edge-pinned label | Latest-price line and badge behavior. |
| `priceExtremes` | `PriceExtremesOptions` | Visible | Visible high/low labels. |
| `crosshair` | `CrosshairOptions` | Enabled with tooltip | Crosshair interaction and tooltip behavior. |
| `onVisibleRangeChange` | `(event) => void` | `undefined` | Receives visible candle range changes. |
| `onScaleChange` | `(event) => void` | `undefined` | Receives user-driven horizontal scale changes. |
| `onYAxisScaleChange` | `(event) => void` | `undefined` | Receives user-driven main Y-scale changes. |
| `onPaneResize` | `(event) => void` | `undefined` | Receives interactive pane size changes. |
| `onPriceScaleChange` | `(event) => void` | `undefined` | Receives per-pane price-scale changes. |
| `onSelectedCandleChange` | `(candle: OhlcCandle \| null) => void` | `undefined` | Receives crosshair selection changes. |

## Data and Streaming

The native engine stores OHLCV candles. You can provide ready candles from an
exchange, aggregate raw trades in native code, or feed standalone data to an
additional histogram series.

### Data shapes

#### `OhlcCandle`

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `timestamp` | Non-negative safe-integer milliseconds | Required | Candle timestamp. History must be strictly increasing. |
| `open` | Finite number | Required | Opening price. |
| `high` | Finite number | Required | Highest price. |
| `low` | Finite number | Required | Lowest price. |
| `close` | Finite number | Required | Closing price. |
| `volume` | Finite number | `0` | Traded volume. Native storage cannot distinguish omitted volume from zero. |

#### `TradeEvent`

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `timestamp` | Non-negative safe-integer milliseconds | Required | Trade time; batches must be non-decreasing. |
| `price` | Finite number | Required | Executed trade price. |
| `size` | Finite number | `0` | Executed size added to candle volume. |

#### `HistogramPoint`

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `timestamp` | Non-negative safe-integer milliseconds | Required | Bar timestamp; arrays must be strictly increasing. |
| `value` | Finite number | Required | Positive or negative histogram value. |

### Loading and updating data

| Method | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `setHistory` | `chartId, OhlcCandle[]` | `void` | Replaces main history and restores configured initial scales. |
| `prependHistory` | `chartId, OhlcCandle[]` | `void` | Prepends older, strictly ordered main history. |
| `updateCandle` | `chartId, OhlcCandle` | `void` | Replaces the last candle at the same timestamp or appends a newer candle. |
| `updateTrade` | `chartId, TradeEvent` | `void` | Aggregates one raw trade using the configured resolution. |
| `updateTrades` | `chartId, TradeEvent[]` | `void` | Aggregates a non-decreasing batch in one native call. |
| `setSeriesData` | `chartId, seriesId, points[]` | `void` | Replaces an additional series data set. |
| `prependSeriesData` | `chartId, seriesId, points[]` | `void` | Prepends older additional-series data. |
| `updateSeriesData` | `chartId, seriesId, point` | `void` | Replaces the last point or appends a newer one. |

Ready candles keep their feed-provided timestamps; they are not forced onto raw
trade buckets. `setHistory` and `prependHistory` require strictly increasing
timestamps. Trade batches allow equal timestamps but not decreasing ones.
Empty raw-trade buckets are not synthesized, and trades older than the current
native aggregate are ignored.

### High-frequency trade batching

For feeds that deliver one trade per message, `createTradeBatcher` reduces
JS-to-native calls by forwarding one batch per interval:

```tsx
import { createTradeBatcher } from 'react-native-trading-charts';

const batcher = createTradeBatcher('btc-1m', { intervalMs: 32 });

ws.onmessage = (message) => {
  batcher.add(parseTrade(message.data));
};

// Flush before a controlled transition, then dispose on teardown.
batcher.flush();
batcher.dispose();
```

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `intervalMs` | Integer from `1` to `2_147_483_647` | `32` | Maximum delay before queued trades are forwarded. |

| Batcher method | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `add` | `TradeEvent` | `void` | Validates and queues one non-decreasing trade. |
| `flush` | None | `void` | Immediately sends the queued batch. |
| `dispose` | None | `void` | Cancels the timer, drops queued trades, and permanently stops the batcher. |

## Series Types

The main `series` changes how the same OHLCV store is rendered. It does not
change the data shape returned by `getCandles` or selected by the crosshair.

### Candlestick

```tsx
<TradingChartsView
  chartId="btc-1m"
  series={{ type: 'candlestick' }}
  appearance={{
    candles: { upColor: '#00A88F', downColor: '#FF334F', radius: 3 },
  }}
/>
```

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `series.type` | `'candlestick'` | `'candlestick'` | Filled OHLC candle bodies with high/low wicks. |
| `appearance.candles.upColor` | `#RRGGBB` or `#RRGGBBAA` | `theme.upColor` | Color used when `close >= open`. |
| `appearance.candles.downColor` | `#RRGGBB` or `#RRGGBBAA` | `theme.downColor` | Color used when `close < open`. |
| `appearance.candles.radius` | Non-negative number | `0` | Body corner radius in iOS points or Android density-independent units. Wicks remain square. |

### Hollow Candlestick

```tsx
<TradingChartsView
  chartId="btc-1m"
  series={{ type: 'hollowCandlestick' }}
  appearance={{ candles: { upColor: '#00A88F', downColor: '#FF334F' } }}
/>
```

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `series.type` | `'hollowCandlestick'` | — | Uses outlined rising bodies and filled falling bodies. |
| `appearance.candles.upColor` | `#RRGGBB` or `#RRGGBBAA` | `theme.upColor` | Rising outline and wick color. |
| `appearance.candles.downColor` | `#RRGGBB` or `#RRGGBBAA` | `theme.downColor` | Falling body and wick color. |
| `appearance.candles.radius` | Non-negative number | `0` | Corner radius for outlined rising and filled falling bodies. |

The hollow outline uses the same native thickness as the wick.

### OHLC Bar

```tsx
<TradingChartsView
  chartId="btc-1m"
  series={{ type: 'bar' }}
  appearance={{ bars: { upColor: '#00A88F', downColor: '#FF334F', lineWidth: 1 } }}
/>
```

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `series.type` | `'bar'` | — | Draws a high-low stem, left open tick, and right close tick. |
| `appearance.bars.upColor` | Color | `appearance.candles.upColor` | Rising bar color. |
| `appearance.bars.downColor` | Color | `appearance.candles.downColor` | Falling bar color. |
| `appearance.bars.lineWidth` | Positive number | `1` | Width in iOS points or Android density-independent units. |

### Line

```tsx
<TradingChartsView
  chartId="btc-1m"
  series={{ type: 'line', source: 'close', gapThresholdMs: 300_000 }}
  appearance={{ line: { width: 2, color: '#2E90F5' } }}
/>
```

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `series.type` | `'line'` | — | Renders one OHLC field as a tessellated line. |
| `series.source` | `'open'`, `'high'`, `'low'`, `'close'` | `'close'` | Value used for geometry, autoscale, extrema, and current price. |
| `series.gapThresholdMs` | Positive milliseconds | `undefined` | Splits the line when a timestamp gap exceeds this value. |
| `appearance.line.width` | Positive number | `1.5` | Native stroke width. |
| `appearance.line.color` | Color | `theme.upColor` | Solid line color and fallback active-series color. |
| `appearance.line.gradient.topColor` | Color | `undefined` | Top color of an optional vertical stroke gradient. |
| `appearance.line.gradient.bottomColor` | Color | `undefined` | Bottom color of an optional vertical stroke gradient. |

### Area

```tsx
<TradingChartsView
  chartId="btc-1m"
  series={{ type: 'area', source: 'close' }}
  appearance={{
    area: {
      width: 2,
      color: '#2E90F5',
      fill: { topColor: '#2E90F566', bottomColor: '#2E90F500' },
    },
  }}
/>
```

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `series.type` | `'area'` | — | Renders an OHLC source line with a pane-wide fill. |
| `series.source` | `'open'`, `'high'`, `'low'`, `'close'` | `'close'` | Value used by the series. |
| `series.gapThresholdMs` | Positive milliseconds | `undefined` | Splits line and fill across larger gaps. |
| `appearance.area.width` | Positive number | `1.5` | Outline width. |
| `appearance.area.color` | Color | `theme.upColor` | Outline color and base color for default fill. |
| `appearance.area.gradient` | `{ topColor, bottomColor }` | `undefined` | Optional vertical gradient for the outline. |
| `appearance.area.fill.topColor` | Color | Area color with `0x40` alpha | Fill color at the pane top. |
| `appearance.area.fill.bottomColor` | Color | Area color with `0x00` alpha | Fill color at the pane bottom. |

### Histogram

Histogram is available as an additional series, not as the reserved main
series. It can derive volume without copying it into a second JS data set or
receive standalone `HistogramPoint` values.

```tsx
<TradingChartsView
  chartId="btc-1m"
  panes={panes}
  additionalSeries={[
    {
      seriesId: 'volume',
      type: 'histogram',
      paneId: 'volume',
      priceScaleId: 'volume',
      source: { type: 'ohlcvVolume', seriesId: 'main' },
      appearance: { upColor: '#38D98A80', downColor: '#FF3B6480' },
    },
  ]}
/>
```

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `type` | `'histogram'` | Required | Selects histogram geometry. |
| `source` | `{ type: 'data' }` or `{ type: 'ohlcvVolume', seriesId }` | `{ type: 'data' }` | Uses standalone points or derives volume from an OHLC series. |
| `appearance.color` | Color | `theme.axisTextColor` | Color for standalone positive/negative values when directional colors are not selected by derived OHLC volume. |
| `appearance.upColor` | Color | `theme.upColor` | Derived-volume color when source candle closes up. |
| `appearance.downColor` | Color | `theme.downColor` | Derived-volume color when source candle closes down. |

## Styling and Theming

`theme` provides a compact set of color tokens. `appearance` targets individual
roles and takes precedence over the corresponding theme value. Colors accept
`#RRGGBB` or `#RRGGBBAA`.

### Theme

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `backgroundColor` | Color | `#100C18` | Chart background. |
| `gridColor` | Color | `#292431` | Grid fallback. |
| `axisTextColor` | Color | `#9791A5` | Axis, extrema, and some additional-series fallback text/color. |
| `upColor` | Color | `#38D98A` | Rising-series fallback. |
| `downColor` | Color | `#FF3B64` | Falling-series fallback. |
| `crosshairColor` | Color | `#A8A2B3` | Crosshair line and badge fallback. |
| `tooltipBackgroundColor` | Color | `#1B1723` | Tooltip background fallback. |
| `tooltipTextColor` | Color | `#F5F2FA` | Tooltip text fallback. |

### Appearance groups

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `backgroundColor` | Color | `theme.backgroundColor` | Role-specific background override. |
| `grid.color` | Color | `theme.gridColor` | Grid color. |
| `grid.opacity` | Number from `0` to `1` | `0.75` | Grid alpha multiplier. |
| `candles.upColor` / `downColor` | Color | Theme direction colors | Candlestick colors and bar fallbacks. |
| `candles.radius` | Non-negative number | `0` | Candlestick body corner radius. |
| `bars.*` | Bar appearance | Candle colors, width `1` | OHLC bar presentation. |
| `line.*` | Line appearance | Theme up color, width `1.5` | Main line presentation. |
| `area.*` | Area appearance | Theme up color, width `1.5` | Main area outline and fill. |
| `xAxis.text` / `yAxis.text` | `ChartTextStyle` | `theme.axisTextColor` | Native axis text styles. |
| `priceExtremes.*` | Text and colors | Axis/background colors | Visible high/low label presentation. |
| `currentPrice.*` | Line and directional badge | Active-series colors | Latest-price presentation. |
| `crosshair.*` | Line and badges | `theme.crosshairColor` | Selection line and axis badges. |
| `tooltip.*` | Text, colors, opacity, border | Tooltip theme colors | OHLCV tooltip presentation. |

#### Text, badge, and border properties

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `text.color` | Color | Role fallback | Text color. |
| `text.fontFamily` | Non-empty string | Platform monospace | Font already bundled by the consuming application. |
| `text.fontSize` | Positive number | Native role default | Points on iOS and scaled pixels on Android. |
| `text.fontWeight` | `'regular'`, `'medium'`, `'semibold'`, `'bold'` | Native role default | Requested font weight. |
| `badge.backgroundColor` | Color | Role fallback | Non-directional badge background. |
| `badge.upBackgroundColor` | Color | Active up color | Current-price badge background for rising candles. |
| `badge.downBackgroundColor` | Color | Active down color | Current-price badge background for falling candles. |
| `badge.text` | `ChartTextStyle` | Role fallback | Badge text style. |
| `badge.border` | `ChartBorderStyle` | Transparent, width `0` | Badge border. |
| `border.color` | Color | `#00000000` | Border color. |
| `border.width` | Non-negative number | `0` | Border width. |
| `border.radius` | Non-negative number | `4` for badges, `8` for tooltip | Corner radius. |

#### Overlay appearance properties

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `priceExtremes.text` | `ChartTextStyle` | Axis text style | High/low text. |
| `priceExtremes.connectorColor` | Color | Axis text color | Connector line. |
| `priceExtremes.backgroundColor` | Color | Chart background | Label backing color. |
| `currentPrice.line.upColor` / `downColor` | Color | Active-series colors | Current-price line colors. |
| `currentPrice.label` | `ChartDirectionalBadgeStyle` | Active-series backgrounds | Current-price badge. |
| `crosshair.line.color` | Color | `theme.crosshairColor` | Crosshair line color. |
| `crosshair.line.opacity` | Number from `0` to `1` | `0.85` | Crosshair line opacity. |
| `crosshair.priceLabel` / `timeLabel` | `ChartBadgeStyle` | Crosshair-colored background | Crosshair axis badges. |
| `tooltip.backgroundColor` | Color | `theme.tooltipBackgroundColor` | Tooltip panel color. |
| `tooltip.backgroundOpacity` | Number from `0` to `1` | `crosshair.tooltipBackgroundOpacity` | Tooltip panel opacity. |
| `tooltip.headerText` / `labelText` / `valueText` | `ChartTextStyle` | `theme.tooltipTextColor` | Tooltip typography. |
| `tooltip.positiveValueColor` / `negativeValueColor` | Color | Active-series colors | Directional value colors. |
| `tooltip.border` | `ChartBorderStyle` | Transparent, width `0`, radius `8` | Tooltip border. |

Axis regions do not automatically grow for larger fonts. Increase
`xAxis.height` or `yAxis.width` when a custom style needs more space.

## Multiple Panes and Additional Series

All panes share the main time viewport and keep independent autoscale ranges.
When `panes` is supplied, it must include the reserved `main` pane with the
reserved `main` price scale. One visible price scale is supported per pane.

```tsx
const panes = [
  {
    paneId: 'main',
    heightWeight: 3,
    priceScale: { priceScaleId: 'main' },
  },
  {
    paneId: 'volume',
    heightWeight: 1,
    minHeight: 56,
    priceScale: {
      priceScaleId: 'volume',
      valueFormat: { type: 'volume', precision: 1 },
    },
  },
];

<TradingChartsView
  chartId="btc-1m"
  panes={panes}
  panesResizable
  additionalSeries={[
    {
      seriesId: 'volume',
      type: 'histogram',
      paneId: 'volume',
      priceScaleId: 'volume',
      source: { type: 'ohlcvVolume', seriesId: 'main' },
    },
  ]}
/>
```

### Pane properties

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `paneId` | Unique non-empty string | Required | Pane identifier; `main` is reserved for the primary pane. |
| `heightWeight` | Positive number | Required | Relative height compared with other panes. |
| `minHeight` | Positive number | `48` | Minimum height in native view units. |
| `priceScale.priceScaleId` | Unique non-empty string | Required | Scale ID; the main pane must use `main`. |
| `priceScale.visible` | `boolean` | `true` | Shows the pane price scale. |
| `priceScale.scaleMargins` | `{ top, bottom }` | Main: `{ 0.2, 0.1 }`; others: `{ 0.1, 0 }` | Pane-specific autoscale margins. |
| `priceScale.valueFormat` | Price, compact, significant, or volume format | Main Y format | Pane scale number format. |

### Additional-series properties

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `seriesId` | Unique non-empty string except `main` | Required | Runtime/declarative series identifier. |
| `paneId` | Existing pane ID | Required | Target pane. |
| `priceScaleId` | Target pane's scale ID | Required | Must match the pane price scale. |
| `visible` | `boolean` | `true` | Controls rendering without removing the series. |
| `type` | `'candlestick'`, `'hollowCandlestick'`, `'bar'`, `'line'`, `'area'`, `'histogram'` | Required | Series geometry. |
| `source` | OHLC field or histogram source | Type-specific | Line/area value field or histogram data source. |
| `gapThresholdMs` | Positive milliseconds | `undefined` | Optional line/area gap splitting. |
| `appearance` | Type-specific style | Theme fallback | Optional line, area, or histogram style. |

Derived volume follows its OHLC source automatically when history, candle, or
trade updates arrive. Standalone series use `setSeriesData`,
`prependSeriesData`, and `updateSeriesData`.

### Relative Strength Index (RSI)

RSI is a derived line series calculated by the shared native engine. It uses
Wilder smoothing over candle closes, follows history and live candle/trade
updates automatically, and must target a pane separate from `main`.

```tsx
const panes = [
  {
    paneId: 'main',
    heightWeight: 3,
    priceScale: { priceScaleId: 'main' },
  },
  {
    paneId: 'rsi',
    heightWeight: 1,
    minHeight: 96,
    priceScale: {
      priceScaleId: 'rsi',
      valueFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
        useGrouping: false,
      },
    },
  },
];

<TradingChartsView
  chartId="btc-1m"
  panes={panes}
  additionalSeries={[
    {
      seriesId: 'rsi',
      type: 'line',
      paneId: 'rsi',
      priceScaleId: 'rsi',
      source: { type: 'ohlcvRsi', seriesId: 'main', period: 14 },
      levels: { oversold: 30, overbought: 70 },
      appearance: {
        width: 1.5,
        color: '#6C8CFF',
        textColor: '#6C8CFF',
        levelLineColor: '#6C8CFF80',
        bandColor: '#6C8CFF14',
      },
    },
  ]}
/>;
```

`period` defaults to `14`; oversold/overbought default to `30/70`. The first
value is available after `period + 1` candles. An RSI pane is fixed to the
`0–100` domain and ignores vertical scale gestures. Its native header shows the
RSI value under the crosshair, or the latest value when the crosshair is not
active; warm-up and unmatched timestamps display `—`. Multiple RSI series may
share a pane, with one header row per visible series. Derived-to-derived source
chains are intentionally rejected.

RSI appearance accepts `width` and `color` for the curve, `textColor` for the
entire native `RSI <period> <value>` legend, `levelLineColor` for the dashed
oversold/overbought levels, and `bandColor` for the area between those levels.
When `textColor` is omitted, the legend keeps the backwards-compatible style:
the title uses the Y-axis text color and the value uses the RSI curve color.

## Time, Resolution, and Trade Aggregation

All timestamps are milliseconds. `resolution` defines how raw trades become
candles; ready OHLC candles retain the timestamps supplied by the feed.

### Resolution

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `unit` | `'second'`, `'minute'`, `'hour'`, `'day'`, `'week'`, `'month'` | `'minute'` | Calendar-aware resolution unit. |
| `multiplier` | Positive integer | `1` | Number of units in one bucket. |
| `unit` | `'fixed'` | — | Selects an exact elapsed duration. |
| `durationMs` | Positive safe integer | Required for `'fixed'` | Exact fixed bucket duration. |

Daily, weekly, and monthly resolutions follow calendar boundaries; a month is
not treated as 30 days. Fixed resolutions never acquire calendar-duration
semantics.

### Aggregation properties

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `bucketOrigin` | `'epoch'`, `'session'`, `{ timestamp }` | `'epoch'` | Aligns intraday or fixed buckets. |
| `calendar` | `TradingCalendar` | `undefined` | Defines market sessions and trading dates. |
| `outsideSession` | `'ignore'`, `'reject'` | `'ignore'` | Ignores off-session trades or reports invalid input. |
| `candleTimestamp` | `'bucketStart'`, `'tradingDateUtc'` | `'bucketStart'` | Timestamp convention; trading-date UTC is for day/week/month only. |

### Calendar properties

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `timeZone` | IANA time-zone string | Required | Controls session/calendar boundaries, including DST. |
| `sessions` | `TradingSession[]` | `[]` | Recurring weekly trading sessions. |
| `holidays` | `YYYY-MM-DD[]` | `[]` | Fully closed trading dates. |
| `overrides` | `TradingCalendarOverride[]` | `[]` | Date-specific hours; an empty session list closes the date. |
| `weekStartsOn` | `'monday'`, `'sunday'` | `'monday'` | Weekly bucket boundary. |

| Session property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `days` | Weekday names | Required for recurring sessions | Days on which the segment opens. |
| `start` / `end` | `HH:mm` or `HH:mm:ss` | Required | Local session times; end is exclusive. |
| `startDayOffset` | `-1` or `0` | `0` | Moves the start to the prior trading-date day. |
| `endDayOffset` | `0` or `1` | Inferred for overnight sessions | Moves the end to the following day. |

Crypto markets typically need only an epoch-aligned resolution:

```tsx
resolution={{ unit: 'minute' }}
```

Traditional market sessions can anchor intraday buckets to each open:

```tsx
<TradingChartsView
  chartId="aapl-1h"
  resolution={{ unit: 'hour' }}
  tradeAggregation={{
    bucketOrigin: 'session',
    calendar: {
      timeZone: 'America/New_York',
      sessions: [
        {
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          start: '09:30',
          end: '16:00',
        },
      ],
      holidays: ['2026-12-25'],
      overrides: [
        { date: '2026-11-27', sessions: [{ start: '09:30', end: '13:00' }] },
      ],
    },
  }}
/>
```

Use an exact interval when no calendar unit represents the feed:

```tsx
resolution={{ unit: 'fixed', durationMs: 250 }}
```

`calendar.timeZone` affects aggregation boundaries. `xAxis.timeZone` affects
labels only and can be configured independently.

## Axes and Value Formatting

### X axis

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `visible` | `boolean` | `true` | Shows the time axis. |
| `height` | Positive number | `26` | Axis height in native view units. |
| `locale` | Locale string | `'en-GB'` | Legacy/default date locale. |
| `timeZone` | IANA time-zone string | `'UTC'` | Legacy/default label time zone. |
| `showSeconds` | `boolean` | `false` | Enables second-level axis labels. |
| `spacing` | `'time'`, `'logical'` | `'time'` | Uses elapsed milliseconds or uniform candle-index slots. |

### Y axis

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `visible` | `boolean` | `true` | Shows the main price axis. |
| `position` | `'left'`, `'right'` | `'right'` | Places the main price axis. |
| `width` | Positive number | `64` | Axis width in native view units. |
| `defaultScale` | Number from `0.1` to `10` | `1` | Baseline vertical scale restored by history loads and `fitContent`. |
| `scaleMargins.top` | Non-negative fraction | `0.2` | Reserved space above visible values. |
| `scaleMargins.bottom` | Non-negative fraction | `0.1` | Reserved space below visible values. |
| `valueFormat` | `YAxisValueFormat` | Price format | Legacy/main Y-axis formatter; `formatters.price.yAxis` wins. |

Scale margins must sum to less than `1`. When visible values are equal,
autoscale expands the range using `minMove`.

### Price formats

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `type` | `'price'` | `'price'` | Fixed decimal formatting. |
| `precision` | Integer `0...12` | `2` | Decimal precision. |
| `type` | `'compact'` | — | Compact suffix formatting for large values. |
| `precision` | Integer `0...8` | `2` | Compact precision. |
| `type` | `'significant'` | — | Significant digits with compact crypto zero-count notation. |
| `significantDigits` | Integer `1...8` | `3` | Significant digits to display. |
| `minMove` | Positive number | `0.01` | Real instrument tick size; omitted from display-only formats. |
| `locale` | Locale string | `'en-GB'` | Native number locale. |
| `currencySymbol` | `string` | `''` | Prefix displayed with prices. |
| `useGrouping` | `boolean` | `true` | Enables locale grouping where supported. |

Volume formats use `type: 'volume'`, `precision` defaulting to `2`, locale
defaulting to `en-GB`, and `useGrouping` defaulting to `true`.

### Role-specific formatters

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `date.xAxis.locale` | Locale string | `xAxis.locale` | Locale for adaptive X-axis labels. |
| `date.xAxis.timeZone` | IANA time zone | `xAxis.timeZone` | Time zone for adaptive X-axis labels. |
| `date.xAxis.seconds` | ICU pattern | `'HH:mm:ss'` | Second-span label format. |
| `date.xAxis.time` | ICU pattern | `'HH:mm'` | Intraday label format. |
| `date.xAxis.day` | ICU pattern | `'d MMM'` | Day label format. |
| `date.xAxis.month` | ICU pattern | `'MMM yyyy'` | Month label format. |
| `date.xAxis.year` | ICU pattern | `'yyyy'` | Year label format. |
| `date.crosshairTimeBadge` | `{ pattern, locale?, timeZone? }` | `'d MMM yyyy HH:mm:ss'` | Crosshair time badge format. |
| `date.tooltipHeader` | `{ pattern, locale?, timeZone? }` | `'d MMM yyyy HH:mm:ss'` | Tooltip header format. |
| `price.yAxis` | `YAxisValueFormat` | `yAxis.valueFormat` | Main Y-axis format. |
| `price.priceExtremes` | `PriceDisplayFormat` | Main Y format | Visible high/low format. |
| `price.currentPrice` | `PriceDisplayFormat` | Main Y format | Current-price format. |
| `price.crosshairPrice` | `PriceDisplayFormat` | Main Y format | Crosshair price badge format. |
| `price.tooltip` | `PriceDisplayFormat` | Main Y format | Tooltip OHLC value format. |

Date patterns use Unicode/ICU syntax. Role-specific `formatters` override the
legacy `xAxis` and `yAxis.valueFormat` values.

## Gestures and Viewport

Horizontal panning includes native momentum and stops at the available data
boundaries. Pinch gestures zoom the time range. A one-finger vertical drag that
starts in the Y-axis lane scales that pane's visible price range.

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `initialVisibleCount` | Positive integer | `100` | Initial candle-count target. |
| `defaultScale` | Positive number | `1` | Initial horizontal scale; above `1` zooms in. |
| `gestures.pan` | `boolean` | `true` | Enables horizontal pan and momentum. |
| `gestures.zoom` | `boolean` | `true` | Enables pinch zoom. |
| `gestures.yAxisScale` | `boolean` | `gestures.zoom` | Enables vertical scaling from an axis lane. |
| `yAxis.defaultScale` | Number from `0.1` to `10` | `1` | Default vertical scale. |

`TradingCharts.zoom(chartId, scale)` applies programmatic horizontal scaling
anchored to the right edge. `TradingCharts.fitContent(chartId)` shows all loaded
history and restores automatic Y scaling. These commands work even when touch
zoom is disabled. Only user gestures emit scale events.

## Crosshair and Price Overlays

A single tap pins the crosshair to the nearest candle. Drag to move the pinned
selection and tap again to clear it. Long press tracks the finger and remains
pinned after release.

### Crosshair

```tsx
<TradingChartsView
  chartId="btc-1m"
  appearance={{
    candles: { radius: 3 },
    currentPrice: { label: { border: { radius: 7 } } },
  }}
  crosshair={{
    tooltipFields: ['close', 'changePercent', 'volume'],
    showTooltipHeader: false,
  }}
/>
```

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Enables selection gestures and crosshair rendering. |
| `showTooltip` | `boolean` | `true` | Shows the OHLCV tooltip. |
| `showTooltipHeader` | `boolean` | `true` | Shows the formatted date/time heading. |
| `tooltipBackgroundOpacity` | Number from `0` to `1` | `1` | Legacy tooltip opacity and appearance fallback. |
| `lineStyle` | `'solid'`, `'dashed'` | `'solid'` | Crosshair line pattern. |
| `tooltipFields` | `ReadonlyArray<CrosshairTooltipField>` | All fields in the order below | Selects and orders tooltip rows. Unknown or duplicate fields are rejected; an empty array is allowed. |
| `tooltipLabels` | `CrosshairTooltipLabels` | English labels | Localizes tooltip row labels. |

| Tooltip label property | Default | Description |
| --- | --- | --- |
| `open` / `close` / `high` / `low` | `Open` / `Close` / `High` / `Low` | OHLC row labels. |
| `amplitude` | `Amplitude` | High-low amplitude label. |
| `changePercent` | `Change %` | Percentage change from open. |
| `change` | `Change` | Absolute change from open. |
| `volume` | `Volume` | Volume row label. |

Percentages display an em dash when the candle open is zero. Volume uses a
compact format without the Y-axis currency symbol.
When `tooltipFields` is empty, the tooltip contains only its header. If
`showTooltipHeader` is also `false`, no tooltip panel is drawn even when
`showTooltip` is `true`.

### Current price and extrema

| Property | Type / values | Default | Description |
| --- | --- | --- | --- |
| `currentPrice.visible` | `boolean` | `true` | Shows the latest-price line and eligible label. |
| `currentPrice.showLabel` | `boolean` | `true` | Shows the Y-axis latest-price badge. |
| `currentPrice.pinToEdge` | `boolean` | `true` | Pins an off-screen price label to the nearest Y edge. |
| `priceExtremes.visible` | `boolean` | `true` | Labels visible high and low values. |

When a pinned current price is outside the visible Y range, its line is hidden
and its label remains at the edge. Set `pinToEdge: false` to hide the label too.
An extremum outside a manually scaled viewport remains hidden.

## Events

| Property | Payload | Emission behavior | Description |
| --- | --- | --- | --- |
| `onVisibleRangeChange` | `VisibleRangeChangeEvent` | Visible indexes or total count changed | Reports honest visible candle ranges; suppressed in data gaps. |
| `onScaleChange` | `{ scale }` | User horizontal pinch, at most once per frame | Absolute horizontal scale. |
| `onYAxisScaleChange` | `{ scale }` | User main-axis drag, at most once per frame | Absolute main Y scale. |
| `onPaneResize` | `PaneResizeEvent` | Separator drag | Reports both adjacent pane weights. |
| `onPriceScaleChange` | `PriceScaleChangeEvent` | User pane-axis drag | Reports the affected pane and scale. |
| `onSelectedCandleChange` | `OhlcCandle \| null` | Selected candle/value changed or selection cleared | Full OHLCV selection. |

### Event payloads

| Event | Property | Type | Description |
| --- | --- | --- | --- |
| Visible range | `from`, `to` | `number` | Visible time boundaries in milliseconds. |
| Visible range | `firstVisibleIndex`, `lastVisibleIndex` | `number` | Inclusive visible main-series indexes. |
| Visible range | `totalCount` | `number` | Total main candle count. |
| Visible range | `atStart`, `atEnd` | `boolean` | Whether the viewport touches a data boundary. |
| Scale | `scale` | `number` | Absolute scale where `1` is the configured baseline. |
| Pane resize | `firstPaneId`, `secondPaneId` | `string` | Adjacent pane IDs. |
| Pane resize | `firstHeightWeight`, `secondHeightWeight` | `number` | Current relative weights. |
| Pane resize | `finished` | `boolean` | Whether the drag has ended. |
| Price scale | `paneId`, `priceScaleId` | `string` | Changed pane and scale IDs. |
| Price scale | `scale` | `number` | Absolute price scale. |
| Selected candle | `timestamp`, `open`, `high`, `low`, `close`, `volume` | `number` | Selected OHLCV values exposed as `OhlcCandle`. |

Moving within the same unchanged candle does not emit another selection. A
cleared selection emits `null` once. Programmatic `zoom`, `fitContent`, and
`setHistory` do not emit gesture scale events.

## Imperative API

All commands use the stable `chartId` of a `TradingChartsView`.

| Method | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `addSeries` | `chartId, AdditionalChartSeriesOptions` | `void` | Adds or configures a runtime additional series. |
| `setSeriesData` | `chartId, seriesId, points[]` | `void` | Replaces runtime series data. |
| `prependSeriesData` | `chartId, seriesId, points[]` | `void` | Prepends older runtime series data. |
| `updateSeriesData` | `chartId, seriesId, point` | `void` | Updates the last runtime point or appends one. |
| `removeSeries` | `chartId, seriesId` | `void` | Removes a non-`main` series. |
| `setPaneHeight` | `chartId, paneId, heightWeight` | `void` | Sets a positive pane height weight. |
| `setHistory` | `chartId, OhlcCandle[]` | `void` | Replaces main history. |
| `prependHistory` | `chartId, OhlcCandle[]` | `void` | Prepends main history. |
| `updateCandle` | `chartId, OhlcCandle` | `void` | Replaces or appends the latest candle. |
| `updateTrade` | `chartId, TradeEvent` | `void` | Aggregates one trade. |
| `updateTrades` | `chartId, TradeEvent[]` | `void` | Aggregates a trade batch. |
| `getCandles` | `chartId` | `Promise<OhlcCandle[]>` | Reads an atomic copy of native main history. |
| `zoom` | `chartId, positive scale` | `void` | Scales the horizontal viewport from its right edge. |
| `fitContent` | `chartId` | `void` | Fits loaded history and resets automatic Y scaling. |
| `clear` | `chartId` | `void` | Clears chart data. |

Runtime additional series use pane definitions already supplied to the view:

```tsx
TradingCharts.addSeries('btc-1m', {
  seriesId: 'momentum',
  type: 'histogram',
  paneId: 'volume',
  priceScaleId: 'volume',
  source: { type: 'data' },
  appearance: { color: '#8C7CFF' },
});

TradingCharts.setSeriesData('btc-1m', 'momentum', [
  { timestamp: 1_720_000_000_000, value: -4.2 },
  { timestamp: 1_720_000_060_000, value: 7.1 },
]);
```

Read the current native candle store when application state needs an atomic
snapshot:

```tsx
const candles = await TradingCharts.getCandles('btc-1m');
```

A mounted empty chart returns `[]`. The promise rejects with
`E_CHART_NOT_MOUNTED` when the ID is not mounted; unlike writes, reads are not
retained for replay.

## Architecture and Performance

```text
React configuration and market data
                |
                v
Fabric view / TurboModule command registry
                |
                v
Shared C++ state, aggregation, viewport, and geometry
                |
        immutable render snapshot
           /                 \
          v                   v
  Metal + Core Animation   OpenGL ES 3 + Canvas
          iOS                  Android
```

The native registry routes commands by `chartId` and keeps a bounded queue for
views that have not mounted yet. Data or gesture mutations mark the engine
snapshot dirty and request one platform frame; repeated requests before the
next display refresh are coalesced. An idle chart does not continuously render.

Snapshots are immutable and cached. Large content geometry and small overlay
geometry are tracked separately, so moving only the crosshair can reuse the
existing chart vertices. GPU buffers grow to capacity and are reused instead
of being recreated during steady-state interaction. For high-frequency feeds,
`updateTrades` and `createTradeBatcher` reduce bridge calls and engine
mutations.

## Platform Support and Limitations

| Property | Supported value | Notes |
| --- | --- | --- |
| Platforms | iOS and Android | Metal on iOS; OpenGL ES 3 on Android. |
| React Native architecture | New Architecture / Fabric | The first release targets Fabric applications. |
| Data ownership | Application-owned | Networking, WebSockets, parsing, and reconnect logic are outside the library. |
| Time unit | Milliseconds | Candle timestamps must be safe integers. |
| Price scales | One visible scale per pane | Each pane keeps an independent autoscale range. |
| Custom fonts | App-bundled fonts | Missing families fall back to the platform monospace font. |
| Main identifiers | `paneId: 'main'`, `priceScaleId: 'main'`, `seriesId: 'main'` | Reserved and cannot be reused or removed. |
| Native coordinates | iOS points, Android pixels internally | Public dimensions are converted consistently by the platform configuration. |

Changing the main `series.type` at runtime keeps the native candle store,
viewport, Y scale, and crosshair selection. The library does not synthesize
empty time buckets.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
