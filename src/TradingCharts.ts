import NativeTradingCharts from './NativeTradingCharts';
import {
  type AdditionalChartSeriesOptions,
  type ChartSeriesDataPoint,
  type HistogramPoint,
  type OhlcCandle,
  type TradeEvent,
} from './types';

function assertChartId(chartId: string) {
  if (typeof chartId !== 'string' || chartId.trim().length === 0) {
    throw new TypeError('chartId must be a non-empty string');
  }
}

function assertIdentifier(value: string, name: string) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    !/^[A-Za-z0-9._-]+$/.test(value)
  ) {
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
  if (
    point.timestamp < 0 ||
    !Number.isSafeInteger(point.timestamp)
  ) {
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
    return { dataType: 'histogram', packed: [] as number[] };
  }
  const ohlc = isOhlcPoint(points[0]!);
  const packed: number[] = [];
  let previousTimestamp = -Infinity;
  points.forEach((point, index) => {
    if (isOhlcPoint(point) !== ohlc) {
      throw new TypeError('series data must contain one homogeneous point type');
    }
    if (ohlc) {
      validateCandle(point as OhlcCandle, index);
      packCandle(point as OhlcCandle, packed);
    } else {
      validateHistogramPoint(point as HistogramPoint, index);
      packed.push(point.timestamp, (point as HistogramPoint).value);
    }
    if (point.timestamp <= previousTimestamp) {
      throw new TypeError('series data must have strictly increasing timestamps');
    }
    previousTimestamp = point.timestamp;
  });
  return { dataType: ohlc ? 'ohlc' : 'histogram', packed };
}

function validateSeriesOptions(options: AdditionalChartSeriesOptions) {
  assertIdentifier(options.seriesId, 'options.seriesId');
  if (options.seriesId === 'main') {
    throw new TypeError("seriesId 'main' is reserved");
  }
  assertIdentifier(options.paneId, 'options.paneId');
  assertIdentifier(options.priceScaleId, 'options.priceScaleId');
  if (
    options.type !== 'candlestick' &&
    options.type !== 'hollowCandlestick' &&
    options.type !== 'bar' &&
    options.type !== 'histogram'
  ) {
    throw new TypeError('options.type is invalid');
  }
  if (
    options.type === 'histogram' &&
    options.source?.type === 'ohlcvVolume'
  ) {
    assertIdentifier(options.source.seriesId, 'options.source.seriesId');
  }
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
  addSeries(chartId: string, options: AdditionalChartSeriesOptions) {
    assertChartId(chartId);
    validateSeriesOptions(options);
    NativeTradingCharts.addSeries(chartId, JSON.stringify(options));
  },

  setSeriesData(
    chartId: string,
    seriesId: string,
    points: ReadonlyArray<ChartSeriesDataPoint>
  ) {
    assertChartId(chartId);
    assertIdentifier(seriesId, 'seriesId');
    const { dataType, packed } = packSeriesData(points);
    NativeTradingCharts.setSeriesData(
      chartId,
      seriesId,
      dataType,
      packed
    );
  },

  prependSeriesData(
    chartId: string,
    seriesId: string,
    points: ReadonlyArray<ChartSeriesDataPoint>
  ) {
    assertChartId(chartId);
    assertIdentifier(seriesId, 'seriesId');
    const { dataType, packed } = packSeriesData(points);
    NativeTradingCharts.prependSeriesData(
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
    NativeTradingCharts.updateSeriesData(
      chartId,
      seriesId,
      dataType,
      packed
    );
  },

  removeSeries(chartId: string, seriesId: string) {
    assertChartId(chartId);
    assertIdentifier(seriesId, 'seriesId');
    if (seriesId === 'main') {
      throw new TypeError("seriesId 'main' is reserved");
    }
    NativeTradingCharts.removeSeries(chartId, seriesId);
  },

  setPaneHeight(chartId: string, paneId: string, heightWeight: number) {
    assertChartId(chartId);
    assertIdentifier(paneId, 'paneId');
    assertFinite(heightWeight, 'heightWeight');
    if (heightWeight <= 0) {
      throw new TypeError('heightWeight must be greater than 0');
    }
    NativeTradingCharts.setPaneHeight(chartId, paneId, heightWeight);
  },

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

  async getCandles(chartId: string): Promise<OhlcCandle[]> {
    assertChartId(chartId);
    return unpackCandles(await NativeTradingCharts.getCandles(chartId));
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
