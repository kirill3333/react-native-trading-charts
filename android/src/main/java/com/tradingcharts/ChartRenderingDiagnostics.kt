package com.tradingcharts

/** Example-only observations of GL submissions, not GPU completion or screen presentations. */
object ChartRenderingDiagnostics {
  class Owner internal constructor() {
    internal var chartId: String? = null
    internal var active = false
    internal var ready = false
    internal var threadId = 0
    internal var generation = 0L
    internal var frames = 0L
  }

  data class Snapshot(val generation: Long, val frames: Long, val threadId: Int)

  private val owners = mutableSetOf<Owner>()
  private val observers = mutableMapOf<String, Int>()
  private var generation = 0L

  @Synchronized fun createOwner(): Owner = Owner().also { owners.add(it) }

  @Synchronized
  fun bind(owner: Owner, chartId: String?, active: Boolean) {
    if (owner.chartId != chartId || owner.active != active) {
      owner.chartId = chartId
      owner.active = active
      reset(owner)
    }
  }

  @Synchronized
  fun surface(owner: Owner, threadId: Int, ready: Boolean) {
    owner.threadId = threadId
    owner.ready = ready
    reset(owner)
  }

  @Synchronized
  fun dispose(owner: Owner) {
    owners.remove(owner)
    owner.active = false
    reset(owner)
  }

  @Synchronized
  fun observe(chartId: String) {
    if (!BuildConfig.TRADING_CHARTS_EXAMPLE_DIAGNOSTICS) return
    observers[chartId] = (observers[chartId] ?: 0) + 1
    if (observers[chartId] == 1) owners.filter { it.chartId == chartId }.forEach(::reset)
  }

  @Synchronized
  fun removeObserver(chartId: String) {
    val remaining = (observers[chartId] ?: 0) - 1
    if (remaining > 0) observers[chartId] = remaining else observers.remove(chartId)
  }

  @Synchronized
  fun snapshot(chartId: String): Snapshot? {
    if (!BuildConfig.TRADING_CHARTS_EXAMPLE_DIAGNOSTICS || !observers.containsKey(chartId))
        return null
    // Duplicate chart IDs are ambiguous: never attribute an arbitrary renderer's CPU.
    val owner = owners.singleOrNull { it.chartId == chartId && it.active && it.ready }
    return owner?.let { Snapshot(it.generation, it.frames, it.threadId) }
  }

  @Synchronized
  fun beginFrame(owner: Owner): Long =
      if (owner.active && owner.ready && observers.containsKey(owner.chartId)) owner.generation
      else 0

  @Synchronized
  fun finishFrame(owner: Owner, token: Long) {
    if (token != 0L && token == beginFrame(owner)) owner.frames++
  }

  private fun reset(owner: Owner) {
    owner.generation = ++generation
    owner.frames = 0
  }
}
