package com.tradingcharts

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeclarativeSeriesTest {
  @Test
  fun appliesForwardReferenceAndRejectsWholeInvalidConfiguration() {
    val source =
        SeriesConfig(seriesId = "prices", type = "bar", paneId = "main", priceScaleId = "main")
    val average =
        source.copy(
            seriesId = "sma",
            type = "line",
            sourceType = "ohlcvSma",
            sourceSeriesId = "prices",
            movingAveragePeriod = 2L,
        )
    val config = ChartConfig(additionalSeries = listOf(average, source))
    val handle = ChartEngineNative.nativeCreate()
    try {
      assertEquals(0, ChartEngineNative.setConfig(handle, config))
      ChartEngineNative.nativeSetSize(handle, 600f, 400f)
      val candles = doubleArrayOf(0.0, 2.0, 2.0, 2.0, 2.0, 1.0, 60000.0, 6.0, 6.0, 6.0, 6.0, 1.0)
      assertEquals(0, ChartEngineNative.nativeSetHistory(handle, candles))
      assertEquals(0, ChartEngineNative.nativeSetSeriesData(handle, "prices", false, candles))
      assertEquals(
          0,
          ChartEngineNative.setConfig(
              handle,
              config.copy(additionalSeries = listOf(source, average)),
          ),
      )
      val revision = ChartEngineNative.nativeEngineRevision(handle)
      val invalid =
          config.copy(
              initialVisibleCount = 3,
              additionalSeries = listOf(source, average.copy(sourceSeriesId = "absent")),
          )
      assertEquals(2, ChartEngineNative.setConfig(handle, invalid))
      assertEquals(revision, ChartEngineNative.nativeEngineRevision(handle))
      val frame =
          checkNotNull(ChartEngineNative.snapshot(handle, config, null, ContentVertexBufferPool()))
      try {
        assertEquals(4.0, frame.snapshot.indicatorLegends.single().values.first().value, 0.0)
      } finally {
        frame.contentVertices?.release()
      }
    } finally {
      ChartEngineNative.nativeDestroy(handle)
    }
  }
}
