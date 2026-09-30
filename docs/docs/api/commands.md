---
description: 'Load data, manage series and control a native chart through TradingCharts.'
---

# TradingCharts

`TradingCharts` is the command API for a mounted chart's data and state. Use it to load history, apply feed updates, manage extra series or move the viewport from a button in your screen. The [view component](/docs/api/view) supplies the layout and appearance; commands act on its native chart.

Every method takes the view's `chartId` first. For example, `setHistory('btc-1m', candles)` replaces the data in the view whose ID is `btc-1m`. Keep the ID stable while that view is mounted and use a different ID for each simultaneous chart.

Import `TradingCharts` from `react-native-trading-charts`. Most methods perform a write and return `void`. `getCandles` and `getPriceLines` return promises because they read a snapshot from the native chart.

## Lifecycle and errors

The following validation and lifecycle rules apply to every method. Every method requires a non-blank chart ID. Writes return `void`, so the return value does not confirm that native code applied the command. Before mount, the native registry holds writes in a bounded queue. A new queued `setHistory` replaces previous queued work, and the registry may drop streaming commands if the queue fills. Reads require a mounted view and are not queued.

JavaScript rejects malformed inputs with `TypeError`: invalid identifiers, non-finite values, negative volume/size, invalid OHLC bounds, unsafe or negative millisecond timestamps, unsorted arrays, mixed data shapes, or invalid options. For synchronous write methods these errors are thrown immediately; async reads reject their promise. Runtime references (pane, scale or source) must also match the mounted chart. The API does not return a separate acknowledgement or result for native writes.

Both reads reject with `E_CHART_NOT_MOUNTED` when the chart is unregistered. Handle rejection, including when the screen unmounts before a read completes.

## Methods

| Method                                  | Returns                       |
| --------------------------------------- | ----------------------------- |
| [addSeries](#addseries)                 | `void`                        |
| [setSeriesData](#setseriesdata)         | `void`                        |
| [prependSeriesData](#prependseriesdata) | `void`                        |
| [updateSeriesData](#updateseriesdata)   | `void`                        |
| [removeSeries](#removeseries)           | `void`                        |
| [setPaneHeight](#setpaneheight)         | `void`                        |
| [setHistory](#sethistory)               | `void`                        |
| [prependHistory](#prependhistory)       | `void`                        |
| [updateCandle](#updatecandle)           | `void`                        |
| [updateTrade](#updatetrade)             | `void`                        |
| [updateTrades](#updatetrades)           | `void`                        |
| [getCandles](#getcandles)               | `Promise<OhlcCandle[]>`       |
| [setPriceLine](#setpriceline)           | `void`                        |
| [removePriceLine](#removepriceline)     | `void`                        |
| [clearPriceLines](#clearpricelines)     | `void`                        |
| [getPriceLines](#getpricelines)         | `Promise<PriceLineOptions[]>` |
| [zoom](#zoom)                           | `void`                        |
| [scrollToRealTime](#scrolltorealtime)   | `void`                        |
| [fitContent](#fitcontent)               | `void`                        |
| [clear](#clear)                         | `void`                        |

## addSeries {#addseries}

```ts
addSeries(chartId: string, options: AdditionalChartSeriesOptions): void
```

Add or configure a runtime series. Its pane and price scale must already exist. The ID `main` is reserved. Derived sources must reference a data-backed OHLC series.

Options/data: [AdditionalChartSeriesOptions](/docs/api/types#additionalchartseriesoptions).

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.addSeries(chartId, {
    seriesId: 'comparison',
    type: 'line',
    paneId: 'main',
    priceScaleId: 'main',
    appearance: { color: '#F5A623', width: 2 },
  });
}
```

## setSeriesData {#setseriesdata}

```ts
setSeriesData(chartId: string, seriesId: string, points: ReadonlyArray<ChartSeriesDataPoint>): void
```

Replace an additional series' own data. Supply either OHLC candles or histogram points, with strictly increasing timestamps; do not mix the two shapes in one array. Derived volume and indicators follow their source and do not accept direct data writes.

Options/data: [ChartSeriesDataPoint](/docs/api/types#chartseriesdatapoint).

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.setSeriesData(chartId, 'comparison', [
    { timestamp: 1720000000000, open: 100, high: 104, low: 99, close: 102 },
  ]);
}
```

## prependSeriesData {#prependseriesdata}

```ts
prependSeriesData(chartId: string, seriesId: string, points: ReadonlyArray<ChartSeriesDataPoint>): void
```

Prepend strictly older points to an additional data-backed series. Use the same point shape as its existing data.

Options/data: [ChartSeriesDataPoint](/docs/api/types#chartseriesdatapoint).

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.prependSeriesData(chartId, 'comparison', [
    { timestamp: 1719999940000, open: 98, high: 102, low: 97, close: 100 },
  ]);
}
```

## updateSeriesData {#updateseriesdata}

```ts
updateSeriesData(chartId: string, seriesId: string, point: ChartSeriesDataPoint): void
```

Replace the last point at an equal timestamp or append a newer point. It must match the additional series data shape. Use it for the latest point; it cannot edit an arbitrary earlier point.

Options/data: [ChartSeriesDataPoint](/docs/api/types#chartseriesdatapoint).

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.updateSeriesData(chartId, 'comparison', {
    timestamp: 1720000060000,
    open: 102,
    high: 105,
    low: 101,
    close: 104,
  });
}
```

## removeSeries {#removeseries}

```ts
removeSeries(chartId: string, seriesId: string): void
```

Remove a non-main series. Removing a composite MACD series removes all of its components. `main` is rejected in JavaScript.

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.removeSeries(chartId, 'comparison');
}
```

## setPaneHeight {#setpaneheight}

```ts
setPaneHeight(chartId: string, paneId: string, heightWeight: number): void
```

Set a declared pane's relative height weight. The weight must be finite and greater than zero; the value represents a proportion of the layout rather than a pixel height.

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.setPaneHeight(chartId, 'main', 3);
}
```

## setHistory {#sethistory}

```ts
setHistory(chartId: string, candles: ReadonlyArray<OhlcCandle>): void
```

Replace main OHLC history and restore configured initial scales. Candles must have strictly increasing timestamps; an empty array clears main history.

Options/data: [OhlcCandle](/docs/api/types#ohlccandle).

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.setHistory(chartId, [
    {
      timestamp: 1720000000000,
      open: 100,
      high: 104,
      low: 99,
      close: 102,
      volume: 12,
    },
  ]);
}
```

## prependHistory {#prependhistory}

```ts
prependHistory(chartId: string, candles: ReadonlyArray<OhlcCandle>): void
```

Prepend older main candles in strictly increasing order. Use this for pagination; fetch data before the first stored timestamp.

Options/data: [OhlcCandle](/docs/api/types#ohlccandle).

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.prependHistory(chartId, [
    { timestamp: 1719999940000, open: 98, high: 102, low: 97, close: 100 },
  ]);
}
```

## updateCandle {#updatecandle}

```ts
updateCandle(chartId: string, candle: OhlcCandle): void
```

Replace the last main candle at the same timestamp or append a newer one. Supply the complete OHLCV candle; the supplied volume replaces the previous volume.

Options/data: [OhlcCandle](/docs/api/types#ohlccandle).

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.updateCandle(chartId, {
    timestamp: 1720000060000,
    open: 102,
    high: 105,
    low: 101,
    close: 104,
    volume: 3,
  });
}
```

## updateTrade {#updatetrade}

```ts
updateTrade(chartId: string, trade: TradeEvent): void
```

Aggregate one raw trade using the configured resolution and calendar. Optional size defaults to zero. Trades older than the current aggregate are ignored.

Options/data: [TradeEvent](/docs/api/types#tradeevent).

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.updateTrade(chartId, {
    timestamp: 1720000061000,
    price: 104,
    size: 0.5,
  });
}
```

## updateTrades {#updatetrades}

```ts
updateTrades(chartId: string, trades: ReadonlyArray<TradeEvent>): void
```

Aggregate a non-decreasing trade batch in one native call. Equal timestamps are allowed. Optional size defaults to zero.

Options/data: [TradeEvent](/docs/api/types#tradeevent).

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.updateTrades(chartId, [
    { timestamp: 1720000061000, price: 104, size: 0.5 },
    { timestamp: 1720000062000, price: 105, size: 0.2 },
  ]);
}
```

## getCandles {#getcandles}

```ts
getCandles(chartId: string): Promise<OhlcCandle[]>
```

Return a copy of the main OHLCV history captured at a single point in time. A mounted empty chart returns `[]`; omitted input volume is returned as zero.

Options/data: [OhlcCandle](/docs/api/types#ohlccandle).

Rejects with `E_CHART_NOT_MOUNTED` if the native view is unavailable. Catch the returned promise at the call site.

```ts
import { TradingCharts } from 'react-native-trading-charts';

export async function example(chartId: string) {
  return await TradingCharts.getCandles(chartId);
}
```

## setPriceLine {#setpriceline}

```ts
setPriceLine(chartId: string, options: PriceLineOptions): void
```

Create or update a custom main-pane marker by ID. Updating preserves insertion order. The ID and label must be non-blank, price finite, and color a six- or eight-digit hex value.

Options/data: [PriceLineOptions](/docs/api/types#pricelineoptions).

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.setPriceLine(chartId, {
    id: 'target',
    price: 105,
    label: 'Target',
    color: '#FF9457',
  });
}
```

## removePriceLine {#removepriceline}

```ts
removePriceLine(chartId: string, priceLineId: string): void
```

Remove a custom marker by its non-blank ID.

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.removePriceLine(chartId, 'target');
}
```

## clearPriceLines {#clearpricelines}

```ts
clearPriceLines(chartId: string): void
```

Remove all custom price markers, leaving market data intact.

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.clearPriceLines(chartId);
}
```

## getPriceLines {#getpricelines}

```ts
getPriceLines(chartId: string): Promise<PriceLineOptions[]>
```

Read all markers in insertion order, including off-screen ones. A mounted chart with no markers returns `[]`.

Options/data: [PriceLineOptions](/docs/api/types#pricelineoptions).

Rejects with `E_CHART_NOT_MOUNTED` if the native view is unavailable. Catch the returned promise at the call site.

```ts
import { TradingCharts } from 'react-native-trading-charts';

export async function example(chartId: string) {
  return await TradingCharts.getPriceLines(chartId);
}
```

## zoom {#zoom}

```ts
zoom(chartId: string, scale: number): void
```

Set a finite positive horizontal scale anchored to the right edge. Works even when touch zoom is disabled and does not emit gesture scale events.

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.zoom(chartId, 2);
}
```

## scrollToRealTime {#scrolltorealtime}

```ts
scrollToRealTime(chartId: string): void
```

Smoothly return to the latest loaded data while preserving horizontal and price scales. Does not emit gesture scale events.

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.scrollToRealTime(chartId);
}
```

## fitContent {#fitcontent}

```ts
fitContent(chartId: string): void
```

Fit all loaded main history and restore automatic Y scaling. Does not emit gesture scale events.

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.fitContent(chartId);
}
```

## clear {#clear}

```ts
clear(chartId: string): void
```

Clear market data while preserving custom price markers. Use `clearPriceLines` separately to remove those.

```ts
import { TradingCharts } from 'react-native-trading-charts';

export function example(chartId: string) {
  TradingCharts.clear(chartId);
}
```
