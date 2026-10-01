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

const chartId = 'moving-averages';

export function Example() {
  useEffect(() => {
    TradingCharts.setHistory(chartId, history);
  }, []);

  return (
    <TradingChartsView
      style={{ height: 480 }}
      chartId={chartId}
      additionalSeries={[
        {
          seriesId: 'sma-20',
          type: 'line',
          paneId: 'main',
          priceScaleId: 'main',
          source: { type: 'ohlcvSma', seriesId: 'main', period: 20 },
          appearance: { color: '#2E90F5', width: 1.5 },
        },
        {
          seriesId: 'ema-50',
          type: 'line',
          paneId: 'main',
          priceScaleId: 'main',
          source: {
            type: 'ohlcvEma',
            seriesId: 'main',
            period: 50,
            valueSource: 'close',
          },
          appearance: {
            color: '#F5A623',
            width: 2,
            style: 'dashed',
          },
        },
      ]}
    />
  );
}
