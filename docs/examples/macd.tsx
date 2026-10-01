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

const chartId = 'macd';
const panes: ChartPaneOptions[] = [
  {
    paneId: 'main',
    heightWeight: 3,
    priceScale: { priceScaleId: 'main' },
  },
  {
    paneId: 'macd',
    heightWeight: 1,
    minHeight: 96,
    priceScale: {
      priceScaleId: 'macd',
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
      panesResizable
      additionalSeries={[
        {
          seriesId: 'macd',
          type: 'macd',
          paneId: 'macd',
          priceScaleId: 'macd',
          source: {
            type: 'ohlcvMacd',
            seriesId: 'main',
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            valueSource: 'close',
          },
          appearance: {
            macdLine: { width: 1.5, color: '#2E90F5' },
            signalLine: { width: 1.5, color: '#E5B84B' },
            histogram: {
              positiveIncreasingColor: '#38D98A',
              positiveDecreasingColor: '#38D98A80',
              negativeIncreasingColor: '#FF3B6480',
              negativeDecreasingColor: '#FF3B64',
            },
            textColor: '#9791A5',
            zeroLineColor: '#9791A566',
          },
        },
      ]}
    />
  );
}
