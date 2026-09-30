import { useEffect } from 'react';
import {
  createTradeBatcher,
  TradingCharts,
  TradingChartsView,
  type OhlcCandle,
  type TradeEvent,
} from 'react-native-trading-charts';

type Props = {
  chartId: string;
  history: readonly OhlcCandle[];
  // Your feed adapter returns its unsubscribe function.
  subscribe: (onTrade: (trade: TradeEvent) => void) => () => void;
};

export function StreamingChart({ chartId, history, subscribe }: Props) {
  useEffect(() => {
    TradingCharts.setHistory(chartId, history);
    const batcher = createTradeBatcher(chartId, { intervalMs: 32 });
    const unsubscribe = subscribe((trade) => batcher.add(trade));
    return () => {
      unsubscribe();
      batcher.dispose();
    };
  }, [chartId, history, subscribe]);

  return (
    <TradingChartsView
      style={{ height: 420 }}
      chartId={chartId}
      resolution={{ unit: 'minute' }}
    />
  );
}
