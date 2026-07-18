import NativeTradingCharts from './NativeTradingCharts';
import { type OhlcCandle, type TradeEvent } from './types';

function assertChartId(chartId: string) {
  if (typeof chartId !== 'string' || chartId.trim().length === 0) {
    throw new TypeError('chartId must be a non-empty string');
  }
}

function assertFinite(value: number, name: string) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function validateCandle(candle: OhlcCandle, index?: number) {
  const prefix = index == null ? 'candle' : `candles[${index}]`;
  assertFinite(candle.timestamp, `${prefix}.timestamp`);
  if (candle.timestamp < 0) {
    throw new TypeError(`${prefix}.timestamp must not be negative`);
  }
  if (!Number.isSafeInteger(candle.timestamp)) {
    throw new TypeError(
      `${prefix}.timestamp must be an integer in milliseconds`
    );
  }
  assertFinite(candle.open, `${prefix}.open`);
  assertFinite(candle.high, `${prefix}.high`);
  assertFinite(candle.low, `${prefix}.low`);
  assertFinite(candle.close, `${prefix}.close`);
  if (candle.volume != null) {
    assertFinite(candle.volume, `${prefix}.volume`);
    if (candle.volume < 0) {
      throw new TypeError(`${prefix}.volume must not be negative`);
    }
  }
  if (
    candle.high < Math.max(candle.open, candle.close) ||
    candle.low > Math.min(candle.open, candle.close)
  ) {
    throw new TypeError(`${prefix} has invalid OHLC bounds`);
  }
}

function packCandle(candle: OhlcCandle, target: number[]) {
  target.push(
    candle.timestamp,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume ?? 0
  );
}

function validateTrade(trade: TradeEvent, index?: number) {
  const prefix = index == null ? 'trade' : `trades[${index}]`;
  assertFinite(trade.timestamp, `${prefix}.timestamp`);
  if (trade.timestamp < 0) {
    throw new TypeError(`${prefix}.timestamp must not be negative`);
  }
  if (!Number.isSafeInteger(trade.timestamp)) {
    throw new TypeError(
      `${prefix}.timestamp must be an integer in milliseconds`
    );
  }
  assertFinite(trade.price, `${prefix}.price`);
  if (trade.size != null) {
    assertFinite(trade.size, `${prefix}.size`);
    if (trade.size < 0) {
      throw new TypeError(`${prefix}.size must not be negative`);
    }
  }
}

export const TradingCharts = {
  setHistory(chartId: string, candles: ReadonlyArray<OhlcCandle>) {
    assertChartId(chartId);
    const packed: number[] = [];
    let previousTimestamp = -Infinity;
    candles.forEach((candle, index) => {
      validateCandle(candle, index);
      if (candle.timestamp <= previousTimestamp) {
        throw new TypeError('candles must have strictly increasing timestamps');
      }
      previousTimestamp = candle.timestamp;
      packCandle(candle, packed);
    });
    NativeTradingCharts.setHistory(chartId, packed);
  },

  prependHistory(chartId: string, candles: ReadonlyArray<OhlcCandle>) {
    assertChartId(chartId);
    const packed: number[] = [];
    let previousTimestamp = -Infinity;
    candles.forEach((candle, index) => {
      validateCandle(candle, index);
      if (candle.timestamp <= previousTimestamp) {
        throw new TypeError('candles must have strictly increasing timestamps');
      }
      previousTimestamp = candle.timestamp;
      packCandle(candle, packed);
    });
    NativeTradingCharts.prependHistory(chartId, packed);
  },

  updateCandle(chartId: string, candle: OhlcCandle) {
    assertChartId(chartId);
    validateCandle(candle);
    const packed: number[] = [];
    packCandle(candle, packed);
    NativeTradingCharts.updateCandle(chartId, packed);
  },

  updateTrade(chartId: string, trade: TradeEvent) {
    assertChartId(chartId);
    validateTrade(trade);
    NativeTradingCharts.updateTrade(chartId, [
      trade.timestamp,
      trade.price,
      trade.size ?? 0,
    ]);
  },

  updateTrades(chartId: string, trades: ReadonlyArray<TradeEvent>) {
    assertChartId(chartId);
    const packed: number[] = [];
    let previousTimestamp = -Infinity;
    trades.forEach((trade, index) => {
      validateTrade(trade, index);
      if (trade.timestamp < previousTimestamp) {
        throw new TypeError('trades must have non-decreasing timestamps');
      }
      previousTimestamp = trade.timestamp;
      packed.push(trade.timestamp, trade.price, trade.size ?? 0);
    });
    NativeTradingCharts.updateTrades(chartId, packed);
  },

  zoom(chartId: string, scale: number) {
    assertChartId(chartId);
    assertFinite(scale, 'scale');
    if (scale <= 0) {
      throw new TypeError('scale must be greater than 0');
    }
    NativeTradingCharts.zoom(chartId, scale);
  },

  fitContent(chartId: string) {
    assertChartId(chartId);
    NativeTradingCharts.fitContent(chartId);
  },

  clear(chartId: string) {
    assertChartId(chartId);
    NativeTradingCharts.clear(chartId);
  },
};
