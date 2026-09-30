---
description: 'Configure the chart component, its layout, appearance and event callbacks.'
---

# TradingChartsView

`TradingChartsView` is the React component that places a native chart in your screen. Its props describe how the chart looks and behaves: the series type, pane layout, axes, gestures and event handlers.

Give the view a visible size through `style` and a unique, stable `chartId`. Pass that same ID to [TradingCharts](/docs/api/commands) when loading history or sending updates. Data goes through those commands rather than a candle-array prop, so a feed can update the native store without replacing a large React prop on every tick.

The component also accepts React Native `ViewProps`, including accessibility props. Start with the [first-chart example](/docs/getting-started) if you have not mounted a chart yet; use this page to look up individual options.

| Property                 | Type / values                                                                             | Default                                     | Description                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `chartId`                | `string`                                                                                  | Required                                    | Unique, non-empty ID used by the imperative API and native registry.                  |
| `resolution`             | `ChartResolution`                                                                         | `{ unit: 'minute', multiplier: 1 }`         | Raw-trade aggregation interval.                                                       |
| `tradeAggregation`       | `TradeAggregationOptions`                                                                 | Epoch-aligned, ignore out-of-session trades | Calendar and bucket behavior for raw trades.                                          |
| `initialVisibleCount`    | Positive integer                                                                          | `100`                                       | Number of candles targeted by the initial viewport.                                   |
| `defaultScale`           | Positive number                                                                           | `1`                                         | Initial horizontal zoom applied after `initialVisibleCount`.                          |
| `series`                 | `ChartSeriesOptions`                                                                      | `{ type: 'candlestick' }`                   | Main-series display type and value source.                                            |
| `panes`                  | `ChartPaneOptions[]`                                                                      | One `main` pane                             | Pane layout and pane price scales.                                                    |
| `additionalSeries`       | `AdditionalChartSeriesOptions[]`                                                          | `[]`                                        | Series rendered in addition to the reserved `main` series.                            |
| `panesResizable`         | `boolean`                                                                                 | `true` when multiple panes exist            | Enables dragging pane separators.                                                     |
| `theme`                  | `ChartTheme`                                                                              | Dark theme                                  | High-level color tokens.                                                              |
| `appearance`             | `ChartAppearance`                                                                         | Derived from `theme`                        | Role-specific native presentation.                                                    |
| `formatters`             | `ChartFormatters`                                                                         | Derived from axis options                   | Role-specific date and price formats.                                                 |
| `xAxis`                  | `XAxisOptions`                                                                            | Visible, time spacing, UTC                  | Time-axis behavior and dimensions.                                                    |
| `yAxis`                  | `YAxisOptions`                                                                            | Visible on the right                        | Main price-axis behavior and formatting.                                              |
| `gestures`               | `GestureOptions`                                                                          | All enabled                                 | Native pan, horizontal zoom, and Y-scale gestures.                                    |
| `currentPrice`           | `CurrentPriceOptions`                                                                     | Visible with edge-pinned label              | Latest-price line and badge behavior.                                                 |
| `priceExtremes`          | `PriceExtremesOptions`                                                                    | Visible                                     | Visible high/low labels.                                                              |
| `crosshair`              | `CrosshairOptions`                                                                        | Enabled with tooltip                        | Crosshair interaction and tooltip behavior.                                           |
| `onVisibleRangeChange`   | `(event) => void`                                                                         | `undefined`                                 | Receives visible candle range changes.                                                |
| `onScaleChange`          | `(event) => void`                                                                         | `undefined`                                 | Receives user-driven horizontal scale changes.                                        |
| `onYAxisScaleChange`     | `(event) => void`                                                                         | `undefined`                                 | Receives user-driven main Y-scale changes.                                            |
| `onYAxisPress`           | `(event: YAxisPressEvent) => void`                                                        | `undefined`                                 | Receives taps on any visible pane Y-axis with local coordinates and the mapped price. |
| `onPaneResize`           | `(event) => void`                                                                         | `undefined`                                 | Receives interactive pane size changes.                                               |
| `onPriceScaleChange`     | `(event) => void`                                                                         | `undefined`                                 | Receives per-pane price-scale changes.                                                |
| `onSelectedCandleChange` | `(candle: OhlcCandle \| null, seriesValues: ReadonlyArray<CrosshairSeriesValue>) => void` | `undefined`                                 | Receives crosshair selection changes and visible additional-series values.            |

## Usage

<<< ../../examples/first-chart.tsx

## Configuration reference

Follow the guide for a prop group when you need an example or the defaults of its nested options.

| Prop group                       | Detailed options and defaults                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `series`, `additionalSeries`     | [Series types](/docs/series-types), [additional series](/docs/additional-series), [indicators](/docs/moving-averages) |
| `resolution`, `tradeAggregation` | [Time and aggregation](/docs/time-aggregation)                                                                        |
| `panes`, `panesResizable`        | [Pane layout](/docs/panes)                                                                                            |
| `theme`, `appearance`            | [Styling](/docs/styling)                                                                                              |
| `formatters`, `xAxis`, `yAxis`   | [Axes and formatting](/docs/axes)                                                                                     |
| `gestures`, initial scales       | [Gestures and viewport](/docs/gestures)                                                                               |
| `crosshair`                      | [Crosshair and tooltips](/docs/crosshair)                                                                             |
| `currentPrice`, `priceExtremes`  | [Price overlays](/docs/price-overlays)                                                                                |
| Event callbacks                  | [Events](/docs/api/events)                                                                                            |

Invalid configuration throws `TypeError` during JS resolution. See each option's accepted ranges and the [type reference](/docs/api/types).
