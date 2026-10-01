package tradingcharts.example.performance

import com.tradingcharts.ChartRenderingDiagnostics

internal data class DisplaySample(val generation: Long, val frames: Long)

/** All mutable measurement and delivery state belongs to the serial sampler. */
internal class PerformanceMeasurements(
    val chartId: String,
    private val names: Set<String>,
    private val includeMain: Boolean,
    val interval: Double,
) {
  var startTime: Double? = null
    private set

  private var baseline = emptyMap<String, PerformanceThread>()
  private var uiBaseline: DisplaySample? = null
  private var glBaseline: ChartRenderingDiagnostics.Snapshot? = null

  fun reset() {
    startTime = null
    baseline = emptyMap()
    uiBaseline = null
    glBaseline = null
  }

  fun sample(
      time: Double,
      threads: List<PerformanceThread>,
      ui: DisplaySample?,
      gl: ChartRenderingDiagnostics.Snapshot?,
  ): Map<String, Any?>? {
    val start = startTime
    if (start == null) {
      begin(time, threads, ui, gl)
      return null
    }
    val elapsed = time - start
    if (elapsed < interval) return null
    val selected = threads.filter { (includeMain && it.isMainThread) || it.name in names }
    val previousGL = glBaseline
    val frames =
        if (gl != null && previousGL?.generation == gl.generation) {
          (gl.frames - previousGL.frames).takeIf { it >= 0 }
        } else null
    val previousUI = uiBaseline
    val uiFrames =
        if (ui != null && previousUI?.generation == ui.generation) {
          (ui.frames - previousUI.frames).takeIf { it >= 0 }
        } else null
    val glThread = gl?.let { snapshot -> threads.find { it.id == snapshot.threadId.toString() } }
    val result =
        mapOf(
            "timestamp" to time,
            "intervalMs" to elapsed * 1000,
            "chartId" to chartId,
            "threads" to selected.map { cpuRow(it, elapsed) },
            "missingThreadNames" to (names - selected.map { it.name }.toSet()).sorted(),
            "uiFPS" to uiFrames?.div(elapsed),
            "glFPS" to frames?.div(elapsed),
            "renderedFrames" to frames?.toDouble(),
            "glThread" to
                glThread?.let {
                  if (previousGL?.generation == gl.generation) cpuRow(it, elapsed)
                  else it.metadata() + ("cpuPercent" to null)
                },
            "metalFPS" to null,
            "presentedFrames" to null,
        )
    begin(time, threads, ui, gl)
    return result
  }

  private fun cpuRow(thread: PerformanceThread, elapsed: Double): Map<String, Any?> {
    val previous = baseline[thread.id]
    val cpu = thread.cpuSeconds
    val previousCPU = previous?.cpuSeconds
    val sameThread = thread.startTicks != null && previous?.startTicks == thread.startTicks
    if (!sameThread || cpu == null || previousCPU == null) {
      return thread.metadata() + ("cpuPercent" to null)
    }
    val percent =
        if (cpu >= previousCPU) {
          (100 * (cpu - previousCPU) / elapsed).coerceIn(0.0, 100.0)
        } else null
    return thread.metadata() + ("cpuPercent" to percent)
  }

  private fun begin(
      time: Double,
      threads: List<PerformanceThread>,
      ui: DisplaySample?,
      gl: ChartRenderingDiagnostics.Snapshot?,
  ) {
    startTime = time
    baseline = threads.associateBy { it.id }
    uiBaseline = ui
    glBaseline = gl
  }
}

internal class PerformanceDelivery {
  private var sequence = 0L
  private var outstanding: Long? = null
  private var latest: Map<String, Any?>? = null

  fun offer(sample: Map<String, Any?>): Map<String, Any?>? {
    if (outstanding != null) {
      latest = sample
      return null
    }
    outstanding = ++sequence
    return sample + ("sequence" to sequence.toDouble())
  }

  fun acknowledge(value: Long): Map<String, Any?>? {
    if (outstanding != value) return null
    outstanding = null
    val pending = latest
    latest = null
    return pending?.let(::offer)
  }

  fun discardPending() {
    latest = null
  }
}
