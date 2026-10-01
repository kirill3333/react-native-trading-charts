package tradingcharts.example.performance

import com.tradingcharts.ChartRenderingDiagnostics

/** Serial-queue coordinator; dependencies are injectable for deterministic lifecycle tests. */
internal class PerformanceSampler(
    private val clock: () -> Double,
    private val threads: () -> List<PerformanceThread>,
    private val display: () -> DisplaySample?,
    private val graphics: GraphicsSource,
    private val emit: (Map<String, Any?>) -> Unit,
) {
  interface GraphicsSource {
    fun observe(chartId: String)

    fun remove(chartId: String)

    fun snapshot(chartId: String): ChartRenderingDiagnostics.Snapshot?
  }

  private class Subscription(val measurements: PerformanceMeasurements) {
    val delivery = PerformanceDelivery()
  }

  private val subscriptions = mutableMapOf<String, Subscription>()
  private var active = false
  private var invalidated = false
  val running: Boolean
    get() = active && !invalidated && subscriptions.isNotEmpty()

  fun start(
      id: String,
      chartId: String,
      names: Set<String>,
      includeMain: Boolean,
      interval: Double,
  ) {
    if (invalidated) return
    stop(id)
    val subscription = Subscription(PerformanceMeasurements(chartId, names, includeMain, interval))
    subscriptions[id] = subscription
    if (active) {
      graphics.observe(chartId)
      subscription.measurements.sample(clock(), threads(), display(), graphics.snapshot(chartId))
    }
  }

  fun stop(id: String) {
    val subscription = subscriptions.remove(id) ?: return
    if (active) graphics.remove(subscription.measurements.chartId)
  }

  fun setActive(value: Boolean) {
    if (invalidated || active == value) return
    for (subscription in subscriptions.values) {
      val measurement = subscription.measurements
      if (active) graphics.remove(measurement.chartId)
      measurement.reset()
      subscription.delivery.discardPending()
      if (value) graphics.observe(measurement.chartId)
    }
    active = value
    if (running) tick()
  }

  fun tick() {
    if (!running) return
    val currentThreads = threads()
    val ui = display()
    val time = clock()
    for ((id, subscription) in subscriptions) {
      val measurements = subscription.measurements
      val sample =
          measurements.sample(time, currentThreads, ui, graphics.snapshot(measurements.chartId))
      if (sample != null) subscription.delivery.offer(sample + ("subscriptionId" to id))?.let(emit)
    }
  }

  fun delaySeconds(): Double? =
      if (running) {
        val now = clock()
        subscriptions.values.minOf {
          val measurement = it.measurements
          ((measurement.startTime ?: now) + measurement.interval - now).coerceAtLeast(0.001)
        }
      } else null

  fun acknowledge(id: String, sequence: Long) {
    val event = subscriptions[id]?.delivery?.acknowledge(sequence)
    if (active && event != null) emit(event)
  }

  fun invalidate() {
    setActive(false)
    subscriptions.clear()
    invalidated = true
  }
}
