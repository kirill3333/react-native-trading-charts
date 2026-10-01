package com.tradingcharts

import org.junit.Assert.*
import org.junit.Test

class ChartRenderingDiagnosticsTest {
  @Test fun observationIsBoundedByChartSurfaceAndSubscriptionLifetime() {
    val source = ChartRenderingDiagnostics
    val owner = source.createOwner()
    try {
      source.bind(owner, "test-chart", true)
      source.surface(owner, 42, true)
      source.observe("test-chart")
      if (!BuildConfig.TRADING_CHARTS_EXAMPLE_DIAGNOSTICS) {
        assertNull(source.snapshot("test-chart"))
        assertEquals(0L, source.beginFrame(owner))
        return
      }
      val token = source.beginFrame(owner)
      source.finishFrame(owner, token)
      assertEquals(1L, source.snapshot("test-chart")!!.frames)
      source.surface(owner, 43, false)
      source.finishFrame(owner, token)
      assertNull(source.snapshot("test-chart"))
      source.surface(owner, 43, true)
      source.finishFrame(owner, token)
      assertEquals(0L, source.snapshot("test-chart")!!.frames)
      assertEquals(43, source.snapshot("test-chart")!!.threadId)
      val next = source.beginFrame(owner)
      source.removeObserver("test-chart")
      source.observe("test-chart")
      source.finishFrame(owner, next)
      assertEquals(0L, source.snapshot("test-chart")!!.frames)
      source.bind(owner, "other-chart", true)
      assertNull(source.snapshot("test-chart"))
      source.finishFrame(owner, source.beginFrame(owner))
    } finally {
      source.removeObserver("test-chart")
      source.dispose(owner)
    }
  }

  @Test fun failedRendererFrameDoesNotIncrementCounter() {
    val renderer = ChartRenderer()
    val owner = renderer.diagnostics ?: return
    try {
      ChartRenderingDiagnostics.bind(owner, "failed-frame", true)
      ChartRenderingDiagnostics.surface(owner, 42, true)
      ChartRenderingDiagnostics.observe("failed-frame")
      renderer.onDrawFrame(null) // No snapshot or program: the renderer exits before submission.
      assertEquals(0L, ChartRenderingDiagnostics.snapshot("failed-frame")!!.frames)
    } finally {
      ChartRenderingDiagnostics.removeObserver("failed-frame")
      ChartRenderingDiagnostics.dispose(owner)
    }
  }
}
