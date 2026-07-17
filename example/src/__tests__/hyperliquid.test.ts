import { describe, expect, it } from '@jest/globals';

import {
  hyperliquidCandleTopic,
  parseHyperliquidCandleMarketMessage,
  parseHyperliquidCandlesResponse,
  parseHyperliquidTickersResponse,
  parseHyperliquidWebSocketEnvelope,
} from '../hyperliquid';

describe('Hyperliquid market data', () => {
  it('parses active perpetual markets and sorts them by notional volume', () => {
    const tickers = parseHyperliquidTickersResponse([
      {
        universe: [
          { name: 'SOL', maxLeverage: 20 },
          { name: 'xyz:MEME', maxLeverage: 5 },
          { name: 'OLD', maxLeverage: 3, isDelisted: true },
        ],
      },
      [
        { midPx: '150.25', prevDayPx: '145', dayNtlVlm: '5000000' },
        {
          midPx: null,
          markPx: '0.001250',
          prevDayPx: '0.001',
          dayNtlVlm: '9000000',
        },
        { midPx: '1', prevDayPx: '1', dayNtlVlm: '10000000' },
      ],
    ]);

    expect(tickers).toHaveLength(2);
    expect(tickers[0]).toEqual(
      expect.objectContaining({
        provider: 'hyperliquid',
        symbol: 'xyz:MEME',
        baseAsset: 'MEME',
        quoteAsset: 'USD',
        lastPrice: 0.00125,
        precision: 5,
        turnover24h: 9_000_000,
        change24hPercent: 25,
      })
    );
    expect(tickers[0]?.minMove).toBeCloseTo(0.00001, 10);
    expect(tickers[1]?.symbol).toBe('SOL');
  });

  it('sorts history chronologically and maps Hyperliquid candles', () => {
    expect(
      parseHyperliquidCandlesResponse([
        { t: 2_000, o: '11', h: '13', l: '10', c: '12', v: '3' },
        { t: 1_000, o: '10', h: '12', l: '9', c: '11', v: '2' },
      ])
    ).toEqual([
      { timestamp: 1_000, open: 10, high: 12, low: 9, close: 11, volume: 2 },
      {
        timestamp: 2_000,
        open: 11,
        high: 13,
        low: 10,
        close: 12,
        volume: 3,
      },
    ]);
  });

  it('parses subscription acknowledgements for regular and HIP-3 symbols', () => {
    expect(
      parseHyperliquidWebSocketEnvelope(
        JSON.stringify({
          channel: 'subscriptionResponse',
          data: {
            method: 'subscribe',
            subscription: {
              type: 'candle',
              coin: 'xyz:MEME',
              interval: '1m',
            },
          },
        })
      )
    ).toEqual({
      kind: 'subscribed',
      topic: hyperliquidCandleTopic('xyz:MEME', '1m'),
    });
  });

  it('routes live candles and maps them to the chart format', () => {
    const envelope = parseHyperliquidWebSocketEnvelope({
      channel: 'candle',
      data: {
        t: 1_000,
        T: 1_999,
        s: 'SOL',
        i: '1m',
        o: '10',
        h: '12',
        l: '9',
        c: '11',
        v: '2',
        n: 4,
      },
    });

    expect(envelope).toEqual(
      expect.objectContaining({
        kind: 'market',
        topic: hyperliquidCandleTopic('SOL', '1m'),
      })
    );
    if (envelope.kind !== 'market') {
      throw new Error('Expected a market envelope');
    }
    expect(parseHyperliquidCandleMarketMessage(envelope)).toEqual([
      { timestamp: 1_000, open: 10, high: 12, low: 9, close: 11, volume: 2 },
    ]);
  });
});
