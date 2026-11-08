# Williams %R

<figure>
  <img src="/assets/williams-r.webp" alt="Williams %R below the XRP/USDT chart, with dashed reference levels at −80 and −20." width="240">
</figure>

Williams %R measures where the close falls within the recent trading range. A close at the window high gives 0 and a close at the low gives −100. The pane keeps these endpoints fixed during vertical gestures.

## Calculation

The default period is 14 candles, including the current candle. Let H be the highest high and L the lowest low in the window. The formula is `−100 × (H − close) / (H − L)`. The first value appears on candle number `period`. A full window with H = L yields −50. During warm-up the line has no points and the selected scalar value is `null`. [Williams %R formula](https://www.tradingview.com/support/solutions/43000501985-williams-r-r/)

## Configuration

Set `levels.oversold` and `levels.overbought` to change the reference lines. They default to −80 and −20 and must satisfy `−100 ≤ oversold < overbought ≤ 0`. The appearance accepts line width, color, style and gradient, plus `levelLineColor`, `bandColor` and `textColor`. Set `source.period` to a positive unsigned 32-bit integer.

Use `main` or another data-backed OHLC series as `source.seriesId`. Changes to the source update the indicator automatically. Give the indicator a dedicated pane and use the same pane and scale identifiers in the series options. Multiple instances of this indicator may share that pane.

The legend follows the crosshair or, without a selection, the last visible main candle. A missing value at that timestamp displays as an em dash. Use `legendVisible` or `TradingCharts.setSeriesLegendVisible` to control the legend. `gapThresholdMs` breaks the lines across time gaps while preserving the calculation history.

## Complete example

<<< ../examples/williams-r.tsx
