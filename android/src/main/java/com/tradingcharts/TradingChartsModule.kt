package com.tradingcharts

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativeTradingChartsSpec.NAME)
class TradingChartsModule(context: ReactApplicationContext) : NativeTradingChartsSpec(context) {
  override fun setHistory(chartId: String, data: ReadableArray) {
    TradingChartsRegistry.setHistory(chartId, data.toDoubles())
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

  override fun clear(chartId: String) {
    TradingChartsRegistry.clear(chartId)
  }

  private fun ReadableArray.toDoubles(): DoubleArray {
    return DoubleArray(size()) { index -> getDouble(index) }
  }
}
