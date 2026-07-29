# react-native-trading-charts

Native OHLC charts for React Native's New Architecture. A shared C++ engine owns
the candle store, raw-trade aggregation, viewport, autoscale and render snapshots;
Metal on iOS and GLES3 on Android draw the chart on demand.

## Installation

```sh
npm install react-native-trading-charts
cd ios && pod install
```

The first release supports Fabric/New Architecture applications on iOS and
Android.

## Usage

```tsx
import {
  TradingCharts,
  TradingChartsView,
  createTradeBatcher,
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

export function Chart() {
  return (
    <TradingChartsView
      style={{ flex: 1 }}
      chartId="btc-1m"
      timeframeMs={60_000}
      initialVisibleCount={100}
      defaultScale={1.25}
      series={{ type: 'candlestick' }}
      xAxis={{ locale: 'en-GB', timeZone: 'UTC', spacing: 'time' }}
      yAxis={{
        position: 'right',
        defaultScale: 1,
        scaleMargins: { top: 0.2, bottom: 0.1 },
        valueFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
          locale: 'en-GB',
        },
      }}
      gestures={{ pan: true, zoom: true, yAxisScale: true }}
      currentPrice={{ visible: true, showLabel: true, pinToEdge: true }}
      priceExtremes={{ visible: true }}
      theme={{
        crosshairColor: '#A8A2B3',
        tooltipBackgroundColor: '#1B1723',
        tooltipTextColor: '#F5F2FA',
      }}
      crosshair={{
        enabled: true,
        showTooltip: true,
        tooltipBackgroundOpacity: 0.85,
        lineStyle: 'dashed',
        tooltipLabels: {
          open: 'Open',
          close: 'Close',
          high: 'High',
          low: 'Low',
          amplitude: 'Amplitude',
          changePercent: 'Change %',
          change: 'Change',
          volume: 'Volume',
        },
      }}
      onSelectedCandleChange={(candle) => {
        // `null` is emitted once when the crosshair selection is cleared.
        console.log('Selected candle', candle);
      }}
      onScaleChange={({ scale }) => {
        console.log('Horizontal scale', scale);
      }}
      onYAxisScaleChange={({ scale }) => {
        console.log('Y-axis scale', scale);
      }}
    />
  );
}

TradingCharts.setHistory('btc-1m', history);

// A ready WebSocket kline can replace the current candle or append a new one.
TradingCharts.updateCandle('btc-1m', {
  timestamp: 1_720_000_060_000,
  open: 64_633,
  high: 64_650,
  low: 64_620,
  close: 64_642,
  volume: 3.1,
});

// Raw trades are aggregated into UTC epoch-aligned OHLCV buckets in C++.
TradingCharts.updateTrade('btc-1m', {
  timestamp: Date.now(),
  price: 64_642,
  size: 0.02,
});

// Prefer batches for burst/high-frequency feeds.
TradingCharts.updateTrades('btc-1m', incomingTrades);

// For high-frequency streams that deliver one trade at a time, the batcher
// reduces JS-to-native calls by forwarding one updateTrades call per interval.
const batcher = createTradeBatcher('btc-1m', { intervalMs: 32 });
ws.onmessage = (message) => batcher.add(parseTrade(message));

// Programmatic zoom is anchored to the right edge of the visible range.
// Values greater than 1 zoom in; values between 0 and 1 zoom out.
TradingCharts.zoom('btc-1m', 1.25);

// Show the complete loaded history and restore automatic Y scaling.
TradingCharts.fitContent('btc-1m');

// Read an atomic copy of every candle currently stored by the native engine.
const currentCandles = await TradingCharts.getCandles('btc-1m');
```

`chartId` must be unique and stable while the view is mounted. Calls made before
mount are retained by the native registry and replayed when that chart registers.
The library does not open a WebSocket; networking and reconnect logic stay in the
application.

Raw trades must be ordered by non-decreasing millisecond timestamp. Empty time
buckets are not synthesized. A trade in the final history bucket continues that
candle; an older trade is ignored with a development warning.

`defaultScale` defaults to `1` and scales the initial horizontal viewport after
`initialVisibleCount` is applied. Values greater than `1` zoom in; values between
`0` and `1` zoom out. The scale is restored by the next `setHistory`. Changing
the prop on a populated chart does not move the current viewport until then.

`onSelectedCandleChange` receives the selected OHLCV candle when the crosshair
moves to a different candle or that candle's values change. It receives `null`
once when the selection is cleared; moving within the same unchanged candle does
not emit another callback.

### Series rendering

`series.type` selects how the native GPU renders the same OHLCV store.
`'candlestick'` is the default. Use `'hollowCandlestick'` for hollow rising
candles and filled falling candles:

```tsx
<TradingChartsView
  chartId="hollow"
  series={{ type: 'hollowCandlestick' }}
  appearance={{
    candles: {
      upColor: '#00A88F',
      downColor: '#FF334F',
    },
  }}
/>
```

Hollow candlesticks reuse `appearance.candles`: candles where `close >= open`
use the up color and an outlined body, while candles where `close < open` use
the down color and a filled body. The outline uses the same native thickness as
the wick.

Use `'bar'` for an OHLC bar with a high-low stem, open tick on the left and
close tick on the right:

```tsx
<TradingChartsView
  chartId="bars"
  series={{ type: 'bar' }}
  appearance={{
    bars: {
      upColor: '#00A88F',
      downColor: '#FF334F',
      lineWidth: 1,
    },
  }}
/>
```

Bar colors fall back to `appearance.candles`, then `theme`. `lineWidth` uses
points on iOS and density-independent pixels on Android. Changing `series.type`
at runtime keeps the native candle store, viewport, Y scale and crosshair
selection; it only schedules a new render snapshot. Data methods and
`onSelectedCandleChange` remain OHLCV-based for every render type.

### Multiple panes, series, and volume

All panes share the `main` series time viewport while keeping independent
autoscale ranges. When `panes` is supplied it must contain the reserved `main`
pane and `main` price scale:

```tsx
<TradingChartsView
  chartId="btc-1m"
  panes={[
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
  ]}
  additionalSeries={[
    {
      seriesId: 'volume',
      type: 'histogram',
      paneId: 'volume',
      priceScaleId: 'volume',
      source: { type: 'ohlcvVolume', seriesId: 'main' },
      appearance: {
        upColor: '#38D98A80',
        downColor: '#FF3B6480',
      },
    },
  ]}
  panesResizable
  onPaneResize={(event) => {
    console.log(event.firstPaneId, event.firstHeightWeight);
  }}
  onPriceScaleChange={(event) => {
    console.log(event.paneId, event.scale);
  }}
/>
```

Derived volume reads OHLCV data directly from its source series, so
`setHistory`, candle updates, prepends, and raw trades update it without a
second data copy. Runtime series use the same pane definitions:

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
TradingCharts.updateSeriesData('btc-1m', 'momentum', {
  timestamp: 1_720_000_060_000,
  value: 8.3,
});
TradingCharts.setPaneHeight('btc-1m', 'volume', 1.5);
```

The additional supported OHLC types are `candlestick`,
`hollowCandlestick`, and `bar`. `prependSeriesData` follows the same ordering
rules as main history, and `removeSeries` cannot remove the reserved `main`
series. One visible price scale is supported per pane.

`onScaleChange` reports horizontal pinch changes and `onYAxisScaleChange`
reports vertical drags that start in the Y-axis lane. Both callbacks receive an
absolute `{ scale }`: `1` is the baseline, values above `1` make candles
visually wider or taller, and values below `1` make them narrower or shorter.
Only user gestures emit these events. Native code coalesces gesture updates to
at most one event of each type per rendered frame; `TradingCharts.zoom`,
`fitContent`, and `setHistory` do not emit them.

`TradingCharts.getCandles(chartId)` asynchronously returns an atomic copy of all
OHLCV candles in the native store, including changes produced by candle/trade
updates and prepended history. A mounted empty chart returns `[]`. The Promise
rejects with code `E_CHART_NOT_MOUNTED` when `chartId` is not mounted; unlike
write commands, reads are not retained for later replay.

A single tap immediately pins the crosshair to the nearest candle. While pinned,
a one-finger drag moves the selection and another single tap clears it. Long
press still tracks the finger, but releasing it now leaves the selection pinned.

The tooltip shows Open, Close, High, Low, amplitude, absolute and percentage
change, and volume. Amplitude and percentage change use the candle open as the
baseline; percentages are shown as an em dash when the open is zero. Volume is
formatted compactly without the Y-axis currency symbol. Labels can be localized
through `crosshair.tooltipLabels`. Use `crosshair.tooltipBackgroundOpacity` for
background alpha and `crosshair.lineStyle` to select solid or dashed lines; line
and tooltip colors remain in `theme`.

## Appearance and formatters

Use `appearance` for role-specific native styling. Colors accept `#RRGGBB` or
`#RRGGBBAA`; font sizes use points on iOS and scaled pixels on Android. A custom
`fontFamily` must already be bundled by the consuming application. Missing
families fall back to the platform monospace font.

```tsx
<TradingChartsView
  chartId="styled"
  appearance={{
    backgroundColor: '#FAFAFC',
    grid: { color: '#D9DCE4', opacity: 0.7 },
    candles: { upColor: '#159A68', downColor: '#D6455D' },
    bars: { upColor: '#159A68', downColor: '#D6455D', lineWidth: 1 },
    xAxis: { text: { color: '#596173', fontSize: 11 } },
    yAxis: { text: { color: '#303747', fontSize: 11 } },
    priceExtremes: {
      text: { color: '#596173' },
      connectorColor: '#9097A6',
      backgroundColor: '#FAFAFC',
    },
    currentPrice: {
      line: { upColor: '#159A68', downColor: '#D6455D' },
      label: {
        upBackgroundColor: '#159A68',
        downBackgroundColor: '#D6455D',
        text: { color: '#FFFFFF', fontWeight: 'semibold' },
        border: { color: '#FFFFFF80', width: 1, radius: 5 },
      },
    },
    crosshair: {
      line: { color: '#596173', opacity: 0.8 },
      priceLabel: {
        backgroundColor: '#303747',
        text: { color: '#FFFFFF' },
        border: { color: '#9097A6', width: 1, radius: 5 },
      },
      timeLabel: {
        backgroundColor: '#303747',
        text: { color: '#FFFFFF' },
        border: { color: '#9097A6', width: 1, radius: 5 },
      },
    },
    tooltip: {
      backgroundColor: '#FFFFFF',
      backgroundOpacity: 0.96,
      headerText: { color: '#171B24', fontWeight: 'semibold' },
      labelText: { color: '#71798A' },
      valueText: { color: '#171B24' },
      positiveValueColor: '#159A68',
      negativeValueColor: '#D6455D',
      border: { color: '#D9DCE4', width: 1, radius: 8 },
    },
  }}
  formatters={{
    date: {
      xAxis: {
        locale: 'en-GB',
        timeZone: 'UTC',
        seconds: 'HH:mm:ss',
        time: 'HH:mm',
        day: 'dd MMM',
        month: 'MMM yyyy',
        year: 'yyyy',
      },
      crosshairTimeBadge: { pattern: 'dd MMM HH:mm:ss' },
      tooltipHeader: { pattern: 'dd MMM yyyy HH:mm:ss' },
    },
    price: {
      yAxis: { type: 'price', precision: 2, minMove: 0.01 },
      priceExtremes: { type: 'price', precision: 2 },
      currentPrice: { type: 'price', precision: 2, currencySymbol: '$' },
      crosshairPrice: { type: 'price', precision: 4 },
      tooltip: { type: 'price', precision: 4, useGrouping: false },
    },
  }}
/>
```

Date patterns use Unicode/ICU syntax. The X-axis keeps its adaptive span-based
selection and substitutes the configured five patterns. `theme`,
`yAxis.valueFormat`, and `crosshair.tooltipBackgroundOpacity` remain supported;
role-specific values in `appearance` and `formatters` take precedence. Axis
regions do not auto-grow for larger fonts, so adjust `xAxis.height` or
`yAxis.width` when necessary.

`xAxis.spacing` defaults to `'time'`, where horizontal distance represents
elapsed time. Use `'logical'` to give every candle one uniform slot regardless
of timestamp gaps. Logical spacing keeps timestamps for axis labels and the
crosshair while pan, zoom and live following operate by candle index.

`currentPrice.pinToEdge` defaults to `true`. When the latest price is outside
the visible Y range, its label stays pinned to the upper or lower Y-axis edge
while the price line is hidden. Set `currentPrice={{ pinToEdge: false }}` to
hide the label too while its price is outside the range. `showLabel: false`
hides only the label.

`priceExtremes.visible` defaults to `true` and labels the highest wick and
lowest wick among the visible candles. The labels use the same native
`yAxis.valueFormat` formatter and axis text style as the Y-axis. Set
`priceExtremes={{ visible: false }}` to hide them. An extremum outside a
manually scaled Y viewport is hidden until it returns to the plot.

For market-cap axes, use the compact formatter:

```tsx
yAxis={{
  scaleMargins: { top: 0.2, bottom: 0.1 },
  valueFormat: {
    type: 'compact',
    precision: 2,
    minMove: 1,
    currencySymbol: '$',
    locale: 'en-GB',
  },
}}
```

For very small crypto prices, use the significant formatter:

```tsx
yAxis={{
  valueFormat: {
    type: 'significant',
    significantDigits: 3,
    minMove: 0.00000001,
    currencySymbol: '$',
    locale: 'en-GB',
  },
}}
```

`significantDigits` accepts values from `1` through `8`. Values with one or more
zeros after the decimal separator use crypto zero-count notation, where the
subscript is the number of zeros before the first significant digit:
`0.056602` becomes `$0.0₁566`, `0.001898` becomes `$0.0₂19`, and `0.0000058`
becomes `$0.0₅58`. Other values use ordinary localized significant digits, so
the same formatter remains usable while the market crosses price magnitudes.
`minMove` remains the instrument's real tick size; it does not control when
zero-count notation is selected.

The example app's `Auto` Y-axis format selects `significant` when the current
market price is below `1`. This keeps sub-unit axes concise at prices such as
`0.056602`; zero-count notation starts as soon as there is a leading fractional
zero. Current-price, crosshair, extrema, and tooltip values keep the full
`price` format so exact executable prices remain visible.

`scaleMargins` reserves a fraction of the plot above and below the visible price
range. Both values must be non-negative and their sum must be less than `1`.
Defaults are `top: 0.2` and `bottom: 0.1`. When all visible values are equal,
autoscale expands the range using `minMove`, so pass the instrument's real tick
size instead of deriving it from the latest price.

With `gestures.zoom` enabled, pinch gestures scale the visible time range and a
one-finger vertical drag that starts on the Y axis scales the visible price
range. Set `gestures.yAxisScale` independently to enable or disable that Y-axis
gesture. When omitted, it inherits `gestures.zoom` for backward compatibility;
a disabled Y-axis gesture consumes the axis-lane drag without turning it into a
horizontal pan. Drag up to narrow the range or down to expand it.

`yAxis.defaultScale` defaults to `1` and accepts values from `0.1` through `10`.
It is restored on the first history load, every `setHistory`, and
`TradingCharts.fitContent`. The selected Y scale is otherwise preserved while
autoscale follows the visible candles.

`TradingCharts.zoom(chartId, scale)` provides the same horizontal scaling from
application controls, anchored to the right edge of the current viewport. A
scale greater than `1` zooms in and a scale between `0` and `1` zooms out.
`TradingCharts.fitContent(chartId)` shows the full loaded history and restores
the configured `yAxis.defaultScale`. These programmatic commands work even when
`gestures.zoom` is disabled; the option controls touch gestures only.

With `gestures.pan` enabled, a quick horizontal swipe continues scrolling with
native momentum and slows to a stop at the beginning or end of the data.

The same native formatter is used for Y ticks, visible price extremes, the
live-price badge, crosshair badge and OHLC tooltip. X labels adapt to the
visible time span and use the configured native locale and timezone.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
