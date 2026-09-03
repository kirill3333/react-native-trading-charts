// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

package com.tradingcharts

import org.json.JSONArray
import org.json.JSONObject

internal fun crosshairSeriesValuesJson(values: List<CrosshairSeriesValueSnapshot>): String {
  val result = JSONArray()
  values.forEach { value ->
    val json =
        JSONObject()
            .put("seriesId", value.seriesId)
            .put("paneId", value.paneId)
            .put("priceScaleId", value.priceScaleId)
    when (value.kind) {
      SERIES_VALUE_KIND_OHLC -> {
        json.put("kind", "ohlc")
        json.put("seriesType", seriesTypeName(value.seriesType))
        json.put("candle", if (value.hasValue) candleJson(value.candle) else JSONObject.NULL)
      }
      SERIES_VALUE_KIND_MACD -> {
        json.put("kind", "macd")
        json.put("seriesType", "macd")
        json.put("sourceType", "ohlcvMacd")
        json.put("macd", if (value.hasMacd) value.macd else JSONObject.NULL)
        json.put("signal", if (value.hasSignal) value.signal else JSONObject.NULL)
        json.put("histogram", if (value.hasHistogram) value.histogram else JSONObject.NULL)
      }
      else -> {
        json.put("kind", "scalar")
        json.put("seriesType", seriesTypeName(value.seriesType))
        json.put("sourceType", sourceTypeName(value.sourceType))
        json.put("value", if (value.hasValue) value.value else JSONObject.NULL)
      }
    }
    result.put(json)
  }
  return result.toString()
}

private fun candleJson(candle: DoubleArray) =
    JSONObject()
        .put("timestamp", candle.getOrElse(0) { 0.0 })
        .put("open", candle.getOrElse(1) { 0.0 })
        .put("high", candle.getOrElse(2) { 0.0 })
        .put("low", candle.getOrElse(3) { 0.0 })
        .put("close", candle.getOrElse(4) { 0.0 })
        .put("volume", candle.getOrElse(5) { 0.0 })

private fun seriesTypeName(type: Int) =
    when (type) {
      SERIES_TYPE_CANDLESTICK -> "candlestick"
      SERIES_TYPE_BAR -> "bar"
      SERIES_TYPE_HOLLOW_CANDLESTICK -> "hollowCandlestick"
      SERIES_TYPE_HISTOGRAM -> "histogram"
      SERIES_TYPE_AREA -> "area"
      else -> "line"
    }

private fun sourceTypeName(source: Int) =
    when (source) {
      SERIES_SOURCE_VOLUME -> "ohlcvVolume"
      SERIES_SOURCE_RSI -> "ohlcvRsi"
      SERIES_SOURCE_SMA -> "ohlcvSma"
      SERIES_SOURCE_EMA -> "ohlcvEma"
      SERIES_SOURCE_MACD -> "ohlcvMacd"
      else -> "data"
    }

private const val SERIES_VALUE_KIND_OHLC = 0
private const val SERIES_VALUE_KIND_MACD = 2
private const val SERIES_TYPE_CANDLESTICK = 0
private const val SERIES_TYPE_BAR = 1
private const val SERIES_TYPE_HOLLOW_CANDLESTICK = 2
private const val SERIES_TYPE_HISTOGRAM = 3
private const val SERIES_TYPE_AREA = 5
private const val SERIES_SOURCE_VOLUME = 1
private const val SERIES_SOURCE_RSI = 2
private const val SERIES_SOURCE_SMA = 3
private const val SERIES_SOURCE_EMA = 4
private const val SERIES_SOURCE_MACD = 5
