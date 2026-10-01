package tradingcharts.example.performance

import android.os.Handler
import android.os.HandlerThread
import android.os.Process
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.LifecycleState
import com.facebook.react.module.annotations.ReactModule
import com.tradingcharts.ChartRenderingDiagnostics
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.ceil

@ReactModule(name = ExamplePerformanceModule.NAME)
class ExamplePerformanceModule(private val context: ReactApplicationContext) :
    NativeExamplePerformanceSpec(context), LifecycleEventListener {
  private val invalidated = AtomicBoolean(false)
  private val worker =
      HandlerThread("example.performance", Process.THREAD_PRIORITY_BACKGROUND).apply { start() }
  private val handler = Handler(worker.looper)
  private val display = PerformanceDisplayFrames()
  @Volatile private var jsTid: Int? = null
  private val sampler =
      PerformanceSampler(
          clock = { System.nanoTime() / 1e9 },
          threads = { PerformanceThreadReader.read(jsTid).orEmpty() },
          display = display::snapshot,
          graphics =
              object : PerformanceSampler.GraphicsSource {
                override fun observe(chartId: String) = ChartRenderingDiagnostics.observe(chartId)

                override fun remove(chartId: String) =
                    ChartRenderingDiagnostics.removeObserver(chartId)

                override fun snapshot(chartId: String) = ChartRenderingDiagnostics.snapshot(chartId)
              },
          emit = { sample ->
            if (!invalidated.get() && context.hasActiveReactInstance()) {
              emitOnSample(Arguments.makeNativeMap(sample))
            }
          },
      )
  private val tick = Runnable {
    if (!invalidated.get()) {
      sampler.tick()
      schedule()
    }
  }

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    context.addLifecycleEventListener(this)
    context.runOnJSQueueThread {
      if (!invalidated.get()) jsTid = Process.myTid()
    }
    val active = context.lifecycleState == LifecycleState.RESUMED
    enqueue { sampler.setActive(active) }
  }

  override fun getThreads(promise: Promise) {
    if (invalidated.get()) {
      promise.reject("E_INVALIDATED", "Performance module is invalidated")
      return
    }
    val posted = handler.post {
      if (invalidated.get()) {
        promise.reject("E_INVALIDATED", "Performance module is invalidated")
        return@post
      }
      val threads = PerformanceThreadReader.read(jsTid)
      if (threads == null)
          promise.reject("E_THREADS_UNAVAILABLE", "Could not enumerate application threads")
      else promise.resolve(Arguments.makeNativeArray(threads.map { it.metadata() }))
    }
    if (!posted) promise.reject("E_INVALIDATED", "Performance module is invalidated")
  }

  override fun start(
      subscriptionId: String,
      chartId: String,
      threadNames: ReadableArray,
      includeMainThread: Boolean,
      intervalMs: Double,
  ) {
    require(subscriptionId.isNotBlank() && chartId.isNotBlank())
    require(intervalMs.isFinite() && intervalMs >= 250)
    val names =
        (0 until threadNames.size())
            .map { index ->
              requireNotNull(threadNames.getString(index)).also { require(it.isNotBlank()) }
            }
            .toSet()
    enqueue { sampler.start(subscriptionId, chartId, names, includeMainThread, intervalMs / 1000) }
  }

  override fun stop(subscriptionId: String) = enqueue { sampler.stop(subscriptionId) }

  override fun acknowledge(subscriptionId: String, sequence: Double) {
    if (!sequence.isFinite() || sequence < 0 || sequence >= Long.MAX_VALUE.toDouble()) return
    enqueue { sampler.acknowledge(subscriptionId, sequence.toLong()) }
  }

  override fun onHostResume() = enqueue { sampler.setActive(true) }

  override fun onHostPause() = enqueue { sampler.setActive(false) }

  override fun onHostDestroy() = enqueue { sampler.setActive(false) }

  override fun invalidate() {
    if (!invalidated.compareAndSet(false, true)) return
    context.removeLifecycleEventListener(this)
    handler.post {
      sampler.invalidate()
      display.setRunning(false)
      handler.removeCallbacks(tick)
      worker.quitSafely()
    }
    super.invalidate()
  }

  private fun enqueue(action: () -> Unit) {
    if (invalidated.get()) return
    handler.post {
      if (!invalidated.get()) {
        action()
        schedule()
      }
    }
  }

  private fun schedule() {
    handler.removeCallbacks(tick)
    display.setRunning(sampler.running)
    sampler.delaySeconds()?.let { handler.postDelayed(tick, ceil(it * 1000).toLong()) }
  }

  companion object {
    const val NAME = "ExamplePerformance"
  }
}
