import { describe, expect, it } from '@jest/globals';
import { type OhlcCandle } from 'react-native-trading-charts';
import { buildExampleMarkers } from '../chartMarkers';

const candles: OhlcCandle[] = Array.from({ length: 48 }, (_, index) => ({
  timestamp: 1_750_032_000_000 + index * 60_000,
  open: 100,
  high: 102,
  low: 99,
  close: 101,
}));

describe('markers on market charts', () => {
  it('anchors different sizes and a circular stack to loaded candles', () => {
    const markers = buildExampleMarkers(candles);
    expect(markers.slice(0, 2)).toMatchObject([
      {
        text: 'DB',
        timestamp: candles[20]!.timestamp,
        position: 'above',
        fontSize: 18,
      },
      {
        text: 'M',
        timestamp: candles[36]!.timestamp,
        position: 'below',
        fontSize: 11,
      },
    ]);
    expect(new Set(markers.map((marker) => marker.id)).size).toBe(11);
    const stack = markers.slice(2, 7);
    expect(stack[0]).toMatchObject({
      id: 'example-buy',
      timestamp: candles[24]!.timestamp,
      variant: 'buy',
      position: 'above',
      backgroundColor: '#16A34A',
    });
    const glyphStack = stack.slice(1);
    expect(glyphStack.map((marker) => marker.text)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    for (const marker of glyphStack) {
      expect(marker).toMatchObject({
        timestamp: candles[24]!.timestamp,
        position: 'above',
        fontSize: 8,
        minWidth: 16,
        minHeight: 16,
        borderRadius: 8,
      });
    }
    expect(markers.slice(7)).toMatchObject([
      {
        id: 'example-sell',
        timestamp: candles[26]!.timestamp,
        variant: 'sell',
        position: 'below',
        backgroundColor: '#DC2626',
      },
      {
        id: 'example-signal',
        timestamp: candles[31]!.timestamp,
        variant: 'signal',
        position: 'above',
        backgroundColor: '#4F46E5',
      },
      {
        id: 'example-arrow',
        timestamp: candles[37]!.timestamp,
        variant: 'arrow',
        position: 'above',
        backgroundColor: '#0EA5E9',
      },
      {
        id: 'example-image',
        timestamp: candles[41]!.timestamp,
        variant: 'image',
        position: 'below',
        backgroundColor: '#F59E0B',
      },
    ]);
  });

  it('handles empty or short history without inventing timestamps', () => {
    expect(buildExampleMarkers([])).toEqual([]);
    expect(buildExampleMarkers(candles.slice(0, 1))).toHaveLength(1);
    expect(
      buildExampleMarkers(candles.slice(0, 2)).map((marker) => marker.timestamp)
    ).toEqual(candles.slice(0, 2).map((candle) => candle.timestamp));
  });
});
