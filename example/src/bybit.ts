import { type OhlcCandle, type TradeEvent } from 'react-native-trading-charts';

const REST_BASE_URL = 'https://api.bybit.com';
const REQUEST_TIMEOUT_MS = 10_000;
const KLINE_RETRY_ATTEMPTS = 3;
const KLINE_RETRY_BASE_DELAY_MS = 750;

export const BYBIT_WEBSOCKET_URL = 'wss://stream.bybit.com/v5/public/spot';

export const BYBIT_INTERVALS = [
  { value: '1s', label: '1s', timeframeMs: 1_000 },
  { value: '1', label: '1m', timeframeMs: 60_000 },
  { value: '5', label: '5m', timeframeMs: 5 * 60_000 },
  { value: '15', label: '15m', timeframeMs: 15 * 60_000 },
  { value: '60', label: '1h', timeframeMs: 60 * 60_000 },
  { value: '360', label: '6h', timeframeMs: 6 * 60 * 60_000 },
  { value: '720', label: '12h', timeframeMs: 12 * 60 * 60_000 },
  { value: 'D', label: '1d', timeframeMs: 24 * 60 * 60_000 },
] as const;

export type BybitInterval = (typeof BYBIT_INTERVALS)[number]['value'];
export type BybitKlineInterval = Exclude<BybitInterval, '1s'>;

export type BybitTicker = {
  symbol: string;
  lastPrice: number;
  lastPriceText: string;
  change24hPercent: number;
  turnover24h: number;
  precision: number;
  minMove: number;
};

export type BybitTickerSnapshot = Omit<BybitTicker, 'precision' | 'minMove'>;

export type BybitInstrument = {
  symbol: string;
  precision: number;
  minMove: number;
};

export type BybitTrade = {
  id: string;
  sequence: string;
  event: TradeEvent;
};

export type BybitMarketMessage = {
  kind: 'market';
  topic: string;
  data: unknown[];
};

export type BybitWebSocketEnvelope =
  | BybitMarketMessage
  | {
      kind: 'subscribed';
      requestId: string | null;
    }
  | {
      kind: 'pong';
      requestId: string | null;
    }
  | {
      kind: 'error';
      requestId: string | null;
      message: string;
    }
  | {
      kind: 'control';
    };

export class BybitNoDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BybitNoDataError';
  }
}

type FetchKlinesRetryOptions = {
  signal?: AbortSignal;
  attempts?: number;
  baseDelayMs?: number;
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

function requireIdentifier(value: unknown, name: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  throw new TypeError(`${name} must be a non-empty identifier`);
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

function requireSuccessfulResult(payload: unknown): JsonRecord {
  const response = requireRecord(payload, 'response');
  const retCode = requireNumber(response.retCode, 'response.retCode', {
    integer: true,
  });
  if (retCode !== 0) {
    const retMsg =
      typeof response.retMsg === 'string'
        ? response.retMsg
        : 'Unknown Bybit API error';
    throw new Error(`Bybit API error ${retCode}: ${retMsg}`);
  }
  return requireRecord(response.result, 'response.result');
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
): BybitTickerSnapshot | null {
  try {
    const ticker = requireRecord(value, `response.result.list[${index}]`);
    const symbol = requireString(ticker.symbol, `ticker[${index}].symbol`);
    if (!symbol.endsWith('USDT')) {
      return null;
    }

    const lastPriceText = requireString(
      ticker.lastPrice,
      `ticker[${index}].lastPrice`
    );
    const lastPrice = requireNumber(
      lastPriceText,
      `ticker[${index}].lastPrice`,
      { minimum: 0 }
    );
    const price24hPcnt = requireNumber(
      ticker.price24hPcnt,
      `ticker[${index}].price24hPcnt`
    );
    const turnover24h = requireNumber(
      ticker.turnover24h,
      `ticker[${index}].turnover24h`,
      { minimum: 0 }
    );
    return {
      symbol,
      lastPrice,
      lastPriceText,
      change24hPercent: price24hPcnt * 100,
      turnover24h,
    };
  } catch {
    return null;
  }
}

export function parseTickersResponse(payload: unknown): BybitTickerSnapshot[] {
  const result = requireSuccessfulResult(payload);
  const list = requireArray(result.list, 'response.result.list');

  return list
    .map(parseTicker)
    .filter((ticker): ticker is BybitTickerSnapshot => ticker !== null)
    .sort((left, right) => right.turnover24h - left.turnover24h);
}

function parseInstrument(
  value: unknown,
  index: number
): BybitInstrument | null {
  try {
    const instrument = requireRecord(value, `response.result.list[${index}]`);
    if (
      requireString(instrument.status, `instrument[${index}].status`) !==
        'Trading' ||
      requireString(instrument.quoteCoin, `instrument[${index}].quoteCoin`) !==
        'USDT'
    ) {
      return null;
    }

    const symbol = requireString(
      instrument.symbol,
      `instrument[${index}].symbol`
    );
    const priceFilter = requireRecord(
      instrument.priceFilter,
      `instrument[${index}].priceFilter`
    );
    const tickSizeText = requireString(
      priceFilter.tickSize,
      `instrument[${index}].priceFilter.tickSize`
    );
    const minMove = requireNumber(
      tickSizeText,
      `instrument[${index}].priceFilter.tickSize`
    );
    if (!(minMove > 0)) {
      throw new TypeError(
        `instrument[${index}].priceFilter.tickSize must be positive`
      );
    }

    return {
      symbol,
      precision: tickSizePrecision(tickSizeText),
      minMove,
    };
  } catch {
    return null;
  }
}

export function parseInstrumentsResponse(payload: unknown): BybitInstrument[] {
  const result = requireSuccessfulResult(payload);
  const list = requireArray(result.list, 'response.result.list');
  return list
    .map(parseInstrument)
    .filter((instrument): instrument is BybitInstrument => instrument !== null);
}

export function mergeTickersWithInstruments(
  tickers: ReadonlyArray<BybitTickerSnapshot>,
  instruments: ReadonlyArray<BybitInstrument>
): BybitTicker[] {
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

function assertIncreasingTimestamps(candles: ReadonlyArray<OhlcCandle>) {
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (previous == null || current == null) {
      continue;
    }
    if (current.timestamp <= previous.timestamp) {
      throw new TypeError('candles must have strictly increasing timestamps');
    }
  }
}

export function parseKlineResponse(payload: unknown): OhlcCandle[] {
  const result = requireSuccessfulResult(payload);
  const list = requireArray(result.list, 'response.result.list');
  const candles = list
    .map((row, index) => parseCandleRow(row, `response.result.list[${index}]`))
    .reverse();

  assertIncreasingTimestamps(candles);
  return candles;
}

function parseWebSocketCandle(value: unknown, index: number): OhlcCandle {
  const item = requireRecord(value, `message.data[${index}]`);
  return parseCandleRow(
    [item.start, item.open, item.high, item.low, item.close, item.volume],
    `message.data[${index}]`
  );
}

export function klineTopic(
  symbol: string,
  interval: BybitKlineInterval
): string {
  return `kline.${interval}.${symbol}`;
}

export function tradeTopic(symbol: string): string {
  return `publicTrade.${symbol}`;
}

function parseRecentTradeEvent(value: unknown, index: number): TradeEvent {
  const trade = requireRecord(value, `response.result.list[${index}]`);
  return {
    timestamp: requireNumber(trade.time, `trade[${index}].time`, {
      integer: true,
      minimum: 0,
    }),
    price: requireNumber(trade.price, `trade[${index}].price`, { minimum: 0 }),
    size: requireNumber(trade.size, `trade[${index}].size`, { minimum: 0 }),
  };
}

function parseRecentTrade(value: unknown, index: number): BybitTrade {
  const trade = requireRecord(value, `response.result.list[${index}]`);
  return {
    id: requireIdentifier(trade.execId, `trade[${index}].execId`),
    sequence: requireIdentifier(trade.seq, `trade[${index}].seq`),
    event: parseRecentTradeEvent(trade, index),
  };
}

export function compareBybitTrades(
  left: BybitTrade,
  right: BybitTrade
): number {
  const timestampDifference = left.event.timestamp - right.event.timestamp;
  if (timestampDifference !== 0) {
    return timestampDifference;
  }
  const sequenceDifference = left.sequence.localeCompare(right.sequence, 'en', {
    numeric: true,
  });
  return sequenceDifference !== 0
    ? sequenceDifference
    : left.id.localeCompare(right.id);
}

export function parseIdentifiedRecentTradesResponse(
  payload: unknown
): BybitTrade[] {
  const result = requireSuccessfulResult(payload);
  const list = requireArray(result.list, 'response.result.list');
  return list.map(parseRecentTrade).sort(compareBybitTrades);
}

export function parseRecentTradesResponse(payload: unknown): TradeEvent[] {
  const result = requireSuccessfulResult(payload);
  const list = requireArray(result.list, 'response.result.list');
  return list
    .map(parseRecentTradeEvent)
    .sort((left, right) => left.timestamp - right.timestamp);
}

function parseWebSocketTrade(value: unknown, index: number): BybitTrade {
  const trade = requireRecord(value, `message.data[${index}]`);
  return {
    id: requireIdentifier(trade.i, `message.data[${index}].i`),
    sequence: requireIdentifier(trade.seq, `message.data[${index}].seq`),
    event: {
      timestamp: requireNumber(trade.T, `message.data[${index}].T`, {
        integer: true,
        minimum: 0,
      }),
      price: requireNumber(trade.p, `message.data[${index}].p`, { minimum: 0 }),
      size: requireNumber(trade.v, `message.data[${index}].v`, { minimum: 0 }),
    },
  };
}

function optionalRequestId(payload: JsonRecord): string | null {
  const value = payload.req_id ?? payload.reqId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseBybitWebSocketEnvelope(
  rawMessage: unknown
): BybitWebSocketEnvelope {
  let payload: unknown = rawMessage;
  if (typeof rawMessage === 'string') {
    try {
      payload = JSON.parse(rawMessage) as unknown;
    } catch {
      throw new TypeError('WebSocket message must contain valid JSON');
    }
  }

  const message = requireRecord(payload, 'message');
  if (typeof message.topic === 'string') {
    return {
      kind: 'market',
      topic: requireString(message.topic, 'message.topic'),
      data: requireArray(message.data, 'message.data'),
    };
  }

  const requestId = optionalRequestId(message);
  if (message.success === false) {
    const detail =
      typeof message.ret_msg === 'string' && message.ret_msg.length > 0
        ? message.ret_msg
        : 'Unknown WebSocket control error';
    return { kind: 'error', requestId, message: detail };
  }

  if (message.op === 'subscribe' && message.success === true) {
    return { kind: 'subscribed', requestId };
  }

  if (
    message.op === 'pong' ||
    (message.op === 'ping' &&
      message.success === true &&
      message.ret_msg === 'pong')
  ) {
    return { kind: 'pong', requestId };
  }

  return { kind: 'control' };
}

export function parseTradeMarketMessage(
  message: BybitMarketMessage
): BybitTrade[] {
  return message.data.map(parseWebSocketTrade);
}

export function parseKlineMarketMessage(
  message: BybitMarketMessage
): OhlcCandle[] {
  return message.data.map(parseWebSocketCandle);
}

export function parseTradeWebSocketMessage(
  rawMessage: unknown,
  expectedTopic: string
): TradeEvent[] {
  const envelope = parseBybitWebSocketEnvelope(rawMessage);
  if (envelope.kind !== 'market' || envelope.topic !== expectedTopic) {
    return [];
  }
  return parseTradeMarketMessage(envelope).map((trade) => trade.event);
}

export function parseKlineWebSocketMessage(
  rawMessage: unknown,
  expectedTopic: string
): OhlcCandle[] {
  const envelope = parseBybitWebSocketEnvelope(rawMessage);
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
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
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
      throw new Error(`Bybit request failed with HTTP ${response.status}`);
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (signal?.aborted) {
      throw abortError();
    }
    if (timedOut) {
      throw new Error(
        `Bybit request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`
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
): Promise<BybitTicker[]> {
  const [tickerPayload, instrumentPayload] = await Promise.all([
    request('/v5/market/tickers?category=spot', signal),
    request('/v5/market/instruments-info?category=spot', signal),
  ]);
  return mergeTickersWithInstruments(
    parseTickersResponse(tickerPayload),
    parseInstrumentsResponse(instrumentPayload)
  );
}

export async function fetchSpotKlines(
  symbol: string,
  interval: BybitKlineInterval,
  signal?: AbortSignal
): Promise<OhlcCandle[]> {
  const query =
    `?category=spot&symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&limit=300`;
  const payload = await request(`/v5/market/kline${query}`, signal);
  return parseKlineResponse(payload);
}

export async function fetchSpotKlinesWithRetry(
  symbol: string,
  interval: BybitKlineInterval,
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
      const candles = await fetchSpotKlines(symbol, interval, options.signal);
      if (candles.length > 0) {
        return candles;
      }
      lastError = new BybitNoDataError(
        `Bybit returned no candle history for ${symbol}`
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

export async function fetchRecentSpotTrades(
  symbol: string,
  signal?: AbortSignal
): Promise<BybitTrade[]> {
  const query =
    `?category=spot&symbol=${encodeURIComponent(symbol)}` + '&limit=60';
  const payload = await request(`/v5/market/recent-trade${query}`, signal);
  return parseIdentifiedRecentTradesResponse(payload);
}

export async function fetchRecentSpotTradesWithRetry(
  symbol: string,
  options: FetchKlinesRetryOptions = {}
): Promise<BybitTrade[]> {
  const attempts = Math.max(
    1,
    Math.floor(options.attempts ?? KLINE_RETRY_ATTEMPTS)
  );
  const baseDelayMs = Math.max(
    0,
    options.baseDelayMs ?? KLINE_RETRY_BASE_DELAY_MS
  );
  let lastError: unknown = new Error('Could not load recent trades');

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const trades = await fetchRecentSpotTrades(symbol, options.signal);
      if (trades.length > 0) {
        return trades;
      }
      lastError = new BybitNoDataError(
        `Bybit returned no recent trades for ${symbol}`
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
