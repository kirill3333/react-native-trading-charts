package com.tradingcharts

import com.tradingcharts.TradingChartsRegistry.Command
import org.junit.Assert.assertEquals
import org.junit.Test

class TradingChartsRegistryTest {
  @Test
  fun overflowPreservesSeriesCreationAndInitialData() {
    val create = Command.AddSeries("options")
    val history = Command.SeriesData("volume", "histogram", doubleArrayOf(0.0, 1.0), false, false)
    val updates =
        (1..256).map {
          Command.SeriesData("volume", "histogram", doubleArrayOf(it.toDouble(), 1.0), false, true)
        }
    val pending = mutableListOf<Command>(create, history)
    for (update in updates) {
      pending += update
      TradingChartsRegistry.trimPending("chart", pending)
    }
    assertEquals(listOf(create, history) + updates.drop(2), pending)
  }
}
