package com.tradingcharts

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TradingCalendarTest {
  @Test
  fun decodesHolidaysOverridesAndBothNewYorkDstTransitions() {
    val calendar =
        decodeTradingCalendar(
            JSONObject(
                """{"timeZone":"America/New_York","sessions":[],"weekStartsOn":"monday",
                  "holidays":["2024-02-29"],"overrides":[{"date":"2024-03-01","sessions":[]}]}"""
            )
        )
    assertEquals(19782L, calendar.holidayEpochDays.single())
    assertEquals(19783L, calendar.overrides.single().epochDay)
    assertEquals(TimeZoneTransitionConfig(0L, -18000), calendar.transitions.first())
    assertTrue(TimeZoneTransitionConfig(1710054000000L, -14400) in calendar.transitions)
    assertTrue(TimeZoneTransitionConfig(1730613600000L, -18000) in calendar.transitions)
  }
}
