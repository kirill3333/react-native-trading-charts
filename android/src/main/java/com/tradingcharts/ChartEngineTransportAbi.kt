package com.tradingcharts

internal const val CHART_ENGINE_TRANSPORT_ABI_VERSION = 3

internal object SeriesTransportAbi {
  const val STRING_MARKER = "TradingCharts.Series.v3"

  object NumberIndex {
    const val VERSION = 0
    const val NUMBER_SIZE = 1
    const val COLOR_SIZE = 2
    const val STRING_SIZE = 3
    const val TYPE = 4
    const val SOURCE = 5
    const val VISIBLE = 6
    const val DECLARATIVE = 7
    const val LINE_WIDTH = 8
    const val LINE_SOURCE = 9
    const val LINE_GRADIENT_ENABLED = 10
    const val LINE_GAP_THRESHOLD_MS = 11
    const val RSI_PERIOD = 12
    const val RSI_OVERSOLD = 13
    const val RSI_OVERBOUGHT = 14
    const val RSI_TEXT_COLOR_SET = 15
    const val LINE_DASHED = 16
    const val MOVING_AVERAGE_PERIOD = 17
    const val MACD_FAST_PERIOD = 18
    const val MACD_SLOW_PERIOD = 19
    const val MACD_SIGNAL_PERIOD = 20
    const val MACD_TEXT_COLOR_SET = 21
    const val MACD_SIGNAL_LINE_WIDTH = 22
    const val MACD_SIGNAL_GRADIENT_ENABLED = 23
    const val MACD_SIGNAL_LINE_DASHED = 24
    const val SIZE = 25
  }

  object ColorIndex {
    const val VERSION = 0
    const val NUMBER_SIZE = 1
    const val COLOR_SIZE = 2
    const val STRING_SIZE = 3
    const val COLOR = 4
    const val UP = 8
    const val DOWN = 12
    const val LINE_GRADIENT_TOP = 16
    const val LINE_GRADIENT_BOTTOM = 20
    const val AREA_FILL_TOP = 24
    const val AREA_FILL_BOTTOM = 28
    const val RSI_LEVEL_LINE = 32
    const val RSI_BAND = 36
    const val RSI_TEXT = 40
    const val MACD_SIGNAL = 44
    const val MACD_SIGNAL_GRADIENT_TOP = 48
    const val MACD_SIGNAL_GRADIENT_BOTTOM = 52
    const val MACD_POSITIVE_INCREASING = 56
    const val MACD_POSITIVE_DECREASING = 60
    const val MACD_NEGATIVE_INCREASING = 64
    const val MACD_NEGATIVE_DECREASING = 68
    const val MACD_ZERO_LINE = 72
    const val MACD_TEXT = 76
    const val SIZE = 80
  }

  object StringIndex {
    const val MARKER = 0
    const val SERIES_ID = 1
    const val PANE_ID = 2
    const val PRICE_SCALE_ID = 3
    const val SOURCE_SERIES_ID = 4
    const val SIZE = 5
  }

  const val ROUND_TRIP_NUMBER_COUNT = 21
  const val ROUND_TRIP_COLOR_COUNT = 76
  const val ROUND_TRIP_STRING_COUNT = 4
  const val ROUND_TRIP_HEADER_SIZE = 4
  const val ROUND_TRIP_SIZE =
      ROUND_TRIP_HEADER_SIZE +
          ROUND_TRIP_NUMBER_COUNT +
          ROUND_TRIP_COLOR_COUNT +
          ROUND_TRIP_STRING_COUNT
}

internal data class SeriesTransportPayload(
    val strings: Array<String>,
    val numbers: DoubleArray,
    val colors: FloatArray,
)

private fun String.nativeSeriesType() =
    when (this) {
      "bar" -> 1.0
      "hollowCandlestick" -> 2.0
      "histogram" -> 3.0
      "line" -> 4.0
      "macd" -> 4.0
      "area" -> 5.0
      else -> 0.0
    }

private fun String.nativeLineSource() =
    when (this) {
      "open" -> 0.0
      "high" -> 1.0
      "low" -> 2.0
      else -> 3.0
    }

private fun putColor(target: FloatArray, offset: Int, color: Int) {
  target[offset] = ((color ushr 16) and 0xff) / 255f
  target[offset + 1] = ((color ushr 8) and 0xff) / 255f
  target[offset + 2] = (color and 0xff) / 255f
  target[offset + 3] = ((color ushr 24) and 0xff) / 255f
}

private fun Boolean.transportDouble() = if (this) 1.0 else 0.0

private fun SeriesConfig.nativeSeriesNumbers(): DoubleArray {
  val numbers = DoubleArray(SeriesTransportAbi.NumberIndex.SIZE)
  numbers[SeriesTransportAbi.NumberIndex.VERSION] = CHART_ENGINE_TRANSPORT_ABI_VERSION.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.NUMBER_SIZE] = numbers.size.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.COLOR_SIZE] = SeriesTransportAbi.ColorIndex.SIZE.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.STRING_SIZE] =
      SeriesTransportAbi.StringIndex.SIZE.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.TYPE] = type.nativeSeriesType()
  numbers[SeriesTransportAbi.NumberIndex.SOURCE] =
      when (sourceType) {
        "ohlcvVolume" -> 1.0
        "ohlcvRsi" -> 2.0
        "ohlcvSma" -> 3.0
        "ohlcvEma" -> 4.0
        "ohlcvMacd" -> 5.0
        else -> 0.0
      }
  numbers[SeriesTransportAbi.NumberIndex.VISIBLE] = visible.transportDouble()
  numbers[SeriesTransportAbi.NumberIndex.DECLARATIVE] = declarative.transportDouble()
  numbers[SeriesTransportAbi.NumberIndex.LINE_WIDTH] = lineWidthPx.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.LINE_SOURCE] = lineSource.nativeLineSource()
  numbers[SeriesTransportAbi.NumberIndex.LINE_GRADIENT_ENABLED] =
      lineGradientEnabled.transportDouble()
  numbers[SeriesTransportAbi.NumberIndex.LINE_GAP_THRESHOLD_MS] = lineGapThresholdMs
  numbers[SeriesTransportAbi.NumberIndex.RSI_PERIOD] = rsiPeriod.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.RSI_OVERSOLD] = rsiOversold
  numbers[SeriesTransportAbi.NumberIndex.RSI_OVERBOUGHT] = rsiOverbought
  numbers[SeriesTransportAbi.NumberIndex.RSI_TEXT_COLOR_SET] =
      (rsiTextColor != null).transportDouble()
  numbers[SeriesTransportAbi.NumberIndex.LINE_DASHED] = lineDashed.transportDouble()
  numbers[SeriesTransportAbi.NumberIndex.MOVING_AVERAGE_PERIOD] = movingAveragePeriod.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.MACD_FAST_PERIOD] = macdFastPeriod.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.MACD_SLOW_PERIOD] = macdSlowPeriod.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.MACD_SIGNAL_PERIOD] = macdSignalPeriod.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.MACD_TEXT_COLOR_SET] =
      (macdTextColor != null).transportDouble()
  numbers[SeriesTransportAbi.NumberIndex.MACD_SIGNAL_LINE_WIDTH] = macdSignalLineWidthPx.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.MACD_SIGNAL_GRADIENT_ENABLED] =
      macdSignalGradientEnabled.transportDouble()
  numbers[SeriesTransportAbi.NumberIndex.MACD_SIGNAL_LINE_DASHED] =
      macdSignalLineDashed.transportDouble()
  return numbers
}

private fun SeriesConfig.nativeSeriesColors(numbers: DoubleArray): FloatArray {
  val colors = FloatArray(SeriesTransportAbi.ColorIndex.SIZE)
  colors[SeriesTransportAbi.ColorIndex.VERSION] = CHART_ENGINE_TRANSPORT_ABI_VERSION.toFloat()
  colors[SeriesTransportAbi.ColorIndex.NUMBER_SIZE] = numbers.size.toFloat()
  colors[SeriesTransportAbi.ColorIndex.COLOR_SIZE] = colors.size.toFloat()
  colors[SeriesTransportAbi.ColorIndex.STRING_SIZE] = SeriesTransportAbi.StringIndex.SIZE.toFloat()
  putColor(colors, SeriesTransportAbi.ColorIndex.COLOR, color)
  putColor(colors, SeriesTransportAbi.ColorIndex.UP, upColor)
  putColor(colors, SeriesTransportAbi.ColorIndex.DOWN, downColor)
  putColor(colors, SeriesTransportAbi.ColorIndex.LINE_GRADIENT_TOP, lineGradientTopColor)
  putColor(colors, SeriesTransportAbi.ColorIndex.LINE_GRADIENT_BOTTOM, lineGradientBottomColor)
  putColor(colors, SeriesTransportAbi.ColorIndex.AREA_FILL_TOP, areaFillTopColor)
  putColor(colors, SeriesTransportAbi.ColorIndex.AREA_FILL_BOTTOM, areaFillBottomColor)
  putColor(colors, SeriesTransportAbi.ColorIndex.RSI_LEVEL_LINE, rsiLevelLineColor)
  putColor(colors, SeriesTransportAbi.ColorIndex.RSI_BAND, rsiBandColor)
  putColor(colors, SeriesTransportAbi.ColorIndex.RSI_TEXT, rsiTextColor ?: color)
  putColor(colors, SeriesTransportAbi.ColorIndex.MACD_SIGNAL, macdSignalColor)
  putColor(
      colors,
      SeriesTransportAbi.ColorIndex.MACD_SIGNAL_GRADIENT_TOP,
      macdSignalGradientTopColor,
  )
  putColor(
      colors,
      SeriesTransportAbi.ColorIndex.MACD_SIGNAL_GRADIENT_BOTTOM,
      macdSignalGradientBottomColor,
  )
  putColor(
      colors,
      SeriesTransportAbi.ColorIndex.MACD_POSITIVE_INCREASING,
      macdPositiveIncreasingColor,
  )
  putColor(
      colors,
      SeriesTransportAbi.ColorIndex.MACD_POSITIVE_DECREASING,
      macdPositiveDecreasingColor,
  )
  putColor(
      colors,
      SeriesTransportAbi.ColorIndex.MACD_NEGATIVE_INCREASING,
      macdNegativeIncreasingColor,
  )
  putColor(
      colors,
      SeriesTransportAbi.ColorIndex.MACD_NEGATIVE_DECREASING,
      macdNegativeDecreasingColor,
  )
  putColor(colors, SeriesTransportAbi.ColorIndex.MACD_ZERO_LINE, macdZeroLineColor)
  putColor(colors, SeriesTransportAbi.ColorIndex.MACD_TEXT, macdTextColor ?: color)
  return colors
}

internal fun SeriesConfig.nativeTransportPayload(): SeriesTransportPayload {
  val numbers = nativeSeriesNumbers()
  val colors = nativeSeriesColors(numbers)
  return SeriesTransportPayload(
      strings =
          arrayOf(
              SeriesTransportAbi.STRING_MARKER,
              seriesId,
              paneId,
              priceScaleId,
              sourceSeriesId,
          ),
      numbers = numbers,
      colors = colors,
  )
}

internal object SnapshotTransportAbi {
  const val HEADER_VERSION = 0
  const val HEADER_RECORD_WIDTH = 1
  const val HEADER_RECORD_COUNT = 2
  const val HEADER_SIZE = 3
  const val TICK_RECORD_WIDTH = 2
  const val PANE_RECORD_WIDTH = 14
  const val INDICATOR_LEGEND_RECORD_WIDTH = 31
  const val PRICE_LINE_RECORD_WIDTH = 6

  object PaneIndex {
    const val PLOT_LEFT = 0
    const val PLOT_TOP = 1
    const val PLOT_RIGHT = 2
    const val PLOT_BOTTOM = 3
    const val HEIGHT_WEIGHT = 4
    const val VISIBLE_Y_MIN = 5
    const val VISIBLE_Y_MAX = 6
    const val Y_AXIS_SCALE = 7
    const val Y_TICK_OFFSET = 8
    const val Y_TICK_COUNT = 9
    const val SCALE_VISIBLE = 10
    const val VOLUME_FORMAT = 11
    const val PRECISION = 12
    const val RSI_SCALE = 13
  }

  object IndicatorLegendIndex {
    const val PANE_INDEX = 0
    const val KIND = 1
    const val PERIOD = 2
    const val FAST_PERIOD = 3
    const val SLOW_PERIOD = 4
    const val SIGNAL_PERIOD = 5
    const val VALUE_SOURCE = 6
    const val VALUE_COUNT = 7
    const val TEXT_COLOR_SET = 8
    const val TEXT_COLOR = 9
    const val VALUES = 13
    const val VALUE_RECORD_WIDTH = 6
  }
}

internal data class SnapshotRecordPayload(
    val values: DoubleArray,
    val recordWidth: Int,
    val recordCount: Int,
) {
  fun offset(index: Int) = SnapshotTransportAbi.HEADER_SIZE + index * recordWidth
}

internal data class PaneSnapshotRecord(
    val plotLeft: Float,
    val plotTop: Float,
    val plotRight: Float,
    val plotBottom: Float,
    val heightWeight: Double,
    val visibleYMin: Double,
    val visibleYMax: Double,
    val yAxisScale: Double,
    val yTickOffset: Int,
    val yTickCount: Int,
    val scaleVisible: Boolean,
    val volumeFormat: Boolean,
    val precision: Int,
    val rsiScale: Boolean,
)

internal fun SnapshotRecordPayload.paneRecord(index: Int): PaneSnapshotRecord {
  check(recordWidth == SnapshotTransportAbi.PANE_RECORD_WIDTH) {
    "Cannot decode pane from record width $recordWidth"
  }
  check(index in 0 until recordCount) { "Invalid pane record index: $index" }
  val offset = offset(index)
  fun value(field: Int) = values[offset + field]
  fun exactInt(field: Int, name: String): Int {
    val raw = value(field)
    check(raw == raw.toInt().toDouble()) { "Invalid native pane $name: $raw" }
    return raw.toInt()
  }
  return PaneSnapshotRecord(
      plotLeft = value(SnapshotTransportAbi.PaneIndex.PLOT_LEFT).toFloat(),
      plotTop = value(SnapshotTransportAbi.PaneIndex.PLOT_TOP).toFloat(),
      plotRight = value(SnapshotTransportAbi.PaneIndex.PLOT_RIGHT).toFloat(),
      plotBottom = value(SnapshotTransportAbi.PaneIndex.PLOT_BOTTOM).toFloat(),
      heightWeight = value(SnapshotTransportAbi.PaneIndex.HEIGHT_WEIGHT),
      visibleYMin = value(SnapshotTransportAbi.PaneIndex.VISIBLE_Y_MIN),
      visibleYMax = value(SnapshotTransportAbi.PaneIndex.VISIBLE_Y_MAX),
      yAxisScale = value(SnapshotTransportAbi.PaneIndex.Y_AXIS_SCALE),
      yTickOffset = exactInt(SnapshotTransportAbi.PaneIndex.Y_TICK_OFFSET, "tick offset"),
      yTickCount = exactInt(SnapshotTransportAbi.PaneIndex.Y_TICK_COUNT, "tick count"),
      scaleVisible = value(SnapshotTransportAbi.PaneIndex.SCALE_VISIBLE) != 0.0,
      volumeFormat = value(SnapshotTransportAbi.PaneIndex.VOLUME_FORMAT) != 0.0,
      precision = exactInt(SnapshotTransportAbi.PaneIndex.PRECISION, "precision"),
      rsiScale = value(SnapshotTransportAbi.PaneIndex.RSI_SCALE) != 0.0,
  )
}

internal data class IndicatorLegendValueSnapshotRecord(
    val value: Double,
    val hasValue: Boolean,
    val color: Int,
)

internal data class IndicatorLegendSnapshotRecord(
    val paneIndex: Int,
    val kind: Int,
    val period: Int,
    val fastPeriod: Int,
    val slowPeriod: Int,
    val signalPeriod: Int,
    val valueSource: Int,
    val textColor: Int,
    val textColorSet: Boolean,
    val values: List<IndicatorLegendValueSnapshotRecord>,
)

private fun Double.colorChannel() = (coerceIn(0.0, 1.0) * 255.0).toInt()

private fun SnapshotRecordPayload.colorAt(offset: Int, channelOffset: Int): Int {
  val alpha = values[offset + channelOffset + 3].colorChannel()
  val red = values[offset + channelOffset].colorChannel()
  val green = values[offset + channelOffset + 1].colorChannel()
  val blue = values[offset + channelOffset + 2].colorChannel()
  return (alpha shl 24) or (red shl 16) or (green shl 8) or blue
}

internal fun SnapshotRecordPayload.indicatorLegendRecord(
    index: Int
): IndicatorLegendSnapshotRecord {
  check(recordWidth == SnapshotTransportAbi.INDICATOR_LEGEND_RECORD_WIDTH) {
    "Cannot decode indicator legend from record width $recordWidth"
  }
  check(index in 0 until recordCount) { "Invalid indicator legend record index: $index" }
  val offset = offset(index)
  fun value(field: Int) = values[offset + field]
  fun exactInt(field: Int, name: String): Int {
    val raw = value(field)
    check(raw == raw.toInt().toDouble()) { "Invalid native indicator legend $name: $raw" }
    return raw.toInt()
  }
  val valueCount = exactInt(SnapshotTransportAbi.IndicatorLegendIndex.VALUE_COUNT, "value count")
  check(valueCount in 0..3) { "Invalid native indicator legend value count: $valueCount" }
  val legendValues =
      List(valueCount) { valueIndex ->
        val valueOffset =
            SnapshotTransportAbi.IndicatorLegendIndex.VALUES +
                valueIndex * SnapshotTransportAbi.IndicatorLegendIndex.VALUE_RECORD_WIDTH
        IndicatorLegendValueSnapshotRecord(
            value = value(valueOffset),
            hasValue = value(valueOffset + 1) != 0.0,
            color = colorAt(offset, valueOffset + 2),
        )
      }
  return IndicatorLegendSnapshotRecord(
      paneIndex = exactInt(SnapshotTransportAbi.IndicatorLegendIndex.PANE_INDEX, "pane index"),
      kind = exactInt(SnapshotTransportAbi.IndicatorLegendIndex.KIND, "kind"),
      period = exactInt(SnapshotTransportAbi.IndicatorLegendIndex.PERIOD, "period"),
      fastPeriod = exactInt(SnapshotTransportAbi.IndicatorLegendIndex.FAST_PERIOD, "fast period"),
      slowPeriod = exactInt(SnapshotTransportAbi.IndicatorLegendIndex.SLOW_PERIOD, "slow period"),
      signalPeriod =
          exactInt(SnapshotTransportAbi.IndicatorLegendIndex.SIGNAL_PERIOD, "signal period"),
      valueSource =
          exactInt(SnapshotTransportAbi.IndicatorLegendIndex.VALUE_SOURCE, "value source"),
      textColor = colorAt(offset, SnapshotTransportAbi.IndicatorLegendIndex.TEXT_COLOR),
      textColorSet = value(SnapshotTransportAbi.IndicatorLegendIndex.TEXT_COLOR_SET) != 0.0,
      values = legendValues,
  )
}

internal fun decodeSnapshotRecordPayload(
    values: DoubleArray,
    expectedRecordWidth: Int,
    name: String,
): SnapshotRecordPayload {
  check(values.size >= SnapshotTransportAbi.HEADER_SIZE) {
    "Invalid native $name header size: ${values.size}"
  }
  val version = values[SnapshotTransportAbi.HEADER_VERSION]
  val recordWidth = values[SnapshotTransportAbi.HEADER_RECORD_WIDTH]
  val recordCount = values[SnapshotTransportAbi.HEADER_RECORD_COUNT]
  check(version == CHART_ENGINE_TRANSPORT_ABI_VERSION.toDouble()) {
    "Unsupported native $name ABI version: $version"
  }
  check(recordWidth == expectedRecordWidth.toDouble()) {
    "Invalid native $name record width: $recordWidth"
  }
  val maximumRecordCount = (values.size - SnapshotTransportAbi.HEADER_SIZE) / expectedRecordWidth
  check(
      recordCount >= 0.0 &&
          recordCount <= maximumRecordCount.toDouble() &&
          recordCount == recordCount.toInt().toDouble()
  ) {
    "Invalid native $name record count: $recordCount"
  }
  val decodedRecordCount = recordCount.toInt()
  val expectedSize = SnapshotTransportAbi.HEADER_SIZE + expectedRecordWidth * decodedRecordCount
  check(values.size == expectedSize) {
    "Invalid native $name payload size: ${values.size}, expected $expectedSize"
  }
  return SnapshotRecordPayload(values, expectedRecordWidth, decodedRecordCount)
}

internal fun validateTransportDescriptor(descriptor: IntArray) {
  val expected =
      intArrayOf(
          CHART_ENGINE_TRANSPORT_ABI_VERSION,
          SeriesTransportAbi.NumberIndex.SIZE,
          SeriesTransportAbi.ColorIndex.SIZE,
          SeriesTransportAbi.StringIndex.SIZE,
          SnapshotTransportAbi.HEADER_SIZE,
          SnapshotTransportAbi.TICK_RECORD_WIDTH,
          SnapshotTransportAbi.PANE_RECORD_WIDTH,
          SnapshotTransportAbi.INDICATOR_LEGEND_RECORD_WIDTH,
      )
  check(descriptor.contentEquals(expected)) {
    "Incompatible ChartEngine JNI ABI: native=${descriptor.contentToString()}, " +
        "kotlin=${expected.contentToString()}"
  }
}

internal fun seriesRoundTripSentinel(): SeriesTransportPayload {
  val numbers = DoubleArray(SeriesTransportAbi.NumberIndex.SIZE)
  numbers[SeriesTransportAbi.NumberIndex.VERSION] = CHART_ENGINE_TRANSPORT_ABI_VERSION.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.NUMBER_SIZE] = numbers.size.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.COLOR_SIZE] = SeriesTransportAbi.ColorIndex.SIZE.toDouble()
  numbers[SeriesTransportAbi.NumberIndex.STRING_SIZE] =
      SeriesTransportAbi.StringIndex.SIZE.toDouble()
  for (index in 0 until SeriesTransportAbi.ROUND_TRIP_NUMBER_COUNT) {
    numbers[SeriesTransportAbi.NumberIndex.TYPE + index] = 101.0 + index
  }

  val colors = FloatArray(SeriesTransportAbi.ColorIndex.SIZE)
  colors[SeriesTransportAbi.ColorIndex.VERSION] = CHART_ENGINE_TRANSPORT_ABI_VERSION.toFloat()
  colors[SeriesTransportAbi.ColorIndex.NUMBER_SIZE] = numbers.size.toFloat()
  colors[SeriesTransportAbi.ColorIndex.COLOR_SIZE] = colors.size.toFloat()
  colors[SeriesTransportAbi.ColorIndex.STRING_SIZE] = SeriesTransportAbi.StringIndex.SIZE.toFloat()
  for (index in 0 until SeriesTransportAbi.ROUND_TRIP_COLOR_COUNT) {
    colors[SeriesTransportAbi.ColorIndex.COLOR + index] = 201f + index
  }

  return SeriesTransportPayload(
      strings = arrayOf(SeriesTransportAbi.STRING_MARKER, "a", "bbb", "ccccc", "ddddddd"),
      numbers = numbers,
      colors = colors,
  )
}

internal fun validateSeriesRoundTrip(actual: DoubleArray) {
  val expected = DoubleArray(SeriesTransportAbi.ROUND_TRIP_SIZE)
  expected[0] = CHART_ENGINE_TRANSPORT_ABI_VERSION.toDouble()
  expected[1] = SeriesTransportAbi.ROUND_TRIP_NUMBER_COUNT.toDouble()
  expected[2] = SeriesTransportAbi.ROUND_TRIP_COLOR_COUNT.toDouble()
  expected[3] = SeriesTransportAbi.ROUND_TRIP_STRING_COUNT.toDouble()
  var target = SeriesTransportAbi.ROUND_TRIP_HEADER_SIZE
  for (index in 0 until SeriesTransportAbi.ROUND_TRIP_NUMBER_COUNT) {
    expected[target++] = 101.0 + index
  }
  for (index in 0 until SeriesTransportAbi.ROUND_TRIP_COLOR_COUNT) {
    expected[target++] = 201.0 + index
  }
  intArrayOf(1, 3, 5, 7).forEach { expected[target++] = it.toDouble() }
  check(actual.contentEquals(expected)) {
    "ChartEngine JNI series round-trip failed: native=${actual.contentToString()}, " +
        "kotlin=${expected.contentToString()}"
  }
}
