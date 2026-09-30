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

const chartId = 'styling';

export function Example() {
  useEffect(() => {
    TradingCharts.setHistory(chartId, history);
  }, []);

  return (
    <TradingChartsView
      style={{ height: 420 }}
      chartId={chartId}
      theme={{
        backgroundColor: '#FFFFFF',
        gridColor: '#E2E8F0',
        axisTextColor: '#475569',
        upColor: '#009E73',
        downColor: '#E64966',
        crosshairColor: '#64748B',
        tooltipBackgroundColor: '#FFFFFF',
        tooltipTextColor: '#0F172A',
      }}
      appearance={{
        candles: { radius: 2 },
        grid: { opacity: 0.5 },
        yAxis: { text: { fontSize: 12, fontWeight: 'medium' } },
        tooltip: { border: { color: '#CBD5E1', width: 1, radius: 10 } },
        crosshair: { priceLabel: { text: { color: '#FFFFFF' } } },
      }}
      yAxis={{ width: 80 }}
    />
  );
}
