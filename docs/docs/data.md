---
description: 'Load candle history, stream trades and fetch older data as users pan.'
---

# Data & streaming

A chart needs an initial price history, then updates as new market data arrives. This library stores that data in the native chart. Your app fetches it from an API or subscribes to a feed, then sends it to the chart through `TradingCharts`.

Feeds usually provide either candles or individual trades. A candle summarizes an interval with its open, high, low and close prices, plus optional volume (OHLCV). A trade is one executed price and size at a particular time. If your feed already supplies candles, load them with `setHistory` and keep the last candle current with `updateCandle`. If it supplies trades, send them with `updateTrade` or `updateTrades`; the native engine groups them into candles using your chosen [resolution](/docs/time-aggregation).

For example, a one-minute chart can load yesterday's candles once and update the current minute as trades arrive. It can fetch earlier candles when the user pans left. You do not need to send the entire history on every update. Independent histogram values, such as a custom volume delta, use `HistogramPoint` data on an additional series.

## Data shapes

### `OhlcCandle`

One candle summarizes prices over an interval. Use this shape for the main series and any additional series with its own price history. Include volume when your feed supplies it.

| Property    | Type / values                          | Default  | Description                                                                |
| ----------- | -------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `timestamp` | Non-negative safe-integer milliseconds | Required | Candle timestamp. History must be strictly increasing.                     |
| `open`      | Finite number                          | Required | Opening price.                                                             |
| `high`      | Finite number                          | Required | Highest price.                                                             |
| `low`       | Finite number                          | Required | Lowest price.                                                              |
| `close`     | Finite number                          | Required | Closing price.                                                             |
| `volume`    | Finite number                          | `0`      | Traded volume. Native storage cannot distinguish omitted volume from zero. |

### `TradeEvent`

One trade records an executed price, timestamp and optional size. Send this shape when you want the native engine to build candles from individual executions.

| Property    | Type / values                          | Default  | Description                                 |
| ----------- | -------------------------------------- | -------- | ------------------------------------------- |
| `timestamp` | Non-negative safe-integer milliseconds | Required | Trade time; batches must be non-decreasing. |
| `price`     | Finite number                          | Required | Executed trade price.                       |
| `size`      | Finite number                          | `0`      | Executed size added to candle volume.       |

### `HistogramPoint`

A histogram point is one numeric value at a timestamp. Use it for an independent histogram, such as a value your app calculates. Derived volume can read the candle volume directly instead.

| Property    | Type / values                          | Default  | Description                                        |
| ----------- | -------------------------------------- | -------- | -------------------------------------------------- |
| `timestamp` | Non-negative safe-integer milliseconds | Required | Bar timestamp; arrays must be strictly increasing. |
| `value`     | Finite number                          | Required | Positive or negative histogram value.              |

## Loading and updating data

Load history once, then send only the changes your feed produces. `prependHistory` adds older candles during pagination. The series-data methods perform the corresponding operations on an additional series.

| Method              | Arguments                     | Returns | Description                                                               |
| ------------------- | ----------------------------- | ------- | ------------------------------------------------------------------------- |
| `setHistory`        | `chartId, OhlcCandle[]`       | `void`  | Replaces main history and restores configured initial scales.             |
| `prependHistory`    | `chartId, OhlcCandle[]`       | `void`  | Prepends older, strictly ordered main history.                            |
| `updateCandle`      | `chartId, OhlcCandle`         | `void`  | Replaces the last candle at the same timestamp or appends a newer candle. |
| `updateTrade`       | `chartId, TradeEvent`         | `void`  | Aggregates one raw trade using the configured resolution.                 |
| `updateTrades`      | `chartId, TradeEvent[]`       | `void`  | Aggregates a non-decreasing batch in one native call.                     |
| `setSeriesData`     | `chartId, seriesId, points[]` | `void`  | Replaces an additional series data set.                                   |
| `prependSeriesData` | `chartId, seriesId, points[]` | `void`  | Prepends older additional-series data.                                    |
| `updateSeriesData`  | `chartId, seriesId, point`    | `void`  | Replaces the last point or appends a newer one.                           |

Ready candles keep their feed-provided timestamps; they are not forced onto raw
trade buckets. `setHistory` and `prependHistory` require strictly increasing
timestamps. Trade batches allow equal timestamps but not decreasing ones.
The engine does not create candles for intervals with no trades. It ignores
trades older than the current aggregation bucket.

## Candle updates

A candle can change while its interval is still open. Send the full replacement with the same timestamp; when the next interval starts, send a later timestamp to append it.

<<< ../examples/data-commands.ts

All prices must be finite; `high >= max(open, close)` and `low <= min(open, close)`. Optional volume and trade size must be finite and non-negative. Use the same data shape for every point in an array; do not mix OHLC candles and histogram points. Validation errors throw `TypeError` in JavaScript.

## Stream raw trades

Pass your feed subscription to this component. It adds each incoming trade to the batcher and unsubscribes when the component unmounts. Keep the `history` array and `subscribe` function stable between renders so the effect does not keep replacing history and restarting the subscription.

<<< ../examples/streaming.tsx

## Load older history

Fetch strictly older candles when the viewport reaches the left boundary. Guard concurrent requests and stop after an empty page. This example reads the actual first stored candle before requesting a page; `event.from` is a viewport boundary, not a pagination cursor.

Keep `chartId` and `initialHistory` stable for this component's lifetime. Remount it with a new React `key` when switching instruments so pending work cannot update the next chart.

<<< ../examples/history.tsx

A data gap suppresses visible-range events. An empty chart therefore needs its initial history loaded independently of these events. A failed request can be retried without overlapping another request.

## Read and clear

`getCandles` returns a copy of the main candle history captured at a single point in time. `clear` removes market data while preserving custom price markers. Read methods require a mounted chart; write commands sent before mount wait in a queue with a size limit. A queued `setHistory` replaces older queued work, and the oldest streaming commands may be dropped when the queue is full.
