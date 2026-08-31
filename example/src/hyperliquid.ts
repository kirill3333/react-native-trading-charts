import { type OhlcCandle } from 'react-native-trading-charts';

import { hyperliquidHttp, requestData } from './http';

const HISTORY_CANDLE_COUNT = 300;

export const HYPERLIQUID_WEBSOCKET_URL = 'wss://api.hyperliquid.xyz/ws';

export const HYPERLIQUID_INTERVALS = [
  {
    value: '1m',
    label: '1m',
    resolution: { unit: 'minute' },
    requestDurationMs: 60_000,
  },
  {
    value: '3m',
    label: '3m',
    resolution: { unit: 'minute', multiplier: 3 },
    requestDurationMs: 3 * 60_000,
  },
  {
    value: '5m',
    label: '5m',
    resolution: { unit: 'minute', multiplier: 5 },
    requestDurationMs: 5 * 60_000,
  },
  {
    value: '15m',
    label: '15m',
    resolution: { unit: 'minute', multiplier: 15 },
    requestDurationMs: 15 * 60_000,
  },
  {
    value: '30m',
    label: '30m',
    resolution: { unit: 'minute', multiplier: 30 },
    requestDurationMs: 30 * 60_000,
  },
  {
    value: '1h',
    label: '1h',
    resolution: { unit: 'hour' },
    requestDurationMs: 60 * 60_000,
  },
  {
    value: '2h',
    label: '2h',
    resolution: { unit: 'hour', multiplier: 2 },
    requestDurationMs: 2 * 60 * 60_000,
  },
  {
    value: '4h',
    label: '4h',
    resolution: { unit: 'hour', multiplier: 4 },
    requestDurationMs: 4 * 60 * 60_000,
  },
  {
    value: '8h',
    label: '8h',
    resolution: { unit: 'hour', multiplier: 8 },
    requestDurationMs: 8 * 60 * 60_000,
  },
  {
    value: '12h',
    label: '12h',
    resolution: { unit: 'hour', multiplier: 12 },
    requestDurationMs: 12 * 60 * 60_000,
  },
  {
    value: '1d',
    label: '1d',
    resolution: { unit: 'day' },
    requestDurationMs: 24 * 60 * 60_000,
  },
  {
    value: '3d',
    label: '3d',
    resolution: { unit: 'day', multiplier: 3 },
    requestDurationMs: 3 * 24 * 60 * 60_000,
  },
  {
    value: '1w',
    label: '1w',
    resolution: { unit: 'week' },
    requestDurationMs: 7 * 24 * 60 * 60_000,
  },
  {
    value: '1M',
    label: '1M',
    resolution: { unit: 'month' },
    requestDurationMs: 31 * 24 * 60 * 60_000,
  },
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

export type HyperliquidAssetPayload = {
  name: string;
  maxLeverage: number;
  isDelisted?: boolean;
};

export type HyperliquidAssetContextPayload = {
  midPx: string | null;
  markPx?: string;
  prevDayPx: string;
  dayNtlVlm: string;
};

export type HyperliquidTickersPayload = readonly [
  meta: { universe: HyperliquidAssetPayload[] },
  contexts: HyperliquidAssetContextPayload[],
];

export type HyperliquidCandlePayload = {
  t: number;
  T?: number;
  s?: string;
  i?: HyperliquidInterval;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  n?: number;
};

export type HyperliquidCandleSubscriptionPayload = {
  type: 'candle';
  coin: string;
  interval: HyperliquidInterval;
};

type HyperliquidCandleMessagePayload = {
  channel: 'candle';
  data: HyperliquidCandlePayload | HyperliquidCandlePayload[];
};

type HyperliquidSubscriptionMessagePayload = {
  channel: 'subscriptionResponse';
  data: {
    method: 'subscribe' | 'unsubscribe';
    subscription: HyperliquidCandleSubscriptionPayload;
  };
};

type HyperliquidErrorMessagePayload = {
  channel: 'error';
  data: string;
};

type HyperliquidControlMessagePayload = {
  channel: 'pong';
  data?: null;
};

export type HyperliquidWebSocketPayload =
  | HyperliquidCandleMessagePayload
  | HyperliquidSubscriptionMessagePayload
  | HyperliquidErrorMessagePayload
  | HyperliquidControlMessagePayload;

export type HyperliquidMarketMessage = {
  kind: 'market';
  topic: string;
  data: HyperliquidCandlePayload[];
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

type HyperliquidRequestPayload =
  | { type: 'metaAndAssetCtxs' }
  | {
      type: 'candleSnapshot';
      req: {
        coin: string;
        interval: HyperliquidInterval;
        startTime: number;
        endTime: number;
      };
    };

function pricePrecision(price: string): number {
  const decimal = price.includes('.')
    ? (price.split('.')[1]?.replace(/0+$/, '') ?? '')
    : '';
  return Math.min(12, decimal.length);
}

function parseTicker(
  universe: HyperliquidAssetPayload,
  context: HyperliquidAssetContextPayload
): HyperliquidTicker {
  const symbol = universe.name;
  const lastPriceText = context.midPx ?? context.markPx!;
  const lastPrice = Number(lastPriceText);
  const previousPrice = Number(context.prevDayPx);
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
    turnover24h: Number(context.dayNtlVlm),
    precision,
    minMove: 10 ** -precision,
    maxLeverage: universe.maxLeverage,
  };
}

export function parseHyperliquidTickersResponse(
  payload: HyperliquidTickersPayload
): HyperliquidTicker[] {
  const [meta, contexts] = payload;
  return meta.universe
    .flatMap((asset, index) =>
      asset.isDelisted === true ? [] : [parseTicker(asset, contexts[index]!)]
    )
    .sort((left, right) => right.turnover24h - left.turnover24h);
}

function parseCandle(value: HyperliquidCandlePayload): OhlcCandle {
  return {
    timestamp: value.t,
    open: Number(value.o),
    high: Number(value.h),
    low: Number(value.l),
    close: Number(value.c),
    volume: Number(value.v),
  };
}

export function parseHyperliquidCandlesResponse(
  payload: ReadonlyArray<HyperliquidCandlePayload>
): OhlcCandle[] {
  return payload
    .map(parseCandle)
    .sort((left, right) => left.timestamp - right.timestamp);
}

export function hyperliquidCandleTopic(
  symbol: string,
  interval: HyperliquidInterval
): string {
  return `candle:${symbol}:${interval}`;
}

function subscriptionTopic(
  value: HyperliquidCandleSubscriptionPayload
): string {
  return hyperliquidCandleTopic(value.coin, value.interval);
}

export function parseHyperliquidWebSocketEnvelope(
  rawMessage: string
): HyperliquidWebSocketEnvelope {
  const message: HyperliquidWebSocketPayload = JSON.parse(rawMessage);
  if (message.channel === 'candle') {
    const values = Array.isArray(message.data) ? message.data : [message.data];
    const first = values[0]!;
    return {
      kind: 'market',
      topic: hyperliquidCandleTopic(first.s!, first.i!),
      data: values,
    };
  }

  if (message.channel === 'subscriptionResponse') {
    return {
      kind: 'subscribed',
      topic: subscriptionTopic(message.data.subscription),
    };
  }
  if (message.channel === 'error') {
    return {
      kind: 'error',
      message: message.data,
    };
  }
  return { kind: 'control' };
}

export function parseHyperliquidCandleMarketMessage(
  message: HyperliquidMarketMessage
): OhlcCandle[] {
  return message.data.map(parseCandle);
}

async function request<TPayload>(
  body: HyperliquidRequestPayload,
  signal?: AbortSignal
): Promise<TPayload> {
  return requestData<TPayload>(hyperliquidHttp, 'Hyperliquid', {
    method: 'POST',
    url: '/info',
    data: body,
    signal,
  });
}

export async function fetchHyperliquidTickers(
  signal?: AbortSignal
): Promise<HyperliquidTicker[]> {
  return parseHyperliquidTickersResponse(
    await request<HyperliquidTickersPayload>(
      { type: 'metaAndAssetCtxs' },
      signal
    )
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
  )!;
  const endTime =
    beforeTimestamp == null
      ? Date.now()
      : Math.max(0, Math.floor(beforeTimestamp) - 1);
  const startTime =
    endTime - intervalConfig.requestDurationMs * (HISTORY_CANDLE_COUNT + 2);
  return parseHyperliquidCandlesResponse(
    await request<HyperliquidCandlePayload[]>(
      {
        type: 'candleSnapshot',
        req: { coin: symbol, interval, startTime, endTime },
      },
      signal
    )
  );
}
