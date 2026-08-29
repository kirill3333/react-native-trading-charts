package com.tradingcharts

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativeTradingChartsSpec.NAME)
class TradingChartsModule(context: ReactApplicationContext) : NativeTradingChartsSpec(context) {
  override fun setHistory(chartId: String, data: ReadableArray) {
    TradingChartsRegistry.setHistory(chartId, data.toDoubles())
  }

  override fun prependHistory(chartId: String, data: ReadableArray) {
    TradingChartsRegistry.prependHistory(chartId, data.toDoubles())
  }

  override fun updateCandle(chartId: String, candle: ReadableArray) {
    TradingChartsRegistry.updateCandle(chartId, candle.toDoubles())
  }

  override fun updateTrade(chartId: String, trade: ReadableArray) {
    TradingChartsRegistry.updateTrade(chartId, trade.toDoubles())
  }

  override fun updateTrades(chartId: String, trades: ReadableArray) {
    TradingChartsRegistry.updateTrades(chartId, trades.toDoubles())
  }

  override fun addSeries(chartId: String, seriesJson: String) {
    TradingChartsRegistry.addSeries(chartId, seriesJson)
  }

  override fun setSeriesData(
      chartId: String,
      seriesId: String,
      dataType: String,
      data: ReadableArray,
  ) {
    TradingChartsRegistry.setSeriesData(
        chartId,
        seriesId,
        dataType,
        data.toDoubles(),
    )
  }

  override fun prependSeriesData(
      chartId: String,
      seriesId: String,
      dataType: String,
      data: ReadableArray,
  ) {
    TradingChartsRegistry.setSeriesData(
        chartId,
        seriesId,
        dataType,
        data.toDoubles(),
        prepend = true,
    )
  }

  override fun updateSeriesData(
      chartId: String,
      seriesId: String,
      dataType: String,
      point: ReadableArray,
  ) {
    TradingChartsRegistry.setSeriesData(
        chartId,
        seriesId,
        dataType,
        point.toDoubles(),
        update = true,
    )
  }

  override fun removeSeries(chartId: String, seriesId: String) {
    TradingChartsRegistry.removeSeries(chartId, seriesId)
  }

  override fun setPaneHeight(chartId: String, paneId: String, heightWeight: Double) {
    TradingChartsRegistry.setPaneHeight(chartId, paneId, heightWeight)
  }

  override fun setPriceLine(
      chartId: String,
      priceLineId: String,
      price: Double,
      label: String,
      color: String,
  ) {
    TradingChartsRegistry.setPriceLine(chartId, priceLineId, price, label, color)
  }

  override fun removePriceLine(chartId: String, priceLineId: String) {
    TradingChartsRegistry.removePriceLine(chartId, priceLineId)
  }

  override fun clearPriceLines(chartId: String) {
    TradingChartsRegistry.clearPriceLines(chartId)
  }

  override fun getPriceLines(chartId: String, promise: Promise) {
    TradingChartsRegistry.getPriceLines(
        chartId,
        onSuccess = promise::resolve,
        onError = {
          promise.reject(
              "E_CHART_NOT_MOUNTED",
              "No mounted chart found for chartId '$chartId'",
          )
        },
    )
  }

  override fun getCandles(chartId: String, promise: Promise) {
    TradingChartsRegistry.getCandles(
        chartId,
        onSuccess = { promise.resolve(Arguments.fromArray(it)) },
        onError = {
          promise.reject(
              "E_CHART_NOT_MOUNTED",
              "No mounted chart found for chartId '$chartId'",
          )
        },
    )
  }

  override fun zoom(chartId: String, scale: Double) {
    TradingChartsRegistry.zoom(chartId, scale)
  }

  override fun fitContent(chartId: String) {
    TradingChartsRegistry.fitContent(chartId)
  }

  override fun clear(chartId: String) {
    TradingChartsRegistry.clear(chartId)
  }

  private fun ReadableArray.toDoubles(): DoubleArray {
    return DoubleArray(size()) { index -> getDouble(index) }
  }
}
