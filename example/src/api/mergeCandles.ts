import { type OhlcCandle } from 'react-native-trading-charts';

export function mergeCandles(
  pages: ReadonlyArray<ReadonlyArray<OhlcCandle>>,
  maxCandles: number
): OhlcCandle[] {
  const byTimestamp = new Map<number, OhlcCandle>();
  pages.forEach((page) =>
    page.forEach((candle) => byTimestamp.set(candle.timestamp, candle))
  );
  return [...byTimestamp.values()]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-maxCandles);
}
