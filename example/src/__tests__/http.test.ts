import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type AxiosResponse,
} from 'axios';

import { fetchSpotKlines } from '../binance';
import { fetchHyperliquidCandles } from '../hyperliquid';
import {
  binanceHttp,
  hyperliquidHttp,
  MarketHttpError,
  queryRetryDelay,
  shouldRetryQuery,
} from '../http';

function response<TPayload>(
  data: TPayload,
  status = 200
): AxiosResponse<TPayload> {
  return {
    data,
    status,
    statusText: String(status),
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('market HTTP clients', () => {
  it('passes TanStack cancellation and pagination to Binance Axios', async () => {
    const request = jest
      .spyOn(binanceHttp, 'request')
      .mockResolvedValue(response([[1_000, '10', '11', '9', '10.5', '2']]));
    const controller = new AbortController();

    await expect(
      fetchSpotKlines('BTCUSDT', '1s', controller.signal, 2_000)
    ).resolves.toEqual([
      {
        timestamp: 1_000,
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        volume: 2,
      },
    ]);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        signal: controller.signal,
        url: expect.stringContaining('interval=1s'),
      })
    );
    expect(request.mock.calls[0]?.[0].url).toContain('endTime=1999');
  });

  it('sends Hyperliquid candle snapshots through the shared Axios client', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(100_000_000);
    const request = jest
      .spyOn(hyperliquidHttp, 'request')
      .mockResolvedValue(
        response([{ t: 1_000, o: '10', h: '11', l: '9', c: '10', v: '2' }])
      );

    await expect(fetchHyperliquidCandles('SOL', '1m')).resolves.toHaveLength(1);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/info',
        data: expect.objectContaining({
          type: 'candleSnapshot',
          req: expect.objectContaining({ coin: 'SOL', interval: '1m' }),
        }),
      })
    );
  });

  it('retries only transport, timeout, rate-limit and server failures', () => {
    const serverError = new MarketHttpError(
      'Binance request failed with HTTP 503',
      { cause: new Error('server'), retryable: true, status: 503 }
    );
    const clientError = new MarketHttpError(
      'Binance request failed with HTTP 400',
      { cause: new Error('client'), retryable: false, status: 400 }
    );

    expect(shouldRetryQuery(0, serverError)).toBe(true);
    expect(shouldRetryQuery(1, serverError)).toBe(true);
    expect(shouldRetryQuery(2, serverError)).toBe(false);
    expect(shouldRetryQuery(0, clientError)).toBe(false);
    expect(shouldRetryQuery(0, new CanceledError())).toBe(false);
    expect(queryRetryDelay(0)).toBe(750);
    expect(queryRetryDelay(2)).toBe(3_000);
  });

  it('maps Axios timeout and HTTP failures to readable retryable errors', async () => {
    jest
      .spyOn(binanceHttp, 'request')
      .mockRejectedValueOnce(new AxiosError('timeout', 'ECONNABORTED'))
      .mockRejectedValueOnce(
        new AxiosError(
          'unavailable',
          'ERR_BAD_RESPONSE',
          undefined,
          undefined,
          response({}, 503)
        )
      );

    await expect(fetchSpotKlines('BTCUSDT', '1m')).rejects.toMatchObject({
      message: 'Binance request timed out after 10 seconds',
      retryable: true,
    });
    await expect(fetchSpotKlines('BTCUSDT', '1m')).rejects.toMatchObject({
      message: 'Binance request failed with HTTP 503',
      retryable: true,
      status: 503,
    });
  });
});
