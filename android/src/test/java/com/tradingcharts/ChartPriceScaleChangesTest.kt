package com.tradingcharts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ChartPriceScaleChangesTest {
  @Test
  fun dispatchedEventsCannotMergeDifferentPanes() {
    assertFalse(PriceScaleChangeEvent(1, 2, "main", "main", 1.1).canCoalesce())
    assertFalse(PriceScaleChangeEvent(1, 2, "volume", "volume", 0.9).canCoalesce())
  }

  @Test
  fun coalescesEachScaleAndEmitsLegacyOnlyForMain() {
    val changes = ChartPriceScaleChanges()
    changes.record(ChartPriceScaleChange("volume", "v", 0.9, false))
    changes.record(ChartPriceScaleChange("main", "m", 1.1, true))
    changes.record(ChartPriceScaleChange("volume", "v", 0.8, false))
    changes.record(ChartPriceScaleChange("main", "m", 1.2, true))
    assertTrue(changes.isPending)
    val main = mutableListOf<Double>()
    val emitted = mutableListOf<ChartPriceScaleChange>()
    changes.emit({ main.add(it) }, { emitted.add(it) })
    assertEquals(listOf(1.2), main)
    assertEquals(listOf("volume", "main"), emitted.map { it.paneId })
    assertEquals(listOf("v", "m"), emitted.map { it.priceScaleId })
    assertEquals(listOf(0.8, 1.2), emitted.map { it.scale })
    assertFalse(changes.isPending)
    changes.emit({ fail("Already drained") }, { fail("Already drained") })
  }

  @Test
  fun secondaryPaneAndNoChangeDoNotEmitLegacyEvent() {
    val changes = ChartPriceScaleChanges()
    changes.record(null)
    changes.emit({ fail("No mutation") }, { fail("No mutation") })
    changes.record(ChartPriceScaleChange("volume", "v", 0.9, false))
    val emitted = mutableListOf<Double>()
    changes.emit({ fail("Secondary pane") }, { emitted.add(it.scale) })
    assertEquals(listOf(0.9), emitted)
  }

  @Test
  fun clearDiscardsPendingChangesAndAllowsNewEvents() {
    val changes = ChartPriceScaleChanges()
    val change = ChartPriceScaleChange("main", "m", 0.9, true)
    changes.record(change)
    changes.clear()
    assertFalse(changes.isPending)
    changes.emit({ fail("Cleared") }, { fail("Cleared") })
    changes.record(change)
    val emitted = mutableListOf<ChartPriceScaleChange>()
    changes.emit({ assertEquals(0.9, it, 0.0) }, { emitted.add(it) })
    assertEquals(listOf(change), emitted)
  }

  @Test
  fun decodesReusableNativeResultWithoutReplayingStaleIds() {
    val result = ChartScaleYResult()
    assertEquals(3, result.numbers.size)
    assertEquals(2, result.strings.size)
    assertNull(result.priceScaleChange())
    // Literal positions pin the JNI output ABI, independently of its constants.
    result.numbers[0] = 1.0
    result.numbers[1] = 0.9
    result.numbers[2] = 0.0
    result.strings[0] = "volume"
    result.strings[1] = "volume-scale"
    assertEquals(
        ChartPriceScaleChange("volume", "volume-scale", 0.9, false),
        result.priceScaleChange(),
    )
    result.numbers[0] = 0.0
    assertNull(result.priceScaleChange())
    result.numbers[0] = 1.0
    result.numbers[2] = 1.0
    result.strings[0] = "main"
    result.strings[1] = "main-scale"
    assertEquals(
        ChartPriceScaleChange("main", "main-scale", 0.9, true),
        result.priceScaleChange(),
    )
  }
}
