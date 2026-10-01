---
description: 'Draw volume from candle data or supply your own histogram values.'
---

# Volume & histograms

Volume tells you how much traded during each candle. Showing it below price lets users compare price changes with trading activity at the same time. A histogram draws one vertical bar per timestamp, with bar height representing the value.

If your candles include `volume`, the library can derive these bars from the OHLC series. You do not need to keep a second copy of the volume data in JavaScript. For a value you calculate yourself, such as volume delta, supply independent `HistogramPoint` objects instead. Those points can be positive or negative.

Histograms are additional series. Put them in a separate pane when their units differ from price, and give that pane an appropriate number format. The options below cover both derived volume and independent values.

| Property               | Type / values                                             | Default               | Description                                                                                                    |
| ---------------------- | --------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `type`                 | `'histogram'`                                             | Required              | Selects histogram geometry.                                                                                    |
| `source`               | `{ type: 'data' }` or `{ type: 'ohlcvVolume', seriesId }` | `{ type: 'data' }`    | Uses standalone points or derives volume from an OHLC series.                                                  |
| `appearance.color`     | Color                                                     | `theme.axisTextColor` | Color for standalone positive/negative values when directional colors are not selected by derived OHLC volume. |
| `appearance.upColor`   | Color                                                     | `theme.upColor`       | Derived-volume color when source candle closes up.                                                             |
| `appearance.downColor` | Color                                                     | `theme.downColor`     | Derived-volume color when source candle closes down.                                                           |

## Derive volume from candles

The following chart declares both panes and the source series. Updates to main OHLCV data automatically update volume.

<<< ../examples/volume.tsx

## Standalone histogram

Use `source: { type: 'data' }` for independent positive or negative values. These are scalar points, not OHLC candles.

<<< ../examples/histogram.tsx

Histograms are additional series only. A standalone histogram uses `appearance.color`; `upColor` and `downColor` are used for direction from a derived OHLC volume source. Configure pane `valueFormat` with `type: 'volume'` to format volume labels.
