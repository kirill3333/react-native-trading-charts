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

const chartId = 'axes';

export function Example() {
  useEffect(() => {
    TradingCharts.setHistory(chartId, history);
  }, []);

  return (
    <TradingChartsView
      style={{ height: 420 }}
      chartId={chartId}
      xAxis={{ spacing: 'logical', height: 30, timeZone: 'UTC' }}
      yAxis={{
        width: 88,
        scaleMargins: { top: 0.2, bottom: 0.1 },
        valueFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
          currencySymbol: '$',
        },
      }}
      formatters={{
        date: {
          xAxis: { time: 'HH:mm', day: 'd MMM', timeZone: 'UTC' },
          crosshairTimeBadge: { pattern: 'd MMM HH:mm', timeZone: 'UTC' },
        },
        price: {
          tooltip: { type: 'price', precision: 4, currencySymbol: '$' },
        },
      }}
      appearance={{
        xAxis: { text: { fontSize: 11 } },
        yAxis: { text: { fontSize: 12 } },
      }}
    />
  );
}
