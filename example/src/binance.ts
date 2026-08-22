import { type OhlcCandle } from 'react-native-trading-charts';

const REST_BASE_URL = 'https://api.binance.com';
const REQUEST_TIMEOUT_MS = 10_000;
const KLINE_RETRY_ATTEMPTS = 3;
const KLINE_RETRY_BASE_DELAY_MS = 750;

export const BINANCE_WEBSOCKET_URL = 'wss://stream.binance.com:9443/ws';

export const BINANCE_INTERVALS = [
  { value: '1s', label: '1s', resolution: { unit: 'second' } },
  { value: '1m', label: '1m', resolution: { unit: 'minute' } },
  {
    value: '5m',
    label: '5m',
    resolution: { unit: 'minute', multiplier: 5 },
  },
  {
    value: '15m',
    label: '15m',
    resolution: { unit: 'minute', multiplier: 15 },
  },
  { value: '1h', label: '1h', resolution: { unit: 'hour' } },
  {
    value: '6h',
    label: '6h',
    resolution: { unit: 'hour', multiplier: 6 },
  },
  {
    value: '12h',
    label: '12h',
    resolution: { unit: 'hour', multiplier: 12 },
  },
  { value: '1d', label: '1d', resolution: { unit: 'day' } },
] as const;

export type BinanceInterval = (typeof BINANCE_INTERVALS)[number]['value'];

export type BinanceTicker = {
  symbol: string;
  lastPrice: number;
  lastPriceText: string;
  change24hPercent: number;
  turnover24h: number;
  precision: number;
  minMove: number;
};

export type BinanceTickerSnapshot = Omit<
  BinanceTicker,
  'precision' | 'minMove'
>;

export type BinanceInstrument = {
  symbol: string;
  precision: number;
  minMove: number;
};

export type BinanceMarketMessage = {
  kind: 'market';
  topic: string;
  data: unknown;
};

export type BinanceWebSocketEnvelope =
  | BinanceMarketMessage
  | { kind: 'subscribed'; requestId: string | null }
  | {
      kind: 'error';
      requestId: string | null;
      message: string;
    }
  | { kind: 'control' };

export class BinanceNoDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BinanceNoDataError';
  }
}

type FetchKlinesRetryOptions = {
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

function optionalRequestId(payload: JsonRecord): string | null {
  const value = payload.id;
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return null;
}

function throwIfApiError(payload: unknown): void {
  if (!isRecord(payload) || typeof payload.code !== 'number') {
    return;
  }
  const detail =
    typeof payload.msg === 'string' ? payload.msg : 'Unknown Binance API error';
  throw new Error(`Binance API error ${payload.code}: ${detail}`);
}

function tickSizePrecision(tickSize: string): number {
  if (!/^\d+(?:\.\d+)?$/.test(tickSize)) {
    throw new TypeError('tickSize must be a decimal string');
  }
  const decimal = tickSize.split('.')[1]?.replace(/0+$/, '') ?? '';
  if (decimal.length > 12) {
    throw new TypeError('tickSize precision must not exceed 12 decimals');
  }
  return decimal.length;
}

function parseTicker(
  value: unknown,
  index: number
): BinanceTickerSnapshot | null {
  try {
    const ticker = requireRecord(value, `response[${index}]`);
    const symbol = requireString(ticker.symbol, `ticker[${index}].symbol`);
    if (!symbol.endsWith('USDT')) {
      return null;
    }

    const lastPriceText = requireString(
      ticker.lastPrice,
      `ticker[${index}].lastPrice`
    );
    return {
      symbol,
      lastPrice: requireNumber(lastPriceText, `ticker[${index}].lastPrice`, {
        minimum: 0,
      }),
      lastPriceText,
      change24hPercent: requireNumber(
        ticker.priceChangePercent,
        `ticker[${index}].priceChangePercent`
      ),
      turnover24h: requireNumber(
        ticker.quoteVolume,
        `ticker[${index}].quoteVolume`,
        { minimum: 0 }
      ),
    };
  } catch {
    return null;
  }
}

export function parseTickersResponse(
  payload: unknown
): BinanceTickerSnapshot[] {
  throwIfApiError(payload);
  const list = requireArray(payload, 'response');
  return list
    .map(parseTicker)
    .filter((ticker): ticker is BinanceTickerSnapshot => ticker !== null)
    .sort((left, right) => right.turnover24h - left.turnover24h);
}

function parseInstrument(
  value: unknown,
  index: number
): BinanceInstrument | null {
  try {
    const instrument = requireRecord(value, `response.symbols[${index}]`);
    if (
      requireString(instrument.status, `instrument[${index}].status`) !==
        'TRADING' ||
      requireString(
        instrument.quoteAsset,
        `instrument[${index}].quoteAsset`
      ) !== 'USDT' ||
      instrument.isSpotTradingAllowed === false
    ) {
      return null;
    }
    const filters = requireArray(
      instrument.filters,
      `instrument[${index}].filters`
    );
    const priceFilter = filters.find(
      (filter) => isRecord(filter) && filter.filterType === 'PRICE_FILTER'
    );
    const priceFilterRecord = requireRecord(
      priceFilter,
      `instrument[${index}].PRICE_FILTER`
    );
    const tickSizeText = requireString(
      priceFilterRecord.tickSize,
      `instrument[${index}].PRICE_FILTER.tickSize`
    );
    const minMove = requireNumber(
      tickSizeText,
      `instrument[${index}].PRICE_FILTER.tickSize`
    );
    if (minMove <= 0) {
      throw new TypeError('tickSize must be positive');
    }
    return {
      symbol: requireString(instrument.symbol, `instrument[${index}].symbol`),
      precision: tickSizePrecision(tickSizeText),
      minMove,
    };
  } catch {
    return null;
  }
}

export function parseInstrumentsResponse(
  payload: unknown
): BinanceInstrument[] {
  throwIfApiError(payload);
  const response = requireRecord(payload, 'response');
  return requireArray(response.symbols, 'response.symbols')
    .map(parseInstrument)
    .filter(
      (instrument): instrument is BinanceInstrument => instrument !== null
    );
}

export function mergeTickersWithInstruments(
  tickers: ReadonlyArray<BinanceTickerSnapshot>,
  instruments: ReadonlyArray<BinanceInstrument>
): BinanceTicker[] {
  const instrumentsBySymbol = new Map(
    instruments.map((instrument) => [instrument.symbol, instrument] as const)
  );
  return tickers.flatMap((ticker) => {
    const instrument = instrumentsBySymbol.get(ticker.symbol);
    return instrument == null ? [] : [{ ...ticker, ...instrument }];
  });
}

function parseCandleRow(value: unknown, name: string): OhlcCandle {
  const row = requireArray(value, name);
  if (row.length < 6) {
    throw new TypeError(`${name} must contain at least 6 values`);
  }
  const candle: OhlcCandle = {
    timestamp: requireNumber(row[0], `${name}[0]`, {
      integer: true,
      minimum: 0,
    }),
    open: requireNumber(row[1], `${name}[1]`, { minimum: 0 }),
    high: requireNumber(row[2], `${name}[2]`, { minimum: 0 }),
    low: requireNumber(row[3], `${name}[3]`, { minimum: 0 }),
    close: requireNumber(row[4], `${name}[4]`, { minimum: 0 }),
    volume: requireNumber(row[5], `${name}[5]`, { minimum: 0 }),
  };
  if (
    candle.high < Math.max(candle.open, candle.close) ||
    candle.low > Math.min(candle.open, candle.close)
  ) {
    throw new TypeError(`${name} has invalid OHLC bounds`);
  }
  return candle;
}

function assertIncreasingTimestamps(candles: ReadonlyArray<OhlcCandle>): void {
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
}

export function parseKlineResponse(payload: unknown): OhlcCandle[] {
  throwIfApiError(payload);
  const candles = requireArray(payload, 'response').map((row, index) =>
    parseCandleRow(row, `response[${index}]`)
  );
  assertIncreasingTimestamps(candles);
  return candles;
}

export function klineTopic(symbol: string, interval: BinanceInterval): string {
  return `${symbol.toLowerCase()}@kline_${interval}`;
}

function isBinanceInterval(value: string): value is BinanceInterval {
  return BINANCE_INTERVALS.some((interval) => interval.value === value);
}

export function parseBinanceWebSocketEnvelope(
  rawMessage: unknown
): BinanceWebSocketEnvelope {
  let payload: unknown = rawMessage;
  if (typeof rawMessage === 'string') {
    try {
      payload = JSON.parse(rawMessage) as unknown;
    } catch {
      throw new TypeError('WebSocket message must contain valid JSON');
    }
  }

  const message = requireRecord(payload, 'message');
  if (message.e === 'kline') {
    const symbol = requireString(message.s, 'message.s');
    const kline = requireRecord(message.k, 'message.k');
    const interval = requireString(kline.i, 'message.k.i');
    if (!isBinanceInterval(interval)) {
      throw new TypeError(`Unsupported Binance kline interval: ${interval}`);
    }
    return {
      kind: 'market',
      topic: klineTopic(symbol, interval),
      data: message,
    };
  }

  const requestId = optionalRequestId(message);
  if (typeof message.code === 'number') {
    return {
      kind: 'error',
      requestId,
      message:
        typeof message.msg === 'string'
          ? message.msg
          : `WebSocket error ${message.code}`,
    };
  }
  if (
    Object.prototype.hasOwnProperty.call(message, 'result') &&
    message.result === null
  ) {
    return { kind: 'subscribed', requestId };
  }
  return { kind: 'control' };
}

export function parseKlineMarketMessage(
  message: BinanceMarketMessage
): OhlcCandle[] {
  const payload = requireRecord(message.data, 'message');
  const kline = requireRecord(payload.k, 'message.k');
  return [
    parseCandleRow(
      [kline.t, kline.o, kline.h, kline.l, kline.c, kline.v],
      'message.k'
    ),
  ];
}

export function parseKlineWebSocketMessage(
  rawMessage: unknown,
  expectedTopic: string
): OhlcCandle[] {
  const envelope = parseBinanceWebSocketEnvelope(rawMessage);
  if (envelope.kind !== 'market' || envelope.topic !== expectedTopic) {
    return [];
  }
  return parseKlineMarketMessage(envelope);
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

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
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
    const response = await fetch(`${REST_BASE_URL}${path}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Binance request failed with HTTP ${response.status}`);
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (signal?.aborted) {
      throw abortError();
    }
    if (timedOut) {
      throw new Error(
        `Binance request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchSpotTickers(
  signal?: AbortSignal
): Promise<BinanceTicker[]> {
  const [tickerPayload, instrumentPayload] = await Promise.all([
    request('/api/v3/ticker/24hr', signal),
    request('/api/v3/exchangeInfo', signal),
  ]);
  return mergeTickersWithInstruments(
    parseTickersResponse(tickerPayload),
    parseInstrumentsResponse(instrumentPayload)
  );
}

export async function fetchSpotKlines(
  symbol: string,
  interval: BinanceInterval,
  signal?: AbortSignal,
  beforeTimestamp?: number
): Promise<OhlcCandle[]> {
  const query =
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&limit=300` +
    (beforeTimestamp == null
      ? ''
      : `&endTime=${Math.max(0, Math.floor(beforeTimestamp) - 1)}`);
  return parseKlineResponse(await request(`/api/v3/klines${query}`, signal));
}

export async function fetchSpotKlinesWithRetry(
  symbol: string,
  interval: BinanceInterval,
  options: FetchKlinesRetryOptions = {}
): Promise<OhlcCandle[]> {
  const attempts = Math.max(
    1,
    Math.floor(options.attempts ?? KLINE_RETRY_ATTEMPTS)
  );
  const baseDelayMs = Math.max(
    0,
    options.baseDelayMs ?? KLINE_RETRY_BASE_DELAY_MS
  );
  let lastError: unknown = new Error('Could not load candle history');

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const candles = await fetchSpotKlines(
        symbol,
        interval,
        options.signal,
        options.beforeTimestamp
      );
      if (candles.length > 0 || options.allowEmpty === true) {
        return candles;
      }
      lastError = new BinanceNoDataError(
        `Binance returned no candle history for ${symbol}`
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
