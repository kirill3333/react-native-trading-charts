package com.tradingcharts

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ChartEngineTransportAbiTest {
  @Test
  fun configPayloadOmitsYAxisPosition() {
    val payload =
        ChartConfig(
                showYAxis = false,
                yAxisWidth = 123f,
                allowPan = false,
            )
            .nativeNumbers()

    assertEquals(45, payload.size)
    assertEquals(0.0, payload[5], 0.0)
    assertEquals(123.0, payload[6], 0.0)
    assertEquals(0.0, payload[11], 0.0)
  }

  @Test
  fun smaSourceUsesAppendedTransportFields() {
    val payload =
        SeriesConfig(
                seriesId = "sma",
                type = "line",
                paneId = "main",
                priceScaleId = "main",
                sourceType = "ohlcvSma",
                sourceSeriesId = "main",
                color = 0,
                upColor = 0,
                downColor = 0,
                lineGradientTopColor = 0,
                lineGradientBottomColor = 0,
                movingAveragePeriod = UInt.MAX_VALUE.toLong(),
                areaFillTopColor = 0,
                areaFillBottomColor = 0,
                rsiLevelLineColor = 0,
                rsiBandColor = 0,
                macdSignalColor = 0,
                macdSignalGradientTopColor = 0,
                macdSignalGradientBottomColor = 0,
                macdPositiveIncreasingColor = 0,
                macdPositiveDecreasingColor = 0,
                macdNegativeIncreasingColor = 0,
                macdNegativeDecreasingColor = 0,
                macdZeroLineColor = 0,
            )
            .nativeTransportPayload()

    assertEquals(3.0, payload.numbers[SeriesTransportAbi.NumberIndex.SOURCE], 0.0)
    assertEquals(
        UInt.MAX_VALUE.toDouble(),
        payload.numbers[SeriesTransportAbi.NumberIndex.MOVING_AVERAGE_PERIOD],
        0.0,
    )
  }

  @Test
  fun seriesPayloadUsesNamedVersionedLayout() {
    val payload =
        SeriesConfig(
                seriesId = "series",
                type = "area",
                paneId = "pane",
                priceScaleId = "scale",
                visible = false,
                sourceType = "ohlcvEma",
                sourceSeriesId = "source",
                color = 0x10203040,
                upColor = 0x50607080,
                downColor = 0x10213243,
                declarative = true,
                lineWidthPx = 2.5f,
                lineSource = "high",
                lineGradientTopColor = 0x20314253,
                lineGradientBottomColor = 0x30415263,
                lineGradientEnabled = true,
                lineGapThresholdMs = 1234.0,
                lineDashed = true,
                movingAveragePeriod = 50L,
                areaFillTopColor = 0x40516273,
                areaFillBottomColor = 0x50617203,
                rsiPeriod = 17,
                rsiOversold = 31.0,
                rsiOverbought = 69.0,
                rsiTextColor = 0x60718213,
                rsiLevelLineColor = 0x70819223,
                rsiBandColor = 0x10293847,
                macdFastPeriod = 8,
                macdSlowPeriod = 21,
                macdSignalPeriod = 5,
                macdSignalColor = 0x11223344,
                macdSignalGradientTopColor = 0x22334455,
                macdSignalGradientBottomColor = 0x33445566,
                macdSignalLineWidthPx = 3f,
                macdPositiveIncreasingColor = 0x55667788,
                macdPositiveDecreasingColor = 0x11224466,
                macdNegativeIncreasingColor = 0x778899aa.toInt(),
                macdNegativeDecreasingColor = 0x22334455,
                macdZeroLineColor = 0x33445566,
                macdTextColor = 0x44556677,
            )
            .nativeTransportPayload()

    assertEquals(SeriesTransportAbi.NumberIndex.SIZE, payload.numbers.size)
    assertEquals(SeriesTransportAbi.ColorIndex.SIZE, payload.colors.size)
    assertEquals(SeriesTransportAbi.StringIndex.SIZE, payload.strings.size)
    assertEquals(
        CHART_ENGINE_TRANSPORT_ABI_VERSION.toDouble(),
        payload.numbers[SeriesTransportAbi.NumberIndex.VERSION],
        0.0,
    )
    assertEquals(5.0, payload.numbers[SeriesTransportAbi.NumberIndex.TYPE], 0.0)
    assertEquals(4.0, payload.numbers[SeriesTransportAbi.NumberIndex.SOURCE], 0.0)
    assertEquals(17.0, payload.numbers[SeriesTransportAbi.NumberIndex.RSI_PERIOD], 0.0)
    assertEquals(1.0, payload.numbers[SeriesTransportAbi.NumberIndex.RSI_TEXT_COLOR_SET], 0.0)
    assertEquals(1.0, payload.numbers[SeriesTransportAbi.NumberIndex.LINE_DASHED], 0.0)
    assertEquals(
        50.0,
        payload.numbers[SeriesTransportAbi.NumberIndex.MOVING_AVERAGE_PERIOD],
        0.0,
    )
    assertEquals(8.0, payload.numbers[SeriesTransportAbi.NumberIndex.MACD_FAST_PERIOD], 0.0)
    assertEquals(21.0, payload.numbers[SeriesTransportAbi.NumberIndex.MACD_SLOW_PERIOD], 0.0)
    assertEquals(5.0, payload.numbers[SeriesTransportAbi.NumberIndex.MACD_SIGNAL_PERIOD], 0.0)
    assertEquals(1.0, payload.numbers[SeriesTransportAbi.NumberIndex.MACD_TEXT_COLOR_SET], 0.0)
    assertArrayEquals(
        arrayOf(SeriesTransportAbi.STRING_MARKER, "series", "pane", "scale", "source"),
        payload.strings,
    )
    assertEquals(0x20 / 255f, payload.colors[SeriesTransportAbi.ColorIndex.COLOR], 0f)
    assertEquals(0x10 / 255f, payload.colors[SeriesTransportAbi.ColorIndex.COLOR + 3], 0f)
    assertEquals(0x71 / 255f, payload.colors[SeriesTransportAbi.ColorIndex.RSI_TEXT], 0f)
    assertEquals(0x22 / 255f, payload.colors[SeriesTransportAbi.ColorIndex.MACD_SIGNAL], 0f)
    assertEquals(0x55 / 255f, payload.colors[SeriesTransportAbi.ColorIndex.MACD_TEXT], 0f)
  }

  @Test
  fun snapshotRecordsDecodeOnlyExactMatchingPayloads() {
    val values =
        doubleArrayOf(
            CHART_ENGINE_TRANSPORT_ABI_VERSION.toDouble(),
            SnapshotTransportAbi.PANE_RECORD_WIDTH.toDouble(),
            2.0,
            *DoubleArray(SnapshotTransportAbi.PANE_RECORD_WIDTH * 2) { 100.0 + it },
        )

    val payload =
        decodeSnapshotRecordPayload(
            values,
            SnapshotTransportAbi.PANE_RECORD_WIDTH,
            "panes",
        )

    assertEquals(2, payload.recordCount)
    assertEquals(3, payload.offset(0))
    assertEquals(17, payload.offset(1))
    assertEquals(100.0, payload.values[payload.offset(0)], 0.0)
    assertEquals(114.0, payload.values[payload.offset(1)], 0.0)
    val pane = payload.paneRecord(0)
    assertEquals(100f, pane.plotLeft)
    assertEquals(101f, pane.plotTop)
    assertEquals(102f, pane.plotRight)
    assertEquals(103f, pane.plotBottom)
    assertEquals(104.0, pane.heightWeight, 0.0)
    assertEquals(105.0, pane.visibleYMin, 0.0)
    assertEquals(106.0, pane.visibleYMax, 0.0)
    assertEquals(107.0, pane.yAxisScale, 0.0)
    assertEquals(108, pane.yTickOffset)
    assertEquals(109, pane.yTickCount)
    assertEquals(true, pane.scaleVisible)
    assertEquals(true, pane.volumeFormat)
    assertEquals(112, pane.precision)
    assertEquals(true, pane.rsiScale)

    assertThrows(IllegalStateException::class.java) {
      decodeSnapshotRecordPayload(values.copyOf(values.size - 1), 14, "panes")
    }
    assertThrows(IllegalStateException::class.java) {
      decodeSnapshotRecordPayload(values.copyOf().also { it[0] = 99.0 }, 14, "panes")
    }
    assertThrows(IllegalStateException::class.java) {
      decodeSnapshotRecordPayload(values.copyOf().also { it[1] = 13.0 }, 14, "panes")
    }
    assertThrows(IllegalStateException::class.java) {
      decodeSnapshotRecordPayload(values.copyOf().also { it[2] = 1.5 }, 14, "panes")
    }
  }

  @Test
  fun indicatorSnapshotRecordUnpacksMacdValuesByNamedOffset() {
    val values = DoubleArray(3 + SnapshotTransportAbi.INDICATOR_LEGEND_RECORD_WIDTH)
    values[0] = CHART_ENGINE_TRANSPORT_ABI_VERSION.toDouble()
    values[1] = SnapshotTransportAbi.INDICATOR_LEGEND_RECORD_WIDTH.toDouble()
    values[2] = 1.0
    val offset = 3
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.PANE_INDEX] = 2.0
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.KIND] = 1.0
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.FAST_PERIOD] = 12.0
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.SLOW_PERIOD] = 26.0
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.SIGNAL_PERIOD] = 9.0
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.VALUE_SOURCE] = 3.0
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.VALUE_COUNT] = 3.0
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.TEXT_COLOR_SET] = 1.0
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.TEXT_COLOR] = 0.1
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.TEXT_COLOR + 1] = 0.2
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.TEXT_COLOR + 2] = 0.3
    values[offset + SnapshotTransportAbi.IndicatorLegendIndex.TEXT_COLOR + 3] = 0.4
    repeat(3) { valueIndex ->
      val valueOffset =
          offset +
              SnapshotTransportAbi.IndicatorLegendIndex.VALUES +
              valueIndex * SnapshotTransportAbi.IndicatorLegendIndex.VALUE_RECORD_WIDTH
      values[valueOffset] = 10.0 + valueIndex
      values[valueOffset + 1] = if (valueIndex == 1) 0.0 else 1.0
      values[valueOffset + 2] = 0.5
      values[valueOffset + 3] = 0.6
      values[valueOffset + 4] = 0.7
      values[valueOffset + 5] = 0.8
    }
    val payload =
        decodeSnapshotRecordPayload(
            values,
            SnapshotTransportAbi.INDICATOR_LEGEND_RECORD_WIDTH,
            "indicator legends",
        )

    val legend = payload.indicatorLegendRecord(0)
    assertEquals(2, legend.paneIndex)
    assertEquals(1, legend.kind)
    assertEquals(12, legend.fastPeriod)
    assertEquals(26, legend.slowPeriod)
    assertEquals(9, legend.signalPeriod)
    assertEquals(3, legend.valueSource)
    assertEquals(0x6619334c, legend.textColor)
    assertEquals(true, legend.textColorSet)
    assertEquals(3, legend.values.size)
    assertEquals(10.0, legend.values[0].value, 0.0)
    assertEquals(false, legend.values[1].hasValue)
    assertEquals(0xcc7f99b2.toInt(), legend.values[2].color)
  }

  @Test
  fun descriptorAndSentinelRoundTripFailFastOnAnyMismatch() {
    validateTransportDescriptor(
        intArrayOf(
            CHART_ENGINE_TRANSPORT_ABI_VERSION,
            25,
            80,
            5,
            3,
            2,
            14,
            31,
            17,
        )
    )
    val expectedRoundTrip =
        DoubleArray(SeriesTransportAbi.ROUND_TRIP_SIZE).also { values ->
          values[0] = CHART_ENGINE_TRANSPORT_ABI_VERSION.toDouble()
          values[1] = SeriesTransportAbi.ROUND_TRIP_NUMBER_COUNT.toDouble()
          values[2] = SeriesTransportAbi.ROUND_TRIP_COLOR_COUNT.toDouble()
          values[3] = 4.0
          var target = 4
          repeat(SeriesTransportAbi.ROUND_TRIP_NUMBER_COUNT) {
            values[target++] = 101.0 + it
          }
          repeat(SeriesTransportAbi.ROUND_TRIP_COLOR_COUNT) {
            values[target++] = 201.0 + it
          }
          intArrayOf(1, 3, 5, 7).forEach { values[target++] = it.toDouble() }
        }
    validateSeriesRoundTrip(expectedRoundTrip)

    assertThrows(IllegalStateException::class.java) {
      validateTransportDescriptor(intArrayOf(1, 25, 80, 5, 3, 2, 14, 31, 17))
    }
    assertThrows(IllegalStateException::class.java) {
      validateSeriesRoundTrip(expectedRoundTrip.copyOf().also { it[27] = -1.0 })
    }
  }
}
