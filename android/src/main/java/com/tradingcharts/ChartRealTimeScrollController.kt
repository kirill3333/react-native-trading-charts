package com.tradingcharts

import android.os.SystemClock

internal class ChartRealTimeScrollController(
    private val durationMs: Double = 300.0,
    private val currentTimeMs: () -> Long = SystemClock::uptimeMillis,
) {
  var isActive = false
    private set

  private var startedAtMs = 0L
  private var previousProgress = 0.0

  fun start() {
    isActive = true
    startedAtMs = currentTimeMs()
    previousProgress = 0.0
  }

  fun stop() {
    isActive = false
    startedAtMs = 0L
    previousProgress = 0.0
  }

  fun step(move: (Double) -> Boolean) {
    if (!isActive) return
    val elapsed = (currentTimeMs() - startedAtMs).coerceAtLeast(0L)
    val linear = (elapsed.toDouble() / durationMs).coerceIn(0.0, 1.0)
    val remaining = 1.0 - linear
    val eased = 1.0 - remaining * remaining * remaining
    val unconsumed = 1.0 - previousProgress
    if (eased <= previousProgress && linear < 1.0) return
    val relativeProgress =
        if (linear >= 1.0 || unconsumed <= 0.0) {
          1.0
        } else {
          (eased - previousProgress) / unconsumed
        }
    val moved = move(relativeProgress)
    previousProgress = eased
    if (!moved || linear >= 1.0) stop()
  }
}
