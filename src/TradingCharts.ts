import NativeTradingCharts, {
  type Spec as NativeTradingChartsSpec,
} from './NativeTradingCharts';
import { resolveAdditionalSeriesOptions } from './config';
import {
  type AdditionalChartSeriesOptions,
  type ChartSeriesDataPoint,
  type HistogramPoint,
  type OhlcCandle,
  type PriceLineOptions,
  type TradeEvent,
} from './types';

export function assertChartId(chartId: string) {
  if (chartId.trim().length === 0) {
    throw new TypeError('chartId must be a non-empty string');
  }
}

function assertIdentifier(value: string, name: string) {
  if (value.trim().length === 0 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new TypeError(
      `${name} must contain only letters, numbers, '.', '_' or '-'`
    );
  }
}

function assertFinite(value: number, name: string) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function validatePriceLine(options: PriceLineOptions) {
  if (options.id.trim().length === 0) {
    throw new TypeError('priceLine.id must be a non-empty string');
  }
  assertFinite(options.price, 'priceLine.price');
  if (options.label.trim().length === 0) {
    throw new TypeError('priceLine.label must be a non-empty string');
  }
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(options.color)) {
    throw new TypeError('priceLine.color must be #RRGGBB or #RRGGBBAA');
  }
}

function unpackPriceLines(json: string): PriceLineOptions[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error('Native price-line data must be an array');
  }
  // SAFETY: iOS and Android serialize this private transport from the native
  // engine's typed PriceLine records; the array shape is checked above and
  // every record is revalidated with the public PriceLineOptions invariants.
  const lines = parsed as ReadonlyArray<PriceLineOptions>;
  return lines.map((item, index) => {
    const result = {
      id: item.id,
      price: item.price,
      label: item.label,
      color: item.color,
    };
    try {
      validatePriceLine(result);
    } catch (error) {
      throw new Error(`Native priceLines[${index}] has invalid fields`, {
        cause: error,
      });
    }
    return result;
  });
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

function unpackCandles(values: ReadonlyArray<number>): OhlcCandle[] {
  if (values.length % 6 !== 0) {
    throw new Error('Native candle data must contain complete OHLCV records');
  }
  const candles: OhlcCandle[] = [];
  for (let index = 0; index < values.length; index += 6) {
    candles.push({
      timestamp: values[index]!,
      open: values[index + 1]!,
      high: values[index + 2]!,
      low: values[index + 3]!,
      close: values[index + 4]!,
      volume: values[index + 5]!,
    });
  }
  return candles;
}

function isOhlcPoint(point: ChartSeriesDataPoint): point is OhlcCandle {
  return 'open' in point;
}

function validateHistogramPoint(point: HistogramPoint, index?: number) {
  const prefix = index == null ? 'point' : `points[${index}]`;
  assertFinite(point.timestamp, `${prefix}.timestamp`);
  if (point.timestamp < 0 || !Number.isSafeInteger(point.timestamp)) {
    throw new TypeError(`${prefix}.timestamp must be a non-negative integer`);
  }
  assertFinite(point.value, `${prefix}.value`);
}

function packSeriesData(
  points: ReadonlyArray<ChartSeriesDataPoint>,
  single = false
) {
  if (single && points.length !== 1) {
    throw new TypeError('updateSeriesData requires exactly one point');
  }
  if (points.length === 0) {
    const packed: number[] = [];
    return { dataType: 'histogram', packed };
  }
  const ohlc = isOhlcPoint(points[0]!);
  const packed: number[] = [];
  let previousTimestamp = -Infinity;
  points.forEach((point, index) => {
    if (isOhlcPoint(point) !== ohlc) {
      throw new TypeError(
        'series data must contain one homogeneous point type'
      );
    }
    if (isOhlcPoint(point)) {
      validateCandle(point, index);
      packCandle(point, packed);
    } else {
      validateHistogramPoint(point, index);
      packed.push(point.timestamp, point.value);
    }
    if (point.timestamp <= previousTimestamp) {
      throw new TypeError(
        'series data must have strictly increasing timestamps'
      );
    }
    previousTimestamp = point.timestamp;
  });
  return { dataType: ohlc ? 'ohlc' : 'histogram', packed };
}

export function validateTrade(trade: TradeEvent, index?: number) {
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

/**
 * Validates trades and packs them into the native transport layout
 * [timestamp, price, size]. Throws synchronously on invalid input or
 * decreasing timestamps. Shared by updateTrades and the trade batcher.
 */
export function packTrades(trades: ReadonlyArray<TradeEvent>): number[] {
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
  return packed;
}

export function createTradingCharts(
  nativeTradingCharts: NativeTradingChartsSpec
) {
  return {
    addSeries(chartId: string, options: AdditionalChartSeriesOptions) {
      assertChartId(chartId);
      nativeTradingCharts.addSeries(
        chartId,
        JSON.stringify(resolveAdditionalSeriesOptions(options))
      );
    },

    setSeriesData(
      chartId: string,
      seriesId: string,
      points: ReadonlyArray<ChartSeriesDataPoint>
    ) {
      assertChartId(chartId);
      assertIdentifier(seriesId, 'seriesId');
      const { dataType, packed } = packSeriesData(points);
      nativeTradingCharts.setSeriesData(chartId, seriesId, dataType, packed);
    },

    prependSeriesData(
      chartId: string,
      seriesId: string,
      points: ReadonlyArray<ChartSeriesDataPoint>
    ) {
      assertChartId(chartId);
      assertIdentifier(seriesId, 'seriesId');
      const { dataType, packed } = packSeriesData(points);
      nativeTradingCharts.prependSeriesData(
        chartId,
        seriesId,
        dataType,
        packed
      );
    },

    updateSeriesData(
      chartId: string,
      seriesId: string,
      point: ChartSeriesDataPoint
    ) {
      assertChartId(chartId);
      assertIdentifier(seriesId, 'seriesId');
      const { dataType, packed } = packSeriesData([point], true);
      nativeTradingCharts.updateSeriesData(chartId, seriesId, dataType, packed);
    },

    removeSeries(chartId: string, seriesId: string) {
      assertChartId(chartId);
      assertIdentifier(seriesId, 'seriesId');
      if (seriesId === 'main') {
        throw new TypeError("seriesId 'main' is reserved");
      }
      nativeTradingCharts.removeSeries(chartId, seriesId);
    },

    setPaneHeight(chartId: string, paneId: string, heightWeight: number) {
      assertChartId(chartId);
      assertIdentifier(paneId, 'paneId');
      assertFinite(heightWeight, 'heightWeight');
      if (heightWeight <= 0) {
        throw new TypeError('heightWeight must be greater than 0');
      }
      nativeTradingCharts.setPaneHeight(chartId, paneId, heightWeight);
    },

    setHistory(chartId: string, candles: ReadonlyArray<OhlcCandle>) {
      assertChartId(chartId);
      const packed: number[] = [];
      let previousTimestamp = -Infinity;
      candles.forEach((candle, index) => {
        validateCandle(candle, index);
        if (candle.timestamp <= previousTimestamp) {
          throw new TypeError(
            'candles must have strictly increasing timestamps'
          );
        }
        previousTimestamp = candle.timestamp;
        packCandle(candle, packed);
      });
      nativeTradingCharts.setHistory(chartId, packed);
    },

    prependHistory(chartId: string, candles: ReadonlyArray<OhlcCandle>) {
      assertChartId(chartId);
      const packed: number[] = [];
      let previousTimestamp = -Infinity;
      candles.forEach((candle, index) => {
        validateCandle(candle, index);
        if (candle.timestamp <= previousTimestamp) {
          throw new TypeError(
            'candles must have strictly increasing timestamps'
          );
        }
        previousTimestamp = candle.timestamp;
        packCandle(candle, packed);
      });
      nativeTradingCharts.prependHistory(chartId, packed);
    },

    updateCandle(chartId: string, candle: OhlcCandle) {
      assertChartId(chartId);
      validateCandle(candle);
      const packed: number[] = [];
      packCandle(candle, packed);
      nativeTradingCharts.updateCandle(chartId, packed);
    },

    updateTrade(chartId: string, trade: TradeEvent) {
      assertChartId(chartId);
      validateTrade(trade);
      nativeTradingCharts.updateTrade(chartId, [
        trade.timestamp,
        trade.price,
        trade.size ?? 0,
      ]);
    },

    updateTrades(chartId: string, trades: ReadonlyArray<TradeEvent>) {
      assertChartId(chartId);
      nativeTradingCharts.updateTrades(chartId, packTrades(trades));
    },

    async getCandles(chartId: string): Promise<OhlcCandle[]> {
      assertChartId(chartId);
      return unpackCandles(await nativeTradingCharts.getCandles(chartId));
    },

    setPriceLine(chartId: string, options: PriceLineOptions) {
      assertChartId(chartId);
      validatePriceLine(options);
      nativeTradingCharts.setPriceLine(
        chartId,
        options.id,
        options.price,
        options.label,
        options.color
      );
    },

  removePriceLine(chartId: string, priceLineId: string) {
    assertChartId(chartId);
    if (priceLineId.trim().length === 0) {
      throw new TypeError('priceLineId must be a non-empty string');
    }
      nativeTradingCharts.removePriceLine(chartId, priceLineId);
    },

    clearPriceLines(chartId: string) {
      assertChartId(chartId);
      nativeTradingCharts.clearPriceLines(chartId);
    },

    async getPriceLines(chartId: string): Promise<PriceLineOptions[]> {
      assertChartId(chartId);
      return unpackPriceLines(await nativeTradingCharts.getPriceLines(chartId));
    },

    zoom(chartId: string, scale: number) {
      assertChartId(chartId);
      assertFinite(scale, 'scale');
      if (scale <= 0) {
        throw new TypeError('scale must be greater than 0');
      }
      nativeTradingCharts.zoom(chartId, scale);
    },

    fitContent(chartId: string) {
      assertChartId(chartId);
      nativeTradingCharts.fitContent(chartId);
    },

    clear(chartId: string) {
      assertChartId(chartId);
      nativeTradingCharts.clear(chartId);
    },
  };
}

export const TradingCharts = createTradingCharts(NativeTradingCharts);
