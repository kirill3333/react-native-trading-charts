import { useEffect } from 'react';
import { Button, View } from 'react-native';
import {
  TradingCharts,
  TradingChartsView,
  type OhlcCandle,
} from 'react-native-trading-charts';

// Deterministic sample data. Replace this with your market-data feed.
const history: OhlcCandle[] = Array.from({ length: 80 }, (_, index) => {
  const open = 100 + Math.sin(index / 5) * 8;
  const close = 100 + Math.sin((index + 1) / 5) * 8;
  return {
    timestamp: 1_720_000_000_000 + index * 60_000,
    open,
    high: Math.max(open, close) + 2,
    low: Math.min(open, close) - 2,
    close,
    volume: 10 + index,
  };
});

const chartId = 'gestures';

export function Example() {
  useEffect(() => {
    TradingCharts.setHistory(chartId, history);
  }, []);

  return (
    <View>
      <TradingChartsView
        style={{ height: 420 }}
        chartId={chartId}
        initialVisibleCount={40}
        defaultScale={1}
        gestures={{ pan: true, zoom: true, yAxisScale: true }}
        yAxis={{ defaultScale: 1 }}
      />
      <Button title="Zoom in" onPress={() => TradingCharts.zoom(chartId, 2)} />
      <Button
        title="Latest data"
        onPress={() => TradingCharts.scrollToRealTime(chartId)}
      />
      <Button
        title="Fit all"
        onPress={() => TradingCharts.fitContent(chartId)}
      />
    </View>
  );
}
