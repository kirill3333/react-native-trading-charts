package com.tradingcharts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChartRealTimeScrollControllerTest {
  @Test
  fun followsCubicEaseOutAndStopsExactlyAtDuration() {
    var nowMs = 1_000L
    val controller = ChartRealTimeScrollController(durationMs = 300.0) { nowMs }
    val progress = mutableListOf<Double>()

    controller.start()
    controller.step { value ->
      progress += value
      true
    }
    nowMs += 150L
    controller.step { value ->
      progress += value
      true
    }
    nowMs += 150L
    controller.step { value ->
      progress += value
      true
    }

    assertEquals(2, progress.size)
    assertEquals(0.875, progress[0], 0.0)
    assertEquals(1.0, progress[1], 0.0)
    assertFalse(controller.isActive)
  }

  @Test
  fun restartingUsesTheCurrentTimeAndNoMovementStopsScheduling() {
    var nowMs = 10L
    val controller = ChartRealTimeScrollController(durationMs = 300.0) { nowMs }

    controller.start()
    nowMs += 200L
    controller.step { true }
    controller.start()
    nowMs += 100L

    var restartedProgress = 0.0
    controller.step { value ->
      restartedProgress = value
      false
    }

    assertEquals(1.0 - (2.0 / 3.0) * (2.0 / 3.0) * (2.0 / 3.0), restartedProgress, 1e-12)
    assertFalse(controller.isActive)

    controller.start()
    assertTrue(controller.isActive)
    controller.stop()
    assertFalse(controller.isActive)
  }
}
