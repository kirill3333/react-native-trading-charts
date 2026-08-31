import { type OhlcCandle } from 'react-native-trading-charts';

import { binanceHttp, requestData } from './http';

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

export type BinanceTickerPayload = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

export type BinanceExchangeInfoPayload = {
  symbols: Array<{
    symbol: string;
    status: string;
    quoteAsset: string;
    isSpotTradingAllowed?: boolean;
    filters: Array<{
      filterType: string;
      tickSize?: string;
      stepSize?: string;
    }>;
  }>;
};

export type BinanceKlinePayload = readonly [
  timestamp: number,
  open: string,
  high: string,
  low: string,
  close: string,
  volume: string,
  ...metadata: Array<string | number>,
];

export type BinanceKlineWebSocketPayload = {
  e: 'kline';
  s: string;
  k: {
    t: number;
    i: BinanceInterval;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
  };
};

type BinanceSubscriptionPayload = {
  result: null;
  id: string | number | null;
};

type BinanceErrorPayload = {
  code: number;
  msg: string;
  id?: string | number | null;
};

type BinanceControlPayload = {
  e?: string;
  result?: boolean;
  id?: string | number | null;
};

export type BinanceWebSocketPayload =
  | BinanceKlineWebSocketPayload
  | BinanceSubscriptionPayload
  | BinanceErrorPayload
  | BinanceControlPayload;

export type BinanceMarketMessage = {
  kind: 'market';
  topic: string;
  data: BinanceKlineWebSocketPayload;
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

function requestId(value: string | number | null | undefined): string | null {
  return value == null ? null : String(value);
}

function tickSizePrecision(tickSize: string): number {
  const decimal = tickSize.split('.')[1]?.replace(/0+$/, '') ?? '';
  return Math.min(12, decimal.length);
}

function parseTicker(value: BinanceTickerPayload): BinanceTickerSnapshot {
  return {
    symbol: value.symbol,
    lastPrice: Number(value.lastPrice),
    lastPriceText: value.lastPrice,
    change24hPercent: Number(value.priceChangePercent),
    turnover24h: Number(value.quoteVolume),
  };
}

export function parseTickersResponse(
  payload: ReadonlyArray<BinanceTickerPayload>
): BinanceTickerSnapshot[] {
  return payload
    .filter((ticker) => ticker.symbol.endsWith('USDT'))
    .map(parseTicker)
    .sort((left, right) => right.turnover24h - left.turnover24h);
}

export function parseInstrumentsResponse(
  payload: BinanceExchangeInfoPayload
): BinanceInstrument[] {
  return payload.symbols
    .filter(
      (instrument) =>
        instrument.status === 'TRADING' &&
        instrument.quoteAsset === 'USDT' &&
        instrument.isSpotTradingAllowed !== false
    )
    .map((instrument) => {
      const tickSize = instrument.filters.find(
        (filter) => filter.filterType === 'PRICE_FILTER'
      )!.tickSize!;
      return {
        symbol: instrument.symbol,
        precision: tickSizePrecision(tickSize),
        minMove: Number(tickSize),
      };
    });
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

function parseCandleRow(row: BinanceKlinePayload): OhlcCandle {
  return {
    timestamp: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

export function parseKlineResponse(
  payload: ReadonlyArray<BinanceKlinePayload>
): OhlcCandle[] {
  return payload.map(parseCandleRow);
}

export function klineTopic(symbol: string, interval: BinanceInterval): string {
  return `${symbol.toLowerCase()}@kline_${interval}`;
}

export function parseBinanceWebSocketEnvelope(
  rawMessage: string
): BinanceWebSocketEnvelope {
  const message: BinanceWebSocketPayload = JSON.parse(rawMessage);
  if ('k' in message) {
    return {
      kind: 'market',
      topic: klineTopic(message.s, message.k.i),
      data: message,
    };
  }

  if ('code' in message) {
    return {
      kind: 'error',
      requestId: requestId(message.id),
      message: message.msg,
    };
  }
  if (message.result === null) {
    return { kind: 'subscribed', requestId: requestId(message.id) };
  }
  return { kind: 'control' };
}

export function parseKlineMarketMessage(
  message: BinanceMarketMessage
): OhlcCandle[] {
  const kline = message.data.k;
  return [
    parseCandleRow([kline.t, kline.o, kline.h, kline.l, kline.c, kline.v]),
  ];
}

export function parseKlineWebSocketMessage(
  rawMessage: string,
  expectedTopic: string
): OhlcCandle[] {
  const envelope = parseBinanceWebSocketEnvelope(rawMessage);
  if (envelope.kind !== 'market' || envelope.topic !== expectedTopic) {
    return [];
  }
  return parseKlineMarketMessage(envelope);
}

async function request<TPayload>(
  path: string,
  signal?: AbortSignal
): Promise<TPayload> {
  return requestData<TPayload>(binanceHttp, 'Binance', {
    method: 'GET',
    url: path,
    signal,
  });
}

export async function fetchSpotTickers(
  signal?: AbortSignal
): Promise<BinanceTicker[]> {
  const [tickerPayload, instrumentPayload] = await Promise.all([
    request<BinanceTickerPayload[]>('/api/v3/ticker/24hr', signal),
    request<BinanceExchangeInfoPayload>('/api/v3/exchangeInfo', signal),
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
  return parseKlineResponse(
    await request<BinanceKlinePayload[]>(`/api/v3/klines${query}`, signal)
  );
}
