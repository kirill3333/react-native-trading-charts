import { type ChartMarker, type OhlcCandle } from 'react-native-trading-charts';

/** Example badges on loaded market candles, away from the updating last candle. */
export function buildExampleMarkers(
  candles: ReadonlyArray<OhlcCandle>
): ChartMarker[] {
  const firstIndex = Math.max(0, candles.length - 28);
  const first = candles[firstIndex];
  if (first == null) return [];
  const markers: ChartMarker[] = [
    {
      id: 'example-db',
      metadata: { category: 'entry', label: 'DB' },
      timestamp: first.timestamp,
      text: 'DB',
      position: 'above',
      backgroundColor: '#40B783',
      borderColor: '#237A51',
      borderWidth: 1,
      fontSize: 18,
    },
  ];
  const second = candles[Math.max(firstIndex + 1, candles.length - 12)];
  if (second != null) {
    markers.push({
      id: 'example-m',
      metadata: { category: 'note', label: 'M' },
      timestamp: second.timestamp,
      text: 'M',
      position: 'below',
      backgroundColor: '#328BDD',
      borderColor: '#1459A0',
      borderWidth: 1,
      fontSize: 11,
    });
  }
  if (candles.length > 2) {
    // A lower candle leaves room for the stack within the main plot.
    const stackCandle = candles
      .slice(-24, -1)
      .reduce((lowest, candle) =>
        candle.high < lowest.high ? candle : lowest
      );
    const colors = ['#40B783', '#328BDD', '#B66B08', '#8855CC'];
    colors.forEach((backgroundColor, index) => {
      markers.push({
        id: `example-stack-${index + 1}`,
        metadata: { category: 'stack', index: index + 1 },
        timestamp: stackCandle.timestamp,
        text: String(index + 1),
        position: 'above',
        backgroundColor,
        textColor: '#FFFFFF',
        fontSize: 8,
        paddingHorizontal: 0,
        paddingVertical: 0,
        minWidth: 16,
        minHeight: 16,
        borderRadius: 8,
        offset: 6,
      });
    });
  }
  return markers;
}
