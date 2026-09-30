---
description: 'Respond to candle selection, visible-range changes and native chart gestures.'
---

# Events

Events tell your React screen what the user is doing inside the native chart. For example, you can load older history when a pan reaches the left edge, update a details panel when a candle is selected, or remember pane heights after the user drags a separator.

Pass a callback prop to `TradingChartsView` for the interaction you need. Callbacks receive plain payload objects, so you can read `event.atStart` or `event.scale` directly. `onSelectedCandleChange` takes the selected candle and additional-series values as two arguments.

The chart avoids sending unchanged values repeatedly. The table lists when each event fires; programmatic commands do not necessarily emit the same events as touch gestures.

| Property                 | Payload                                        | Emission behavior                                                                | Description                                                                       |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `onVisibleRangeChange`   | `VisibleRangeChangeEvent`                      | Visible indexes or total count changed                                           | Reports honest visible candle ranges; suppressed in data gaps.                    |
| `onScaleChange`          | `{ scale }`                                    | User horizontal pinch, at most once per frame                                    | Absolute horizontal scale.                                                        |
| `onYAxisScaleChange`     | `{ scale }`                                    | User main-axis drag, at most once per frame                                      | Absolute main Y scale.                                                            |
| `onPaneResize`           | `PaneResizeEvent`                              | Separator drag                                                                   | Reports both adjacent pane weights.                                               |
| `onPriceScaleChange`     | `PriceScaleChangeEvent`                        | User pane-axis drag                                                              | Reports the affected pane and scale.                                              |
| `onSelectedCandleChange` | `(OhlcCandle \| null, CrosshairSeriesValue[])` | Selected candle or visible additional-series value changed, or selection cleared | Full OHLCV selection plus exact-timestamp series values.                          |
| `onYAxisPress`           | `YAxisPressEvent`                              | Tap inside a visible pane Y-axis                                                 | Reports local layout coordinates, pane/scale IDs, and the exact price at the tap. |

## Event payloads

| Event           | Property                                              | Type      | Description                                                           |
| --------------- | ----------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| Visible range   | `from`, `to`                                          | `number`  | Visible time boundaries in milliseconds.                              |
| Visible range   | `firstVisibleIndex`, `lastVisibleIndex`               | `number`  | Inclusive visible main-series indexes.                                |
| Visible range   | `totalCount`                                          | `number`  | Total main candle count.                                              |
| Visible range   | `atStart`, `atEnd`                                    | `boolean` | Whether the viewport touches a data boundary.                         |
| Scale           | `scale`                                               | `number`  | Absolute scale where `1` is the configured baseline.                  |
| Pane resize     | `firstPaneId`, `secondPaneId`                         | `string`  | Adjacent pane IDs.                                                    |
| Pane resize     | `firstHeightWeight`, `secondHeightWeight`             | `number`  | Current relative weights.                                             |
| Pane resize     | `finished`                                            | `boolean` | Whether the drag has ended.                                           |
| Price scale     | `paneId`, `priceScaleId`                              | `string`  | Changed pane and scale IDs.                                           |
| Price scale     | `scale`                                               | `number`  | Absolute price scale.                                                 |
| Selected candle | `timestamp`, `open`, `high`, `low`, `close`, `volume` | `number`  | Selected OHLCV values exposed as `OhlcCandle`.                        |
| Y-axis press    | `x`, `y`                                              | `number`  | Local React Native layout coordinates (points on iOS, dp on Android). |
| Y-axis press    | `price`                                               | `number`  | Price mapped from the pane's immutable visible range.                 |
| Y-axis press    | `paneId`, `priceScaleId`                              | `string`  | Pane and price scale under the tap.                                   |

Moving within the same unchanged candle does not emit another selection. A
cleared selection emits `null` once. Programmatic `zoom`, `scrollToRealTime`,
`fitContent`, and `setHistory` do not emit gesture scale events.

## Additional-series selection values

The second argument to `onSelectedCandleChange` is a readonly array of `CrosshairSeriesValue`. Narrow on `kind`: `ohlc` carries `candle`; `scalar` carries `value`; `macd` carries `macd`, `signal`, and `histogram`. Every item includes `seriesId`, `paneId`, and `priceScaleId`. Unmatched timestamps and warm-up components return `null`; clearing selection delivers a null candle and an empty array.

Callbacks receive plain payloads, not React Native event wrappers. Do not access `event.nativeEvent`.

## Handle selection

Load history into the view using its `chartId`. This handler checks each item's `kind` before reading its value, then clears the summary when the user dismisses the selection.

<<< ../../examples/events.tsx
