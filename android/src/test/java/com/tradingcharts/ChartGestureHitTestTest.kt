package com.tradingcharts

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChartGestureHitTestTest {
  private val panes =
      listOf(
          pane("main", 8f, 400f),
          pane("volume", 401f, 480f),
          pane("rsi", 481f, 560f),
          pane("macd", 561f, 640f),
      )

  @Test
  fun crosshairCanStartInEveryPaneIncludingWhenItsAxisIsHidden() {
    for (pane in panes) {
      assertTrue(pane.paneId, isPointInPanePlots(panes, 150f, (pane.plotTop + pane.plotBottom) / 2f))
      assertTrue(isPointInPanePlots(panes, pane.plotLeft, pane.plotTop))
      assertTrue(isPointInPanePlots(panes, pane.plotRight, pane.plotBottom))
    }
    val hiddenAxis = panes.map { it.copy(scaleVisible = false) }
    assertTrue(isPointInPanePlots(hiddenAxis, 150f, 520f))
  }

  @Test
  fun rejectsAxesInsetsSeparatorsAndMissingOrCollapsedPanes() {
    assertFalse(isPointInPanePlots(panes, -1f, 520f))
    assertFalse(isPointInPanePlots(panes, 301f, 520f))
    assertFalse(isPointInPanePlots(panes, 150f, 7f))
    assertFalse(isPointInPanePlots(panes, 150f, 641f))
    assertFalse(isPointInPanePlots(panes, 150f, 400.5f))
    assertFalse(isPointInPanePlots(emptyList(), 150f, 520f))
    assertFalse(isPointInPanePlots(listOf(pane("rsi", 480f, 480f)), 150f, 480f))
  }

  @Test
  fun usesUpdatedNativeRectsAfterPaneResizeOrRemoval() {
    val resized = listOf(pane("main", 8f, 300f), pane("volume", 301f, 640f))
    assertTrue(isPointInPanePlots(resized, 150f, 400.5f))
    assertFalse(isPointInPanePlots(resized, 150f, 300.5f))
    assertFalse(isPointInPanePlots(panes.take(1), 150f, 520f))
  }

  private fun pane(id: String, top: Float, bottom: Float) =
      PaneSnapshot(
          paneId = id,
          priceScaleId = id,
          plotLeft = 0f,
          plotTop = top,
          plotRight = 300f,
          plotBottom = bottom,
          heightWeight = 1.0,
          visibleYMin = 0.0,
          visibleYMax = 100.0,
          yAxisScale = 1.0,
          yTicks = emptyList(),
          scaleVisible = true,
          volumeFormat = id == "volume",
          precision = 2,
          rsiScale = id == "rsi",
      )
}
