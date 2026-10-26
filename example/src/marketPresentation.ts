import { type MarketTicker } from './api/marketData';
import { type HyperliquidTicker } from './api/hyperliquid';

const priceFormatters = new Map<number, Intl.NumberFormat>();

export function formatMarketPrice(value: number, precision: number): string {
  let formatter = priceFormatters.get(precision);
  if (formatter == null) {
    formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    priceFormatters.set(precision, formatter);
  }
  return formatter.format(value);
}

export function isHyperliquidTicker(
  ticker: MarketTicker
): ticker is HyperliquidTicker {
  return 'provider' in ticker && ticker.provider === 'hyperliquid';
}

export function formatTurnover(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

type TickerPair = {
  base: string;
  quote: string;
};

export function tickerPair(ticker: MarketTicker): TickerPair {
  if (isHyperliquidTicker(ticker)) {
    return { base: ticker.baseAsset, quote: ticker.quoteAsset };
  }
  return { base: ticker.symbol.slice(0, -4), quote: 'USDT' };
}
