package tradingcharts.example.performance

import com.tradingcharts.ChartRenderingDiagnostics.Snapshot
import java.io.File
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PerformanceMeasurementsTest {
  @get:Rule val temporary = TemporaryFolder()

  private fun thread(id: String = "7", start: Long = 10, cpu: Double? = 1.0) =
      PerformanceThread(id, "mqt_v_js", start, cpu, false, true)

  private fun measurement() = PerformanceMeasurements("chart", setOf("mqt_v_js"), true, 1.0)

  @Test fun parsesNamesWithSpacesAndParenthesesAndUsesSystemTicks() {
    val fields = MutableList(20) { "0" }
    fields[0] = "R"
    fields[11] = "120"
    fields[12] = "30"
    fields[19] = "1234"
    val parsed = PerformanceThreadReader.parse("7 (worker (JS) name) ${fields.joinToString(" ")}", 100.0, 1, 7)!!
    assertEquals("worker (JS) name", parsed.name)
    assertEquals(1.5, parsed.cpuSeconds!!, 0.0001)
    assertEquals(1234L, parsed.startTicks)
    assertTrue(parsed.isJSThread)
    assertFalse(parsed.isMainThread)
    assertNull(PerformanceThreadReader.parse("garbage", 100.0, 1, null))
    assertNull(PerformanceThreadReader.parse("7 (JS) R", 0.0, 1, null))
  }

  @Test fun unavailableDirectoryAndFailedThreadReadAreDistinct() {
    assertNull(PerformanceThreadReader.readDirectory(File(temporary.root, "missing"), 100.0, 1, 7))
    val directory = temporary.newFolder("tasks")
    val task = File(directory, "7").apply { mkdir() }
    File(task, "comm").writeText("mqt_v_js\n")
    val result = PerformanceThreadReader.readDirectory(directory, 100.0, 1, 7)!!
    assertEquals(1, result.size)
    assertEquals("mqt_v_js", result.single().name)
    assertNull(result.single().cpuSeconds)
  }

  @Test fun cpuUsesElapsedTimeAndRejectsReusedTidOrFailedReads() {
    val window = measurement()
    assertNull(window.sample(10.0, listOf(thread()), null, null))
    assertNull(window.sample(10.5, listOf(thread()), null, null))
    val sample = window.sample(12.0, listOf(thread(cpu = 1.5)), null, null)!!
    assertEquals(25.0, rows(sample).single()["cpuPercent"])
    assertEquals(2000.0, sample["intervalMs"])
    assertNull(rows(window.sample(13.0, listOf(thread(start = 20, cpu = 10.0)), null, null)!!).single()["cpuPercent"])
    assertNull(rows(window.sample(14.0, listOf(thread(start = 20, cpu = null)), null, null)!!).single()["cpuPercent"])
    assertNull(rows(window.sample(15.0, listOf(thread(start = 20, cpu = 11.0)), null, null)!!).single()["cpuPercent"])
  }

  @Test fun duplicateAndMissingNamesRemainDistinct() {
    val window = measurement()
    window.sample(1.0, listOf(thread("7"), thread("8")), null, null)
    val sample = window.sample(2.0, listOf(thread("7", cpu = 1.1), thread("8", cpu = 1.2)), null, null)!!
    assertEquals(listOf("7", "8"), rows(sample).map { it["id"] })
    val missing = window.sample(3.0, emptyList(), null, null)!!
    assertEquals(listOf("mqt_v_js"), missing["missingThreadNames"])
  }

  @Test fun glAndUiUseFullWindowsAndResetAcrossSurfaceOrActivityChanges() {
    val window = measurement()
    window.sample(1.0, listOf(thread()), DisplaySample(1, 0), Snapshot(1, 0, 7))
    val sample = window.sample(3.0, listOf(thread(cpu = 1.5)), DisplaySample(1, 120), Snapshot(1, 20, 7))!!
    assertEquals(60.0, sample["uiFPS"])
    assertEquals(10.0, sample["glFPS"])
    assertEquals(20.0, sample["renderedFrames"])
    assertEquals(25.0, (sample["glThread"] as Map<*, *>)["cpuPercent"])
    val idle = window.sample(4.0, listOf(thread()), DisplaySample(1, 120), Snapshot(1, 20, 7))!!
    assertEquals(0.0, idle["glFPS"])
    assertEquals(0.0, idle["uiFPS"])
    val recreated = window.sample(5.0, listOf(thread()), DisplaySample(2, 180), Snapshot(2, 21, 7))!!
    assertNull(recreated["uiFPS"])
    assertNull(recreated["glFPS"])
    assertNull((recreated["glThread"] as Map<*, *>)["cpuPercent"])
    window.reset()
    assertNull(window.sample(100.0, emptyList(), null, null))
    val disconnected = window.sample(101.0, emptyList(), null, null)!!
    assertNull(disconnected["glThread"])
    assertNull(disconnected["glFPS"])
    assertNull(disconnected["metalFPS"])
  }

  @Test fun deliveryKeepsOnlyLatestAndRejectsStaleAcknowledgement() {
    val delivery = PerformanceDelivery()
    assertEquals(1.0, delivery.offer(mapOf("timestamp" to 1))!!["sequence"])
    repeat(1000) { assertNull(delivery.offer(mapOf("timestamp" to it))) }
    assertNull(delivery.acknowledge(0))
    val latest = delivery.acknowledge(1)!!
    assertEquals(999, latest["timestamp"])
    assertEquals(2.0, latest["sequence"])
    assertNull(delivery.acknowledge(1))
    delivery.offer(mapOf("timestamp" to 1001))
    delivery.discardPending()
    assertNull(delivery.acknowledge(2))
  }

  @Suppress("UNCHECKED_CAST")
  private fun rows(sample: Map<String, Any?>) = sample["threads"] as List<Map<String, Any?>>
}
