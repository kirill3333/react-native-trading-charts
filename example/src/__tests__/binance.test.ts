import { describe, expect, it } from '@jest/globals';

import {
  BINANCE_INTERVALS,
  klineTopic,
  mergeTickersWithInstruments,
  parseBinanceWebSocketEnvelope,
  parseInstrumentsResponse,
  parseKlineResponse,
  parseKlineWebSocketMessage,
  parseTickersResponse,
} from '../api/binance';

describe('Binance Spot parsing', () => {
  it('keeps USDT tickers, uses percent values and sorts by quote volume', () => {
    const tickers = parseTickersResponse([
      {
        symbol: 'BTCUSDT',
        lastPrice: '64614.8',
        priceChangePercent: '4.31',
        quoteVolume: '500000000',
      },
      {
        symbol: 'ETHUSDT',
        lastPrice: '3500.00',
        priceChangePercent: '-2.5',
        quoteVolume: '900000000',
      },
      {
        symbol: 'BTCUSDC',
        lastPrice: '64610.1',
        priceChangePercent: '4',
        quoteVolume: '1000000000',
      },
    ]);

    expect(tickers.map((ticker) => ticker.symbol)).toEqual([
      'ETHUSDT',
      'BTCUSDT',
    ]);
    expect(tickers[0]).toMatchObject({
      lastPrice: 3500,
      change24hPercent: -2.5,
    });
  });

  it('extracts price precision from the Binance PRICE_FILTER', () => {
    const instruments = parseInstrumentsResponse({
      symbols: [
        {
          symbol: 'BTCUSDT',
          status: 'TRADING',
          quoteAsset: 'USDT',
          isSpotTradingAllowed: true,
          filters: [
            { filterType: 'LOT_SIZE', stepSize: '0.00001000' },
            { filterType: 'PRICE_FILTER', tickSize: '0.01000000' },
          ],
        },
        {
          symbol: 'OLDUSDT',
          status: 'BREAK',
          quoteAsset: 'USDT',
          filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.10000000' }],
        },
      ],
    });

    expect(instruments).toEqual([
      { symbol: 'BTCUSDT', precision: 2, minMove: 0.01 },
    ]);
  });

  it('omits ticker rows without matching trading metadata', () => {
    const tickers = parseTickersResponse([
      {
        symbol: 'BTCUSDT',
        lastPrice: '10',
        priceChangePercent: '1',
        quoteVolume: '100',
      },
      {
        symbol: 'MISSINGUSDT',
        lastPrice: '1',
        priceChangePercent: '0',
        quoteVolume: '50',
      },
    ]);
    expect(
      mergeTickersWithInstruments(tickers, [
        { symbol: 'BTCUSDT', precision: 2, minMove: 0.01 },
      ])
    ).toEqual([expect.objectContaining({ symbol: 'BTCUSDT', precision: 2 })]);
  });
});

describe('Binance native klines', () => {
  it('parses already-ascending REST klines without reversing them', () => {
    const candles = parseKlineResponse([
      [1_000, '10', '12', '9', '11', '2'],
      [2_000, '11', '13', '10', '12', '3'],
    ]);
    expect(candles).toEqual([
      { timestamp: 1_000, open: 10, high: 12, low: 9, close: 11, volume: 2 },
      { timestamp: 2_000, open: 11, high: 13, low: 10, close: 12, volume: 3 },
    ]);
  });

  it('supports native 1s in both REST configuration and stream topics', () => {
    expect(BINANCE_INTERVALS[0]).toEqual({
      value: '1s',
      label: '1s',
      resolution: { unit: 'second' },
    });
    expect(klineTopic('BTCUSDT', '1s')).toBe('btcusdt@kline_1s');
  });

  it('parses a Binance kline stream update as OHLC data', () => {
    const raw = JSON.stringify({
      e: 'kline',
      s: 'BTCUSDT',
      k: {
        t: 1_000,
        i: '1s',
        o: '10',
        h: '12',
        l: '9',
        c: '11',
        v: '2.5',
      },
    });
    expect(parseBinanceWebSocketEnvelope(raw)).toMatchObject({
      kind: 'market',
      topic: 'btcusdt@kline_1s',
    });
    expect(parseKlineWebSocketMessage(raw, 'btcusdt@kline_1s')).toEqual([
      {
        timestamp: 1_000,
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 2.5,
      },
    ]);
  });

  it('recognizes subscription acknowledgements and errors', () => {
    expect(
      parseBinanceWebSocketEnvelope(
        JSON.stringify({ result: null, id: 'sub-1' })
      )
    ).toEqual({ kind: 'subscribed', requestId: 'sub-1' });
    expect(
      parseBinanceWebSocketEnvelope(
        JSON.stringify({ code: 2, msg: 'Invalid request', id: 4 })
      )
    ).toEqual({
      kind: 'error',
      requestId: '4',
      message: 'Invalid request',
    });
  });
});
