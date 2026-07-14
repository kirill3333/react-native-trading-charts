package com.tradingcharts

import android.graphics.Color
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.TradingChartsViewManagerInterface
import com.facebook.react.viewmanagers.TradingChartsViewManagerDelegate

@ReactModule(name = TradingChartsViewManager.NAME)
class TradingChartsViewManager : SimpleViewManager<TradingChartsView>(),
  TradingChartsViewManagerInterface<TradingChartsView> {
  private val mDelegate: ViewManagerDelegate<TradingChartsView>

  init {
    mDelegate = TradingChartsViewManagerDelegate(this)
  }

  override fun getDelegate(): ViewManagerDelegate<TradingChartsView>? {
    return mDelegate
  }

  override fun getName(): String {
    return NAME
  }

  public override fun createViewInstance(context: ThemedReactContext): TradingChartsView {
    return TradingChartsView(context)
  }

  @ReactProp(name = "color")
  override fun setColor(view: TradingChartsView?, color: Int?) {
    view?.setBackgroundColor(color ?: Color.TRANSPARENT)
  }

  companion object {
    const val NAME = "TradingChartsView"
  }
}
