package tradingcharts.example.performance

import com.tradingcharts.ChartRenderingDiagnostics.Snapshot
import org.junit.Assert.*
import org.junit.Test

class PerformanceSamplerTest {
  private class Graphics : PerformanceSampler.GraphicsSource {
    val watches = mutableMapOf<String, Int>()
    override fun observe(chartId: String) { watches[chartId] = (watches[chartId] ?: 0) + 1 }
    override fun remove(chartId: String) {
      val count = watches.getValue(chartId) - 1
      if (count == 0) watches.remove(chartId) else watches[chartId] = count
    }
    override fun snapshot(chartId: String): Snapshot? = null
  }

  @Test fun independentSubscriptionsPauseResumeAndInvalidation() {
    var now = 0.0
    val events = mutableListOf<Map<String, Any?>>()
    val graphics = Graphics()
    val sampler = PerformanceSampler({ now }, { emptyList() }, { null }, graphics, events::add)
    sampler.start("a", "chart", emptySet(), true, 1.0)
    assertNull(sampler.delaySeconds())
    assertTrue(graphics.watches.isEmpty())
    sampler.setActive(true)
    sampler.start("b", "chart", emptySet(), true, 0.5)
    assertEquals(2, graphics.watches["chart"])
    now = 0.5
    sampler.tick()
    assertEquals(listOf("b"), events.map { it["subscriptionId"] })
    now = 1.0
    sampler.tick()
    assertEquals(listOf("b", "a"), events.map { it["subscriptionId"] })
    sampler.stop("a")
    assertEquals(1, graphics.watches["chart"])
    sampler.setActive(false)
    assertFalse(sampler.running)
    assertTrue(graphics.watches.isEmpty())
    // Pending b sample must not leak through its acknowledgement after background.
    sampler.acknowledge("b", 1)
    assertEquals(2, events.size)
    now = 100.0
    sampler.setActive(true)
    assertEquals(2, events.size)
    now = 100.5
    sampler.tick()
    assertEquals(3, events.size)
    assertEquals(500.0, events.last()["intervalMs"])
    sampler.invalidate()
    sampler.start("late", "chart", emptySet(), true, 1.0)
    sampler.setActive(true)
    sampler.tick()
    assertTrue(graphics.watches.isEmpty())
    assertNull(sampler.delaySeconds())
    assertEquals(3, events.size)
  }

  @Test fun lastUnsubscribeStopsSamplingAndDuplicateIdsReplaceSubscriptions() {
    var reads = 0
    val graphics = Graphics()
    val sampler = PerformanceSampler({ 0.0 }, { reads++; emptyList() }, { null }, graphics) {}
    sampler.setActive(true)
    sampler.start("a", "first", emptySet(), true, 1.0)
    sampler.start("a", "second", emptySet(), true, 1.0)
    assertEquals(mapOf("second" to 1), graphics.watches)
    sampler.stop("a")
    sampler.stop("a")
    val before = reads
    sampler.tick()
    assertEquals(before, reads)
    assertFalse(sampler.running)
    assertNull(sampler.delaySeconds())
  }
}
