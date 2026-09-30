import { useEffect } from 'react';
import {
  TradingCharts,
  TradingChartsView,
  type OhlcCandle,
  type ChartPaneOptions,
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

const chartId = 'histogram';
const panes: ChartPaneOptions[] = [
  { paneId: 'main', heightWeight: 3, priceScale: { priceScaleId: 'main' } },
  { paneId: 'delta', heightWeight: 1, priceScale: { priceScaleId: 'delta' } },
];

export function Example() {
  useEffect(() => {
    TradingCharts.setHistory(chartId, history);
    TradingCharts.addSeries(chartId, {
      seriesId: 'delta',
      type: 'histogram',
      paneId: 'delta',
      priceScaleId: 'delta',
      source: { type: 'data' },
      appearance: { color: '#8C7CFF' },
    });
    TradingCharts.setSeriesData(
      chartId,
      'delta',
      history.map((candle, index) => ({
        timestamp: candle.timestamp,
        value: Math.sin(index / 5) * 20,
      }))
    );
  }, []);

  return (
    <TradingChartsView
      style={{ height: 480 }}
      chartId={chartId}
      panes={panes}
    />
  );
}
