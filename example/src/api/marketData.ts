import { type OhlcCandle } from 'react-native-trading-charts';

import {
  BINANCE_WEBSOCKET_URL,
  BinanceNoDataError,
  fetchSpotKlines,
  fetchSpotTickers,
  klineTopic,
  parseBinanceWebSocketEnvelope,
  parseKlineMarketMessage,
  type BinanceInterval,
  type BinanceMarketMessage,
  type BinanceTicker,
} from './binance';
import {
  fetchHyperliquidCandles,
  fetchHyperliquidTickers,
  HYPERLIQUID_WEBSOCKET_URL,
  hyperliquidCandleTopic,
  HyperliquidNoDataError,
  isHyperliquidInterval,
  parseHyperliquidCandleMarketMessage,
  parseHyperliquidWebSocketEnvelope,
  type HyperliquidCandleSubscriptionPayload,
  type HyperliquidInterval,
  type HyperliquidMarketMessage,
  type HyperliquidTicker,
} from './hyperliquid';
import {
  createMarketWebSocketFactory,
  type MarketWebSocketFactory,
  type MarketWebSocketProtocol,
} from './marketWebSocket';

export type MarketProvider = 'binance' | 'hyperliquid';
export type MarketTicker = BinanceTicker | HyperliquidTicker;

type CandleRequestOptions = {
  signal?: AbortSignal;
  beforeTimestamp?: number;
  allowEmpty?: boolean;
};

export type MarketDataAdapter<
  TTicker extends { symbol: string },
  TInterval extends string,
  TMessage,
> = {
  provider: MarketProvider;
  maxCandles: number;
  websocket: MarketWebSocketFactory<TMessage>;
  chartIdFor(symbol: string, interval: TInterval): string;
  topicFor(symbol: string, interval: TInterval): string;
  parseMarketMessage(message: TMessage): OhlcCandle[];
  isNoDataError(cause: unknown): boolean;
  fetchTickers(signal?: AbortSignal): Promise<TTicker[]>;
  fetchCandles(
    symbol: string,
    interval: TInterval,
    options?: CandleRequestOptions
  ): Promise<OhlcCandle[]>;
  tickersQueryKey: readonly ['market-data', MarketProvider, 'tickers'];
  candlesQueryKey(
    symbol: string,
    interval: TInterval
  ): readonly ['market-data', MarketProvider, 'candles', string, TInterval];
  snapshotQueryKey(
    symbol: string,
    interval: TInterval
  ): readonly ['market-data', MarketProvider, 'snapshot', string, TInterval];
};

export function chartIdFor(symbol: string, interval: BinanceInterval): string {
  return `binance-spot-${symbol}-${interval}`;
}

export function hyperliquidChartIdFor(
  symbol: string,
  interval: HyperliquidInterval
): string {
  const safeSymbol = symbol.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `hyperliquid-perp-${safeSymbol}-${interval}`;
}

export const binanceProtocol: MarketWebSocketProtocol<BinanceMarketMessage> = {
  label: 'Binance',
  url: (topic) => `${BINANCE_WEBSOCKET_URL}/${topic}`,
  parse(rawMessage) {
    const envelope = parseBinanceWebSocketEnvelope(rawMessage);
    if (envelope.kind === 'market') {
      return { kind: 'market', topic: envelope.topic, message: envelope };
    }
    return envelope.kind === 'error'
      ? { kind: 'error', message: envelope.message }
      : { kind: 'control' };
  },
};

function hyperliquidSubscription(
  topic: string
): HyperliquidCandleSubscriptionPayload {
  const prefix = 'candle:';
  const separator = topic.lastIndexOf(':');
  if (!topic.startsWith(prefix) || separator <= prefix.length) {
    throw new TypeError(`Invalid Hyperliquid candle topic: ${topic}`);
  }
  const interval = topic.slice(separator + 1);
  if (!isHyperliquidInterval(interval)) {
    throw new TypeError(`Invalid Hyperliquid candle interval: ${interval}`);
  }
  return {
    type: 'candle',
    coin: topic.slice(prefix.length, separator),
    interval,
  };
}

export const hyperliquidProtocol: MarketWebSocketProtocol<HyperliquidMarketMessage> =
  {
    label: 'Hyperliquid',
    url: () => HYPERLIQUID_WEBSOCKET_URL,
    parse(rawMessage) {
      const envelope = parseHyperliquidWebSocketEnvelope(rawMessage);
      if (envelope.kind === 'market') {
        return { kind: 'market', topic: envelope.topic, message: envelope };
      }
      if (envelope.kind === 'subscribed') {
        return { kind: 'ready', topic: envelope.topic };
      }
      return envelope.kind === 'error'
        ? { kind: 'error', message: envelope.message }
        : { kind: 'control' };
    },
    subscribe(topic) {
      return JSON.stringify({
        method: 'subscribe',
        subscription: hyperliquidSubscription(topic),
      });
    },
    heartbeat: {
      intervalMs: 45_000,
      message: JSON.stringify({ method: 'ping' }),
    },
  };

async function nonEmptyTickers<TTicker>(
  provider: 'Binance' | 'Hyperliquid',
  request: Promise<TTicker[]>
): Promise<TTicker[]> {
  const tickers = await request;
  if (tickers.length === 0) {
    throw new Error(
      provider === 'Binance'
        ? 'Binance returned no USDT tickers'
        : 'Hyperliquid returned no perpetual markets'
    );
  }
  return tickers;
}

export const binanceMarketData: MarketDataAdapter<
  BinanceTicker,
  BinanceInterval,
  BinanceMarketMessage
> = {
  provider: 'binance',
  maxCandles: 20_000,
  websocket: createMarketWebSocketFactory(binanceProtocol),
  chartIdFor,
  topicFor: klineTopic,
  parseMarketMessage: parseKlineMarketMessage,
  isNoDataError: (cause) => cause instanceof BinanceNoDataError,
  fetchTickers: (signal) =>
    nonEmptyTickers('Binance', fetchSpotTickers(signal)),
  async fetchCandles(symbol, interval, options = {}) {
    const candles = await fetchSpotKlines(
      symbol,
      interval,
      options.signal,
      options.beforeTimestamp
    );
    if (candles.length === 0 && options.allowEmpty !== true) {
      throw new BinanceNoDataError(
        `Binance returned no candle history for ${symbol}`
      );
    }
    return candles;
  },
  tickersQueryKey: ['market-data', 'binance', 'tickers'],
  candlesQueryKey: (symbol, interval) => [
    'market-data',
    'binance',
    'candles',
    symbol,
    interval,
  ],
  snapshotQueryKey: (symbol, interval) => [
    'market-data',
    'binance',
    'snapshot',
    symbol,
    interval,
  ],
};

export const hyperliquidMarketData: MarketDataAdapter<
  HyperliquidTicker,
  HyperliquidInterval,
  HyperliquidMarketMessage
> = {
  provider: 'hyperliquid',
  maxCandles: 6_000,
  websocket: createMarketWebSocketFactory(hyperliquidProtocol),
  chartIdFor: hyperliquidChartIdFor,
  topicFor: hyperliquidCandleTopic,
  parseMarketMessage: parseHyperliquidCandleMarketMessage,
  isNoDataError: (cause) => cause instanceof HyperliquidNoDataError,
  fetchTickers: (signal) =>
    nonEmptyTickers('Hyperliquid', fetchHyperliquidTickers(signal)),
  async fetchCandles(symbol, interval, options = {}) {
    const candles = await fetchHyperliquidCandles(
      symbol,
      interval,
      options.signal,
      options.beforeTimestamp
    );
    if (candles.length === 0 && options.allowEmpty !== true) {
      throw new HyperliquidNoDataError(
        `Hyperliquid returned no candle history for ${symbol}`
      );
    }
    return candles;
  },
  tickersQueryKey: ['market-data', 'hyperliquid', 'tickers'],
  candlesQueryKey: (symbol, interval) => [
    'market-data',
    'hyperliquid',
    'candles',
    symbol,
    interval,
  ],
  snapshotQueryKey: (symbol, interval) => [
    'market-data',
    'hyperliquid',
    'snapshot',
    symbol,
    interval,
  ],
};
