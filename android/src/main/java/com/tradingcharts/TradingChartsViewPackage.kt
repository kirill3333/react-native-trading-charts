package com.tradingcharts

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class TradingChartsViewPackage : BaseReactPackage() {
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(TradingChartsViewManager())
  }

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == NativeTradingChartsSpec.NAME) {
      TradingChartsModule(reactContext)
    } else null
  }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
        NativeTradingChartsSpec.NAME to
            ReactModuleInfo(
                NativeTradingChartsSpec.NAME,
                TradingChartsModule::class.java.name,
                false,
                false,
                false,
                true,
            ),
    )
  }
}
