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

const chartId = 'additional-series';

export function Example() {
  useEffect(() => {
    TradingCharts.setHistory(chartId, history);
    TradingCharts.addSeries(chartId, {
      seriesId: 'comparison',
      type: 'line',
      paneId: 'main',
      priceScaleId: 'main',
      source: 'close',
      appearance: { color: '#F5A623', width: 2, style: 'dashed' },
    });
    TradingCharts.setSeriesData(
      chartId,
      'comparison',
      history.map((candle) => ({
        ...candle,
        open: candle.open + 3,
        high: candle.high + 3,
        low: candle.low + 3,
        close: candle.close + 3,
      }))
    );
  }, []);

  return (
    <View>
      <TradingChartsView style={{ height: 420 }} chartId={chartId} />
      <Button
        title="Remove comparison"
        onPress={() => TradingCharts.removeSeries(chartId, 'comparison')}
      />
    </View>
  );
}
