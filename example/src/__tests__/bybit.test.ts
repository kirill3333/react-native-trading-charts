import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  BYBIT_INTERVALS,
  BybitNoDataError,
  fetchSpotKlinesWithRetry,
  klineTopic,
  mergeTickersWithInstruments,
  parseBybitWebSocketEnvelope,
  parseIdentifiedRecentTradesResponse,
  parseInstrumentsResponse,
  parseKlineResponse,
  parseKlineWebSocketMessage,
  parseRecentTradesResponse,
  parseTickersResponse,
  parseTradeMarketMessage,
  parseTradeWebSocketMessage,
  tradeTopic,
} from '../bybit';

afterEach(() => {
  jest.restoreAllMocks();
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as Response;
}

describe('Bybit ticker parsing', () => {
  it('keeps USDT pairs, converts change to percent and sorts by turnover', () => {
    const tickers = parseTickersResponse({
      retCode: 0,
      retMsg: 'OK',
      result: {
        list: [
          {
            symbol: 'BTCUSDT',
            lastPrice: '64614.8',
            price24hPcnt: '0.0431',
            turnover24h: '500000000',
          },
          {
            symbol: 'ETHUSDT',
            lastPrice: '3500.00',
            price24hPcnt: '-0.025',
            turnover24h: '900000000',
          },
          {
            symbol: 'BTCUSDC',
            lastPrice: '64610.1',
            price24hPcnt: '0.04',
            turnover24h: '1000000000',
          },
        ],
      },
    });

    expect(tickers.map((ticker) => ticker.symbol)).toEqual([
      'ETHUSDT',
      'BTCUSDT',
    ]);
    expect(tickers[0]).toMatchObject({
      lastPrice: 3500,
      change24hPercent: -2.5,
    });
    expect(tickers[1]).toMatchObject({
      lastPrice: 64614.8,
      change24hPercent: 4.31,
    });
  });

  it('rejects a Bybit business error', () => {
    expect(() =>
      parseTickersResponse({
        retCode: 10001,
        retMsg: 'Invalid request',
        result: {},
      })
    ).toThrow('Bybit API error 10001: Invalid request');
  });

  it('uses instrument tickSize instead of lastPrice formatting', () => {
    const tickers = parseTickersResponse({
      retCode: 0,
      result: {
        list: [
          {
            symbol: 'HYPEUSDT',
            lastPrice: '65',
            price24hPcnt: '0.01',
            turnover24h: '300',
          },
          {
            symbol: 'USDCUSDT',
            lastPrice: '1.0004',
            price24hPcnt: '-0.0003',
            turnover24h: '200',
          },
          {
            symbol: 'ODDUSDT',
            lastPrice: '0.01',
            price24hPcnt: '0',
            turnover24h: '100',
          },
        ],
      },
    });
    const instruments = parseInstrumentsResponse({
      retCode: 0,
      result: {
        list: [
          {
            symbol: 'HYPEUSDT',
            quoteCoin: 'USDT',
            status: 'Trading',
            priceFilter: { tickSize: '0.01' },
          },
          {
            symbol: 'USDCUSDT',
            quoteCoin: 'USDT',
            status: 'Trading',
            priceFilter: { tickSize: '0.0001' },
          },
          {
            symbol: 'ODDUSDT',
            quoteCoin: 'USDT',
            status: 'Trading',
            priceFilter: { tickSize: '0.0005' },
          },
        ],
      },
    });

    expect(mergeTickersWithInstruments(tickers, instruments)).toEqual([
      expect.objectContaining({
        symbol: 'HYPEUSDT',
        precision: 2,
        minMove: 0.01,
      }),
      expect.objectContaining({
        symbol: 'USDCUSDT',
        precision: 4,
        minMove: 0.0001,
      }),
      expect.objectContaining({
        symbol: 'ODDUSDT',
        precision: 4,
        minMove: 0.0005,
      }),
    ]);
  });

  it('omits tickers without valid trading metadata', () => {
    const tickers = parseTickersResponse({
      retCode: 0,
      result: {
        list: [
          {
            symbol: 'GOODUSDT',
            lastPrice: '1',
            price24hPcnt: '0',
            turnover24h: '2',
          },
          {
            symbol: 'MISSINGUSDT',
            lastPrice: '1',
            price24hPcnt: '0',
            turnover24h: '1',
          },
        ],
      },
    });
    const instruments = parseInstrumentsResponse({
      retCode: 0,
      result: {
        list: [
          {
            symbol: 'GOODUSDT',
            quoteCoin: 'USDT',
            status: 'Trading',
            priceFilter: { tickSize: '0.1' },
          },
          {
            symbol: 'BADUSDT',
            quoteCoin: 'USDT',
            status: 'Trading',
            priceFilter: { tickSize: 'not-a-number' },
          },
          {
            symbol: 'PAUSEDUSDT',
            quoteCoin: 'USDT',
            status: 'PreLaunch',
            priceFilter: { tickSize: '0.1' },
          },
        ],
      },
    });

    expect(mergeTickersWithInstruments(tickers, instruments)).toEqual([
      expect.objectContaining({ symbol: 'GOODUSDT', minMove: 0.1 }),
    ]);
  });
});

describe('Bybit kline parsing', () => {
  it('converts reverse chronological REST rows to ascending OHLCV', () => {
    const candles = parseKlineResponse({
      retCode: 0,
      retMsg: 'OK',
      result: {
        list: [
          ['120000', '11', '14', '10', '13', '8', '100'],
          ['60000', '10', '12', '9', '11', '5', '50'],
        ],
      },
    });

    expect(candles).toEqual([
      {
        timestamp: 60_000,
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 5,
      },
      {
        timestamp: 120_000,
        open: 11,
        high: 14,
        low: 10,
        close: 13,
        volume: 8,
      },
    ]);
  });

  it('rejects malformed numbers and invalid OHLC bounds', () => {
    expect(() =>
      parseKlineResponse({
        retCode: 0,
        result: {
          list: [['60000', 'not-a-price', '12', '9', '11', '5']],
        },
      })
    ).toThrow('must be a finite number');

    expect(() =>
      parseKlineResponse({
        retCode: 0,
        result: {
          list: [['60000', '10', '10', '9', '11', '5']],
        },
      })
    ).toThrow('invalid OHLC bounds');
  });
});

describe('Bybit timeframe configuration', () => {
  it('includes second, six-hour, twelve-hour and daily examples', () => {
    expect(
      BYBIT_INTERVALS.map(({ label, timeframeMs }) => [label, timeframeMs])
    ).toEqual(
      expect.arrayContaining([
        ['1s', 1_000],
        ['6h', 6 * 60 * 60_000],
        ['12h', 12 * 60 * 60_000],
        ['1d', 24 * 60 * 60_000],
      ])
    );
  });
});

describe('Bybit trade parsing', () => {
  it('converts recent trades to chronological chart events', () => {
    expect(
      parseRecentTradesResponse({
        retCode: 0,
        result: {
          list: [
            { time: '2100', price: '11', size: '0.2' },
            { time: '1100', price: '10', size: '0.1' },
          ],
        },
      })
    ).toEqual([
      { timestamp: 1100, price: 10, size: 0.1 },
      { timestamp: 2100, price: 11, size: 0.2 },
    ]);
  });

  it('converts public trade messages to chart events', () => {
    const topic = tradeTopic('BTCUSDT');
    expect(
      parseTradeWebSocketMessage(
        JSON.stringify({
          topic,
          data: [
            {
              T: 1672304486865,
              p: '16578.50',
              v: '0.001',
              i: 'trade-1',
              seq: 42,
            },
          ],
        }),
        topic
      )
    ).toEqual([{ timestamp: 1672304486865, price: 16578.5, size: 0.001 }]);
  });

  it('keeps REST and WebSocket identifiers for exact deduplication', () => {
    const recent = parseIdentifiedRecentTradesResponse({
      retCode: 0,
      result: {
        list: [
          {
            execId: 'trade-2',
            seq: '43',
            time: '2100',
            price: '11',
            size: '0.2',
          },
        ],
      },
    });
    const envelope = parseBybitWebSocketEnvelope(
      JSON.stringify({
        topic: tradeTopic('BTCUSDT'),
        data: [{ i: 'trade-2', seq: 43, T: 2100, p: '11', v: '0.2' }],
      })
    );

    expect(recent[0]?.id).toBe('trade-2');
    expect(envelope.kind).toBe('market');
    if (envelope.kind === 'market') {
      expect(parseTradeMarketMessage(envelope)[0]).toMatchObject({
        id: 'trade-2',
        sequence: '43',
      });
    }
  });
});

describe('Bybit kline loading', () => {
  it('retries empty history and returns candles from a later attempt', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { list: [] } }))
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { list: [] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          retCode: 0,
          result: {
            list: [['60000', '10', '12', '9', '11', '5']],
          },
        })
      );

    await expect(
      fetchSpotKlinesWithRetry('BTCUSDT', '1', {
        attempts: 3,
        baseDelayMs: 0,
      })
    ).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports no data after all automatic attempts are empty', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        retCode: 0,
        result: { list: [] },
      })
    );

    await expect(
      fetchSpotKlinesWithRetry('HYPEUSDT', '1', {
        attempts: 3,
        baseDelayMs: 0,
      })
    ).rejects.toBeInstanceOf(BybitNoDataError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('Bybit WebSocket parsing', () => {
  const topic = klineTopic('BTCUSDT', '5');

  it('converts a kline snapshot to an OHLCV candle', () => {
    const candles = parseKlineWebSocketMessage(
      JSON.stringify({
        topic,
        type: 'snapshot',
        data: [
          {
            start: 1672324800000,
            end: 1672325099999,
            interval: '5',
            open: '16649.5',
            close: '16677',
            high: '16677',
            low: '16608',
            volume: '2.081',
            confirm: false,
          },
        ],
      }),
      topic
    );

    expect(candles).toEqual([
      {
        timestamp: 1672324800000,
        open: 16649.5,
        high: 16677,
        low: 16608,
        close: 16677,
        volume: 2.081,
      },
    ]);
  });

  it('ignores control, pong and unrelated topic messages', () => {
    expect(
      parseKlineWebSocketMessage(
        JSON.stringify({ success: true, op: 'subscribe' }),
        topic
      )
    ).toEqual([]);
    expect(
      parseKlineWebSocketMessage(
        JSON.stringify({ success: true, op: 'ping' }),
        topic
      )
    ).toEqual([]);
    expect(
      parseKlineWebSocketMessage(
        JSON.stringify({ topic: 'kline.5.ETHUSDT', data: [] }),
        topic
      )
    ).toEqual([]);
  });

  it('classifies subscribe acknowledgements, pong and control errors', () => {
    expect(
      parseBybitWebSocketEnvelope(
        JSON.stringify({ success: true, op: 'subscribe', req_id: 'sub-1' })
      )
    ).toEqual({ kind: 'subscribed', requestId: 'sub-1' });
    expect(
      parseBybitWebSocketEnvelope(
        JSON.stringify({
          success: true,
          op: 'ping',
          ret_msg: 'pong',
          req_id: 'ping-1',
        })
      )
    ).toEqual({ kind: 'pong', requestId: 'ping-1' });
    expect(
      parseBybitWebSocketEnvelope(
        JSON.stringify({
          success: false,
          op: 'subscribe',
          ret_msg: 'invalid topic',
          req_id: 'sub-2',
        })
      )
    ).toEqual({
      kind: 'error',
      requestId: 'sub-2',
      message: 'invalid topic',
    });
    expect(() => parseBybitWebSocketEnvelope('{')).toThrow('valid JSON');
    expect(() =>
      parseBybitWebSocketEnvelope(
        JSON.stringify({ topic, data: { invalid: true } })
      )
    ).toThrow('message.data');
  });
});
