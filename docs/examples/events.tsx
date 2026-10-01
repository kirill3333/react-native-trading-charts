import { useState } from 'react';
import { Text, View } from 'react-native';
import { TradingChartsView } from 'react-native-trading-charts';

export function SelectionSummary({ chartId }: { chartId: string }) {
  const [summary, setSummary] = useState('Tap a candle');
  return (
    <View>
      <TradingChartsView
        style={{ height: 420 }}
        chartId={chartId}
        onSelectedCandleChange={(candle, values) => {
          if (!candle) {
            setSummary('Tap a candle');
            return;
          }
          const selected = values.map((item) => {
            switch (item.kind) {
              case 'ohlc':
                return `${item.seriesId}: ${item.candle?.close ?? '—'}`;
              case 'scalar':
                return `${item.seriesId}: ${item.value ?? '—'}`;
              case 'macd':
                return `${item.seriesId}: ${item.macd ?? '—'}`;
            }
          });
          setSummary([`Close: ${candle.close}`, ...selected].join(' · '));
        }}
      />
      <Text>{summary}</Text>
    </View>
  );
}
