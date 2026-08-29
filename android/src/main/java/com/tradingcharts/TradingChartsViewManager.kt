package com.tradingcharts

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.TradingChartsViewManagerDelegate
import com.facebook.react.viewmanagers.TradingChartsViewManagerInterface

@ReactModule(name = TradingChartsViewManager.NAME)
class TradingChartsViewManager :
    SimpleViewManager<TradingChartsView>(), TradingChartsViewManagerInterface<TradingChartsView> {
  private val delegate: ViewManagerDelegate<TradingChartsView> =
      TradingChartsViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<TradingChartsView> = delegate

  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext) = TradingChartsView(context)

  @ReactProp(name = "chartId")
  override fun setChartId(view: TradingChartsView, value: String?) {
    view.setChartId(value)
  }

  @ReactProp(name = "configJson")
  override fun setConfigJson(view: TradingChartsView, value: String?) {
    view.setConfigJson(value)
  }

  @ReactProp(name = "yAxisPressEnabled")
  override fun setYAxisPressEnabled(view: TradingChartsView, value: Boolean) {
    view.setYAxisPressEnabled(value)
  }

  override fun onDropViewInstance(view: TradingChartsView) {
    view.dispose()
    super.onDropViewInstance(view)
  }

  companion object {
    const val NAME = "TradingChartsView"
  }
}
