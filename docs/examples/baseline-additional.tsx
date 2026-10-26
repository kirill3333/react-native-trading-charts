import { useEffect } from 'react';
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

const chartId = 'baseline-comparison';

export function Example() {
  useEffect(() => {
    TradingCharts.setHistory(chartId, history);
    TradingCharts.addSeries(chartId, {
      type: 'baseline',
      seriesId: 'comparison',
      paneId: 'main',
      priceScaleId: 'main',
      source: 'close',
      baseValue: { type: 'percentage', value: 50 },
      appearance: { width: 2, baseLine: { visible: false } },
    });
    TradingCharts.setSeriesData(chartId, 'comparison', history);
    return () => TradingCharts.removeSeries(chartId, 'comparison');
  }, []);

  return <TradingChartsView style={{ height: 480 }} chartId={chartId} />;
}
