import { type OhlcCandle } from 'react-native-trading-charts';

const REST_URL = 'https://api.hyperliquid.xyz/info';
const REQUEST_TIMEOUT_MS = 10_000;
const CANDLE_RETRY_ATTEMPTS = 3;
const CANDLE_RETRY_BASE_DELAY_MS = 750;
const HISTORY_CANDLE_COUNT = 300;

export const HYPERLIQUID_WEBSOCKET_URL = 'wss://api.hyperliquid.xyz/ws';

export const HYPERLIQUID_INTERVALS = [
  { value: '1m', label: '1m', timeframeMs: 60_000 },
  { value: '3m', label: '3m', timeframeMs: 3 * 60_000 },
  { value: '5m', label: '5m', timeframeMs: 5 * 60_000 },
  { value: '15m', label: '15m', timeframeMs: 15 * 60_000 },
  { value: '30m', label: '30m', timeframeMs: 30 * 60_000 },
  { value: '1h', label: '1h', timeframeMs: 60 * 60_000 },
  { value: '2h', label: '2h', timeframeMs: 2 * 60 * 60_000 },
  { value: '4h', label: '4h', timeframeMs: 4 * 60 * 60_000 },
  { value: '8h', label: '8h', timeframeMs: 8 * 60 * 60_000 },
  { value: '12h', label: '12h', timeframeMs: 12 * 60 * 60_000 },
  { value: '1d', label: '1d', timeframeMs: 24 * 60 * 60_000 },
  { value: '3d', label: '3d', timeframeMs: 3 * 24 * 60 * 60_000 },
  { value: '1w', label: '1w', timeframeMs: 7 * 24 * 60 * 60_000 },
  { value: '1M', label: '1M', timeframeMs: 30 * 24 * 60 * 60_000 },
] as const;

export type HyperliquidInterval =
  (typeof HYPERLIQUID_INTERVALS)[number]['value'];

export type HyperliquidTicker = {
  provider: 'hyperliquid';
  marketType: 'perpetual';
  symbol: string;
  baseAsset: string;
  quoteAsset: 'USD';
  lastPrice: number;
  lastPriceText: string;
  change24hPercent: number;
  turnover24h: number;
  precision: number;
  minMove: number;
  maxLeverage: number;
};

export type HyperliquidMarketMessage = {
  kind: 'market';
  topic: string;
  data: unknown;
};

export type HyperliquidWebSocketEnvelope =
  | HyperliquidMarketMessage
  | { kind: 'subscribed'; topic: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'control' };

export class HyperliquidNoDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HyperliquidNoDataError';
  }
}

type FetchCandlesRetryOptions = {
  signal?: AbortSignal;
  attempts?: number;
  baseDelayMs?: number;
  beforeTimestamp?: number;
  allowEmpty?: boolean;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, name: string): JsonRecord {
  if (!isRecord(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requireArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array`);
  }
  return value;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireNumber(
  value: unknown,
  name: string,
  options: { integer?: boolean; minimum?: number } = {}
): number {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || value.trim().length === 0)
  ) {
    throw new TypeError(`${name} must be a finite number`);
  }
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  if (options.integer && !Number.isSafeInteger(number)) {
    throw new TypeError(`${name} must be a safe integer`);
  }
  if (options.minimum != null && number < options.minimum) {
    throw new TypeError(`${name} must be at least ${options.minimum}`);
  }
  return number;
}

function pricePrecision(price: string): number {
  const decimal = price.includes('.')
    ? (price.split('.')[1]?.replace(/0+$/, '') ?? '')
    : '';
  return Math.min(12, decimal.length);
}

function parseTicker(
  universeValue: unknown,
  contextValue: unknown,
  index: number
): HyperliquidTicker | null {
  try {
    const universe = requireRecord(universeValue, `meta.universe[${index}]`);
    const context = requireRecord(contextValue, `contexts[${index}]`);
    if (universe.isDelisted === true) {
      return null;
    }

    const symbol = requireString(universe.name, `meta.universe[${index}].name`);
    const lastPriceText = requireString(
      context.midPx ?? context.markPx,
      `contexts[${index}].midPx`
    );
    const lastPrice = requireNumber(lastPriceText, `contexts[${index}].midPx`, {
      minimum: 0,
    });
    const previousPrice = requireNumber(
      context.prevDayPx,
      `contexts[${index}].prevDayPx`,
      { minimum: 0 }
    );
    if (!(lastPrice > 0) || !(previousPrice > 0)) {
      return null;
    }
    const precision = pricePrecision(lastPriceText);

    return {
      provider: 'hyperliquid',
      marketType: 'perpetual',
      symbol,
      baseAsset: symbol.includes(':')
        ? (symbol.split(':').at(-1) ?? symbol)
        : symbol,
      quoteAsset: 'USD',
      lastPrice,
      lastPriceText,
      change24hPercent: ((lastPrice - previousPrice) / previousPrice) * 100,
      turnover24h: requireNumber(
        context.dayNtlVlm,
        `contexts[${index}].dayNtlVlm`,
        { minimum: 0 }
      ),
      precision,
      minMove: 10 ** -precision,
      maxLeverage: requireNumber(
        universe.maxLeverage,
        `meta.universe[${index}].maxLeverage`,
        { minimum: 0 }
      ),
    };
  } catch {
    return null;
  }
}

export function parseHyperliquidTickersResponse(
  payload: unknown
): HyperliquidTicker[] {
  const response = requireArray(payload, 'response');
  if (response.length < 2) {
    throw new TypeError('response must contain metadata and asset contexts');
  }
  const meta = requireRecord(response[0], 'response[0]');
  const universe = requireArray(meta.universe, 'response[0].universe');
  const contexts = requireArray(response[1], 'response[1]');

  return universe
    .map((asset, index) => parseTicker(asset, contexts[index], index))
    .filter((ticker): ticker is HyperliquidTicker => ticker !== null)
    .sort((left, right) => right.turnover24h - left.turnover24h);
}

function parseCandle(value: unknown, name: string): OhlcCandle {
  const row = requireRecord(value, name);
  const candle: OhlcCandle = {
    timestamp: requireNumber(row.t, `${name}.t`, {
      integer: true,
      minimum: 0,
    }),
    open: requireNumber(row.o, `${name}.o`, { minimum: 0 }),
    high: requireNumber(row.h, `${name}.h`, { minimum: 0 }),
    low: requireNumber(row.l, `${name}.l`, { minimum: 0 }),
    close: requireNumber(row.c, `${name}.c`, { minimum: 0 }),
    volume: requireNumber(row.v, `${name}.v`, { minimum: 0 }),
  };
  if (
    candle.high < Math.max(candle.open, candle.close) ||
    candle.low > Math.min(candle.open, candle.close)
  ) {
    throw new TypeError(`${name} has invalid OHLC bounds`);
  }
  return candle;
}

export function parseHyperliquidCandlesResponse(
  payload: unknown
): OhlcCandle[] {
  const candles = requireArray(payload, 'response')
    .map((value, index) => parseCandle(value, `response[${index}]`))
    .sort((left, right) => left.timestamp - right.timestamp);
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (
      previous != null &&
      current != null &&
      current.timestamp <= previous.timestamp
    ) {
      throw new TypeError('candles must have strictly increasing timestamps');
    }
  }
  return candles;
}

export function hyperliquidCandleTopic(
  symbol: string,
  interval: HyperliquidInterval
): string {
  return `candle:${symbol}:${interval}`;
}

function subscriptionTopic(value: unknown): string | null {
  if (!isRecord(value) || value.type !== 'candle') {
    return null;
  }
  const symbol = requireString(value.coin, 'subscription.coin');
  const interval = requireString(value.interval, 'subscription.interval');
  if (!HYPERLIQUID_INTERVALS.some((item) => item.value === interval)) {
    throw new TypeError(`Unsupported Hyperliquid candle interval: ${interval}`);
  }
  return hyperliquidCandleTopic(symbol, interval as HyperliquidInterval);
}

export function parseHyperliquidWebSocketEnvelope(
  rawMessage: unknown
): HyperliquidWebSocketEnvelope {
  let payload: unknown = rawMessage;
  if (typeof rawMessage === 'string') {
    try {
      payload = JSON.parse(rawMessage) as unknown;
    } catch {
      throw new TypeError('WebSocket message must contain valid JSON');
    }
  }
  const message = requireRecord(payload, 'message');
  const channel = requireString(message.channel, 'message.channel');

  if (channel === 'candle') {
    const values = Array.isArray(message.data) ? message.data : [message.data];
    const first = requireRecord(values[0], 'message.data[0]');
    const symbol = requireString(first.s, 'message.data[0].s');
    const interval = requireString(first.i, 'message.data[0].i');
    if (!HYPERLIQUID_INTERVALS.some((item) => item.value === interval)) {
      throw new TypeError(
        `Unsupported Hyperliquid candle interval: ${interval}`
      );
    }
    return {
      kind: 'market',
      topic: hyperliquidCandleTopic(symbol, interval as HyperliquidInterval),
      data: values,
    };
  }

  if (channel === 'subscriptionResponse') {
    const data = requireRecord(message.data, 'message.data');
    return {
      kind: 'subscribed',
      topic: subscriptionTopic(data.subscription ?? data),
    };
  }
  if (channel === 'error') {
    return {
      kind: 'error',
      message:
        typeof message.data === 'string'
          ? message.data
          : 'Unknown Hyperliquid WebSocket error',
    };
  }
  return { kind: 'control' };
}

export function parseHyperliquidCandleMarketMessage(
  message: HyperliquidMarketMessage
): OhlcCandle[] {
  return requireArray(message.data, 'message.data').map((value, index) =>
    parseCandle(value, `message.data[${index}]`)
  );
}

function abortError(): Error {
  const error = new Error('The request was aborted');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function waitForRetry(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    throw abortError();
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function request(
  body: JsonRecord,
  signal?: AbortSignal
): Promise<unknown> {
  if (signal?.aborted) {
    throw abortError();
  }
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(REST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Hyperliquid request failed with HTTP ${response.status}`
      );
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (signal?.aborted) {
      throw abortError();
    }
    if (timedOut) {
      throw new Error(
        `Hyperliquid request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchHyperliquidTickers(
  signal?: AbortSignal
): Promise<HyperliquidTicker[]> {
  return parseHyperliquidTickersResponse(
    await request({ type: 'metaAndAssetCtxs' }, signal)
  );
}

export async function fetchHyperliquidCandles(
  symbol: string,
  interval: HyperliquidInterval,
  signal?: AbortSignal,
  beforeTimestamp?: number
): Promise<OhlcCandle[]> {
  const intervalConfig = HYPERLIQUID_INTERVALS.find(
    (item) => item.value === interval
  );
  if (intervalConfig == null) {
    throw new TypeError(`Unsupported Hyperliquid interval: ${interval}`);
  }
  const endTime =
    beforeTimestamp == null
      ? Date.now()
      : Math.max(0, Math.floor(beforeTimestamp) - 1);
  const startTime =
    endTime - intervalConfig.timeframeMs * (HISTORY_CANDLE_COUNT + 2);
  return parseHyperliquidCandlesResponse(
    await request(
      {
        type: 'candleSnapshot',
        req: { coin: symbol, interval, startTime, endTime },
      },
      signal
    )
  );
}

export async function fetchHyperliquidCandlesWithRetry(
  symbol: string,
  interval: HyperliquidInterval,
  options: FetchCandlesRetryOptions = {}
): Promise<OhlcCandle[]> {
  const attempts = Math.max(
    1,
    Math.floor(options.attempts ?? CANDLE_RETRY_ATTEMPTS)
  );
  const baseDelayMs = Math.max(
    0,
    options.baseDelayMs ?? CANDLE_RETRY_BASE_DELAY_MS
  );
  let lastError: unknown = new Error('Could not load candle history');

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const candles = await fetchHyperliquidCandles(
        symbol,
        interval,
        options.signal,
        options.beforeTimestamp
      );
      if (candles.length > 0 || options.allowEmpty === true) {
        return candles;
      }
      lastError = new HyperliquidNoDataError(
        `Hyperliquid returned no candle history for ${symbol}`
      );
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      lastError = error;
    }
    if (attempt < attempts - 1) {
      await waitForRetry(baseDelayMs * 2 ** attempt, options.signal);
    }
  }
  throw lastError;
}
