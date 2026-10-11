---
description: 'Add comparison prices or derived indicators to an existing chart.'
---

# Additional series

An additional series puts another set of values on the same chart. Use one to overlay a moving average on price, compare two instruments, or show volume below the candles. The main series keeps its own data and remains the chart's time reference.

There are two ways to supply those values. A comparison line has its own OHLC history, which your app loads and updates. An indicator such as SMA or RSI derives its values from an existing OHLC series and follows that source's updates automatically.

Declare series in the `additionalSeries` prop when they are part of the screen's layout. Use `TradingCharts.addSeries` and `removeSeries` when users need to add or remove them, for example from an indicator picker. Each series needs its own `seriesId` and a target pane. A price comparison can share the main pane; values with different units, such as volume, usually need a [separate pane](/docs/panes) and scale.

## Configuration

| Property         | Type / values                                                                                | Default        | Description                                          |
| ---------------- | -------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------- |
| `seriesId`       | Unique non-empty string except `main`                                                        | Required       | Runtime/declarative series identifier.               |
| `paneId`         | Existing pane ID                                                                             | Required       | Target pane.                                         |
| `priceScaleId`   | Target pane's scale ID                                                                       | Required       | Must match the pane price scale.                     |
| `visible`        | `boolean`                                                                                    | `true`         | Controls rendering without removing the series.      |
| `type`           | `'candlestick'`, `'hollowCandlestick'`, `'bar'`, `'line'`, `'area'`, `'histogram'`, `'macd'`, `'boll'` | Required       | Series geometry or composite indicator.         |
| `source`         | OHLC field, derived indicator, or histogram source                                           | Type-specific  | Line/area value field or native-derived/data source. |
| `gapThresholdMs` | Positive milliseconds                                                                        | `undefined`    | Optional line/area gap splitting.                    |
| `appearance`     | Type-specific style                                                                          | Theme fallback | Optional line, area, or histogram style.             |

Derived volume follows its OHLC source automatically when history, candle, or
trade updates arrive. Standalone series use `setSeriesData`,
`prependSeriesData`, and `updateSeriesData`.

Identifiers accept letters, numbers, `.`, `_` and `-`. `main` is reserved. Target a declared pane and its matching price scale. The main pane exists by default; declare any extra pane before adding series to it.

## Runtime comparison series

The example loads a comparison line with its own OHLC history. Its button removes that line while leaving the main chart in place.

<<< ../examples/additional-series.tsx

## Data ownership

OHLC-backed line and area series still receive full `OhlcCandle` objects. Standalone histograms receive `HistogramPoint` objects. Use `setSeriesData`, `prependSeriesData` and `updateSeriesData` to load, prepend and update data-backed series. Derived volume and indicators follow their OHLC source; do not write data directly into them.

Use the `additionalSeries` prop for series declared in React, as in the indicator guides. When you also add or remove series through commands, keep that prop consistent with the layout you want. The prop configures series; data updates still go through the command API. Set `visible: false` to hide a series without removing it.

See [Bollinger Bands](/docs/bollinger-bands) for a three-line price overlay with a gradient fill and configurable period, deviation multiplier, and OHLC source.
