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

const chartId = 'kdj';
const panes: ChartPaneOptions[] = [
  {
    paneId: 'main',
    heightWeight: 3,
    priceScale: { priceScaleId: 'main' },
  },
  {
    paneId: 'kdj',
    heightWeight: 1,
    minHeight: 96,
    priceScale: {
      priceScaleId: 'kdj',
      valueFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
        useGrouping: false,
      },
    },
  },
];

export function Example() {
  useEffect(() => {
    TradingCharts.setHistory(chartId, history);
  }, []);

  return (
    <TradingChartsView
      style={{ height: 480 }}
      chartId={chartId}
      panes={panes}
      additionalSeries={[
        {
          seriesId: 'kdj',
          type: 'kdj',
          paneId: 'kdj',
          priceScaleId: 'kdj',
          source: {
            type: 'ohlcvKdj',
            seriesId: 'main',
            period: 9,
            m1: 2,
            m2: 4,
          },
          appearance: {
            kLine: { color: '#2E90F5' },
            dLine: { color: '#F5A623', style: 'dashed' },
            jLine: { color: '#AB75FA', width: 1.5 },
          },
        },
      ]}
    />
  );
}
