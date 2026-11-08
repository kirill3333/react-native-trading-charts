# KDJ

<figure>
  <img src="/assets/kdj.webp" alt="The KDJ pane below the XRP/USDT chart shows K in blue, D in orange and J in purple rising above 100." width="240">
</figure>

KDJ is a single additional series with three lines and one legend. Its pane scales to all visible K, D and J values, including J values below 0 or above 100.

## Calculation

The defaults are `period = 9`, `m1 = 3` and `m2 = 3`. The first candle produces `K = D = J = 50` for every parameter set. From the second candle, H and L are the highest high and lowest low over the available candles up to `period`, including the current candle.

```text
RSV = 100 × (close − L) / (H − L)      (50 when H = L)
K   = previousK + (RSV − previousK) / m1
D   = previousD + (K − previousD) / m1
J   = m2 × K − 2 × D
```

Both smoothing steps use `m1`. The multiplier `m2` applies only to K in the J formula. For example, with `9/2/4` and a second candle closing at the window high, RSV is 100 and the result is **K 75, D 62.5, J 175**. This matches the linked RN implementation. [Reference calculation](https://github.com/hellohublot/native-kline-view/blob/3c7688d/examples/react-native/App.js#L133-L167)

## Configuration

All three parameters accept positive unsigned 32-bit integers. `appearance.kLine`, `dLine` and `jLine` independently accept width, color, style and gradient. Their default colors are blue, orange and purple. The selection event returns one item with `kind: 'kdj'` and `k`, `d`, `j` at the selected timestamp.

Use `main` or another data-backed OHLC series as `source.seriesId`. Changes to the source update the indicator automatically. Give the indicator a dedicated pane and use the same pane and scale identifiers in the series options. Multiple instances of this indicator may share that pane.

The legend follows the crosshair or, without a selection, the last visible main candle. A missing value at that timestamp displays as an em dash. Use `legendVisible` or `TradingCharts.setSeriesLegendVisible` to control the legend. `gapThresholdMs` breaks the lines across time gaps while preserving the calculation history.

## Complete example

<<< ../examples/kdj.tsx
