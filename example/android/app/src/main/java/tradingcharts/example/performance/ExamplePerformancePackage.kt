package tradingcharts.example.performance

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class ExamplePerformancePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == ExamplePerformanceModule.NAME) ExamplePerformanceModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
        ExamplePerformanceModule.NAME to
            ReactModuleInfo(
                ExamplePerformanceModule.NAME,
                ExamplePerformanceModule::class.java.name,
                false,
                false,
                false,
                true,
            )
    )
  }
}
