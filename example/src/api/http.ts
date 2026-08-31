import {
  create,
  isAxiosError,
  isCancel,
  type AxiosInstance,
  type AxiosRequestConfig,
} from 'axios';

const REQUEST_TIMEOUT_MS = 10_000;

export class MarketHttpError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    message: string,
    options: { cause: unknown; retryable: boolean; status?: number }
  ) {
    super(message, { cause: options.cause });
    this.name = 'MarketHttpError';
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

export const binanceHttp = create({
  baseURL: 'https://api.binance.com',
  timeout: REQUEST_TIMEOUT_MS,
});

export const hyperliquidHttp = create({
  baseURL: 'https://api.hyperliquid.xyz',
  timeout: REQUEST_TIMEOUT_MS,
});

export async function requestData<TPayload>(
  client: AxiosInstance,
  provider: 'Binance' | 'Hyperliquid',
  config: AxiosRequestConfig
): Promise<TPayload> {
  try {
    const response = await client.request<TPayload>(config);
    return response.data;
  } catch (cause) {
    if (isCancel(cause)) {
      throw cause;
    }
    if (!isAxiosError(cause)) {
      throw cause;
    }

    const status = cause.response?.status;
    if (cause.code === 'ECONNABORTED' || cause.code === 'ETIMEDOUT') {
      throw new MarketHttpError(
        `${provider} request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`,
        { cause, retryable: true, status }
      );
    }
    if (status != null) {
      throw new MarketHttpError(
        `${provider} request failed with HTTP ${status}`,
        {
          cause,
          retryable: status === 429 || status >= 500,
          status,
        }
      );
    }
    throw new MarketHttpError(`${provider} network request failed`, {
      cause,
      retryable: true,
    });
  }
}

export function shouldRetryQuery(failureCount: number, error: Error): boolean {
  return (
    failureCount < 2 && error instanceof MarketHttpError && error.retryable
  );
}

export function queryRetryDelay(attemptIndex: number): number {
  return Math.min(30_000, 750 * 2 ** attemptIndex);
}
