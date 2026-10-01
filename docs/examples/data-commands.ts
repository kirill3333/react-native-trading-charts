import { TradingCharts, type OhlcCandle } from 'react-native-trading-charts';

export function loadAndUpdate(chartId: string) {
  const candle: OhlcCandle = {
    timestamp: 1_720_000_000_000,
    open: 100,
    high: 104,
    low: 99,
    close: 102,
    volume: 12,
  };
  TradingCharts.setHistory(chartId, [candle]);
  // The same timestamp replaces the last candle, including its volume.
  TradingCharts.updateCandle(chartId, {
    ...candle,
    high: 106,
    close: 105,
    volume: 15,
  });
  // A later timestamp appends a candle.
  TradingCharts.updateCandle(chartId, {
    ...candle,
    timestamp: candle.timestamp + 60_000,
  });
}
