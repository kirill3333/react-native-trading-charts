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
      xAxis={{ locale: 'en-GB', timeZone: 'UTC', spacing: 'time' }}
      yAxis={{
        position: 'right',
        scaleMargins: { top: 0.2, bottom: 0.1 },
        valueFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
          locale: 'en-GB',
        },
      }}
      gestures={{ pan: true, zoom: true }}
      currentPrice={{ visible: true, showLabel: true, pinToEdge: true }}
      crosshair={{ enabled: true, showTooltip: true }}
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

// Programmatic zoom is anchored to the right edge of the visible range.
// Values greater than 1 zoom in; values between 0 and 1 zoom out.
TradingCharts.zoom('btc-1m', 1.25);

// Show the complete loaded history and restore automatic Y scaling.
TradingCharts.fitContent('btc-1m');
```

`chartId` must be unique and stable while the view is mounted. Calls made before
mount are retained by the native registry and replayed when that chart registers.
The library does not open a WebSocket; networking and reconnect logic stay in the
application.

Raw trades must be ordered by non-decreasing millisecond timestamp. Empty time
buckets are not synthesized. A trade in the final history bucket continues that
candle; an older trade is ignored with a development warning.

`xAxis.spacing` defaults to `'time'`, where horizontal distance represents
elapsed time. Use `'logical'` to give every candle one uniform slot regardless
of timestamp gaps. Logical spacing keeps timestamps for axis labels and the
crosshair while pan, zoom and live following operate by candle index.

`currentPrice.pinToEdge` defaults to `true`. When the latest price is outside
the visible Y range, its line and label stay pinned to the upper or lower plot
edge. Set `currentPrice={{ pinToEdge: false }}` to hide the indicator while its
price is outside the range. `showLabel: false` hides only the label.

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

`scaleMargins` reserves a fraction of the plot above and below the visible price
range. Both values must be non-negative and their sum must be less than `1`.
Defaults are `top: 0.2` and `bottom: 0.1`. When all visible values are equal,
autoscale expands the range using `minMove`, so pass the instrument's real tick
size instead of deriving it from the latest price.

With `gestures.zoom` enabled, pinch gestures scale the visible time range and a
one-finger vertical drag that starts on the Y axis scales the visible price
range. Drag up to narrow the range or down to expand it. The selected Y scale is
preserved while autoscale follows the visible candles; double-tap the chart to
reset both axes to their default viewport and autoscale.

`TradingCharts.zoom(chartId, scale)` provides the same horizontal scaling from
application controls, anchored to the right edge of the current viewport. A
scale greater than `1` zooms in and a scale between `0` and `1` zooms out.
`TradingCharts.fitContent(chartId)` shows the full loaded history and restores
automatic Y scaling. These programmatic commands work even when
`gestures.zoom` is disabled; the option controls touch gestures only.

With `gestures.pan` enabled, a quick horizontal swipe continues scrolling with
native momentum and slows to a stop at the beginning or end of the data.

The same native formatter is used for Y ticks, the live-price badge, crosshair
badge and OHLC tooltip. X labels adapt to the visible time span and use the
configured native locale and timezone.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
