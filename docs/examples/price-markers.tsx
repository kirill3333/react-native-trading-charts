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

const chartId = 'price-markers';

export function Example() {
  useEffect(() => {
    TradingCharts.setHistory(chartId, history);
    TradingCharts.setPriceLine(chartId, {
      id: 'target',
      price: 105,
      label: 'Target',
      color: '#FF9457',
    });
  }, []);

  return (
    <View>
      <TradingChartsView
        style={{ height: 420 }}
        chartId={chartId}
        appearance={{ priceLines: { label: { border: { radius: 6 } } } }}
        onYAxisPress={({ price, paneId }) => {
          if (paneId !== 'main') return;
          TradingCharts.setPriceLine(chartId, {
            id: 'selected-price',
            price,
            label: 'Selected price',
            color: '#2CBFAE',
          });
        }}
      />
      <Button
        title="Update target"
        onPress={() =>
          TradingCharts.setPriceLine(chartId, {
            id: 'target',
            price: 107,
            label: 'Updated target',
            color: '#F5A623',
          })
        }
      />
      <Button
        title="Remove target"
        onPress={() => TradingCharts.removePriceLine(chartId, 'target')}
      />
      <Button
        title="Clear markers"
        onPress={() => TradingCharts.clearPriceLines(chartId)}
      />
    </View>
  );
}
