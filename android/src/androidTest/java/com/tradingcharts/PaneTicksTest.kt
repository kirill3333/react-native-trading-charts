package com.tradingcharts

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PaneTicksTest {
  @Test
  fun snapshotSuppliesEachPaneWithTicksInItsOwnCoordinates() {
    val defaults = ChartConfig()
    val main = defaults.panes.single()
    val config =
        defaults.copy(panes = listOf(main, main.copy(paneId = "second", priceScaleId = "second")))
    val handle = ChartEngineNative.nativeCreate()
    try {
      ChartEngineNative.setConfig(handle, config)
      ChartEngineNative.nativeSetSize(handle, 600f, 600f)
      val candles = doubleArrayOf(0.0, 110.0, 125.0, 105.0, 120.0, 10.0)
      assertEquals(0, ChartEngineNative.nativeSetHistory(handle, candles))
      val frame =
          checkNotNull(ChartEngineNative.snapshot(handle, config, null, ContentVertexBufferPool()))
      try {
        val panes = frame.snapshot.panes
        assertEquals(listOf("main", "second"), panes.map { it.paneId })
        for (pane in panes) {
          assertTrue(pane.yTicks.isNotEmpty())
          assertTrue(pane.yTicks.all { it.position in pane.plotTop..pane.plotBottom })
          assertTrue(pane.yTicks.all { it.value in pane.visibleYMin..pane.visibleYMax })
        }
        assertTrue(panes[0].yTicks.first().value > panes[1].yTicks.last().value)
      } finally {
        frame.contentVertices?.release()
      }
    } finally {
      ChartEngineNative.nativeDestroy(handle)
    }
  }
}
