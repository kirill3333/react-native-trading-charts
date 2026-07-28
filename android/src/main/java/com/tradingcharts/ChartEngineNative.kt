package com.tradingcharts

import android.graphics.Color

internal data class AxisTick(val value: Double, val position: Float)

internal data class PriceExtremumSnapshot(
    val visible: Boolean,
    val value: Double,
    val x: Float,
    val y: Float,
    val labelOnRight: Boolean,
)

internal data class PaneSnapshot(
    val paneId: String,
    val priceScaleId: String,
    val plotLeft: Float,
    val plotTop: Float,
    val plotRight: Float,
    val plotBottom: Float,
    val heightWeight: Double,
    val visibleYMin: Double,
    val visibleYMax: Double,
    val yAxisScale: Double,
    val yTicks: List<AxisTick>,
    val scaleVisible: Boolean,
    val volumeFormat: Boolean,
    val precision: Int,
)

internal data class ChartSnapshot(
    val revision: Long,
    val contentRevision: Long,
    val config: ChartConfig,
    val width: Float,
    val height: Float,
    val plotLeft: Float,
    val plotTop: Float,
    val plotRight: Float,
    val plotBottom: Float,
    val visibleXMin: Double,
    val visibleXMax: Double,
    val horizontalScale: Double,
    val firstVisibleIndex: Int,
    val lastVisibleIndex: Int,
    val totalCandleCount: Int,
    val hasVisibleCandles: Boolean,
    val visibleYMin: Double,
    val visibleYMax: Double,
    val yAxisScale: Double,
    val vertices: FloatArray,
    val xTicks: List<AxisTick>,
    val yTicks: List<AxisTick>,
    val panes: List<PaneSnapshot>,
    val activePaneIndex: Int,
    val currentPriceVisible: Boolean,
    val currentPrice: Double,
    val currentPriceY: Float,
    val currentPriceColor: FloatArray,
    val currentPriceLabelColor: FloatArray,
    val visibleMaximum: PriceExtremumSnapshot,
    val visibleMinimum: PriceExtremumSnapshot,
    val crosshairVisible: Boolean,
    val crosshairX: Float,
    val crosshairY: Float,
    val crosshairPrice: Double,
    val selectedCandle: DoubleArray,
    val selectedChange: Double,
    val selectedChangePercent: Double,
    val selectedAmplitudePercent: Double,
    val selectedPercentagesValid: Boolean,
)

private object SnapshotMetaIndex {
  const val WIDTH = 0
  const val HEIGHT = 1
  const val PLOT_LEFT = 2
  const val PLOT_TOP = 3
  const val PLOT_RIGHT = 4
  const val PLOT_BOTTOM = 5
  const val VISIBLE_X_MIN = 6
  const val VISIBLE_X_MAX = 7
  const val VISIBLE_Y_MIN = 8
  const val VISIBLE_Y_MAX = 9
  const val CURRENT_PRICE_VISIBLE = 10
  const val CURRENT_PRICE = 11
  const val CURRENT_PRICE_Y = 12
  const val CURRENT_PRICE_COLOR_R = 13
  const val CURRENT_PRICE_COLOR_G = 14
  const val CURRENT_PRICE_COLOR_B = 15
  const val CURRENT_PRICE_COLOR_A = 16
  const val CROSSHAIR_VISIBLE = 17
  const val CROSSHAIR_X = 18
  const val CROSSHAIR_Y = 19
  const val CROSSHAIR_PRICE = 20
  const val SELECTED_CANDLE_START = 21
  const val SELECTED_CANDLE_END_EXCLUSIVE = 27
  const val FIRST_VISIBLE_INDEX = 27
  const val LAST_VISIBLE_INDEX = 28
  const val TOTAL_CANDLE_COUNT = 29
  const val HAS_VISIBLE_CANDLES = 30
  const val VISIBLE_MAXIMUM_VISIBLE = 31
  const val VISIBLE_MAXIMUM_VALUE = 32
  const val VISIBLE_MAXIMUM_X = 33
  const val VISIBLE_MAXIMUM_Y = 34
  const val VISIBLE_MAXIMUM_LABEL_ON_RIGHT = 35
  const val VISIBLE_MINIMUM_VISIBLE = 36
  const val VISIBLE_MINIMUM_VALUE = 37
  const val VISIBLE_MINIMUM_X = 38
  const val VISIBLE_MINIMUM_Y = 39
  const val VISIBLE_MINIMUM_LABEL_ON_RIGHT = 40
  const val SELECTED_CHANGE = 41
  const val SELECTED_CHANGE_PERCENT = 42
  const val SELECTED_AMPLITUDE_PERCENT = 43
  const val SELECTED_PERCENTAGES_VALID = 44
  const val CURRENT_PRICE_LABEL_COLOR_R = 45
  const val CURRENT_PRICE_LABEL_COLOR_G = 46
  const val CURRENT_PRICE_LABEL_COLOR_B = 47
  const val CURRENT_PRICE_LABEL_COLOR_A = 48
  const val HORIZONTAL_SCALE = 49
  const val Y_AXIS_SCALE = 50
  const val SIZE = 51
}

private fun DoubleArray.visibleMaximum() =
    PriceExtremumSnapshot(
        visible = this[SnapshotMetaIndex.VISIBLE_MAXIMUM_VISIBLE] != 0.0,
        value = this[SnapshotMetaIndex.VISIBLE_MAXIMUM_VALUE],
        x = this[SnapshotMetaIndex.VISIBLE_MAXIMUM_X].toFloat(),
        y = this[SnapshotMetaIndex.VISIBLE_MAXIMUM_Y].toFloat(),
        labelOnRight = this[SnapshotMetaIndex.VISIBLE_MAXIMUM_LABEL_ON_RIGHT] != 0.0,
    )

private fun DoubleArray.visibleMinimum() =
    PriceExtremumSnapshot(
        visible = this[SnapshotMetaIndex.VISIBLE_MINIMUM_VISIBLE] != 0.0,
        value = this[SnapshotMetaIndex.VISIBLE_MINIMUM_VALUE],
        x = this[SnapshotMetaIndex.VISIBLE_MINIMUM_X].toFloat(),
        y = this[SnapshotMetaIndex.VISIBLE_MINIMUM_Y].toFloat(),
        labelOnRight = this[SnapshotMetaIndex.VISIBLE_MINIMUM_LABEL_ON_RIGHT] != 0.0,
    )

@Suppress("TooManyFunctions")
internal object ChartEngineNative {
  private const val PANE_META_WIDTH = 13

  init {
    System.loadLibrary("tradingcharts")
  }

  @JvmStatic external fun nativeCreate(): Long

  @JvmStatic external fun nativeDestroy(handle: Long)

  @JvmStatic
  external fun nativeSetConfig(
      handle: Long,
      numbers: DoubleArray,
      colors: FloatArray,
      strings: Array<String>,
  )

  @JvmStatic
  external fun nativeSetPanes(
      handle: Long,
      strings: Array<String>,
      numbers: DoubleArray,
      resizable: Boolean,
  )

  @JvmStatic
  external fun nativeAddSeries(
      handle: Long,
      strings: Array<String>,
      numbers: DoubleArray,
      colors: FloatArray,
  ): Int

  @JvmStatic external fun nativeRemoveSeries(handle: Long, seriesId: String): Boolean

  @JvmStatic
  external fun nativeSetSeriesData(
      handle: Long,
      seriesId: String,
      histogram: Boolean,
      values: DoubleArray,
  ): Int

  @JvmStatic
  external fun nativePrependSeriesData(
      handle: Long,
      seriesId: String,
      histogram: Boolean,
      values: DoubleArray,
  ): Int

  @JvmStatic
  external fun nativeUpdateSeriesData(
      handle: Long,
      seriesId: String,
      histogram: Boolean,
      values: DoubleArray,
  ): Int

  @JvmStatic
  external fun nativeSetPaneHeight(handle: Long, paneId: String, heightWeight: Double): Boolean

  @JvmStatic external fun nativeScaleYAt(handle: Long, delta: Float, y: Float): Boolean

  @JvmStatic external fun nativeSeparatorAt(handle: Long, y: Float, hitSlop: Float): Int

  @JvmStatic
  external fun nativeResizePaneSeparator(handle: Long, separatorIndex: Int, delta: Float): Boolean

  @JvmStatic external fun nativeSetSize(handle: Long, width: Float, height: Float)

  @JvmStatic external fun nativeSetHistory(handle: Long, values: DoubleArray): Int

  @JvmStatic external fun nativePrependHistory(handle: Long, values: DoubleArray): Int

  @JvmStatic external fun nativeUpdateCandle(handle: Long, values: DoubleArray): Int

  @JvmStatic external fun nativeUpdateTrade(handle: Long, values: DoubleArray): Int

  @JvmStatic external fun nativeUpdateTrades(handle: Long, values: DoubleArray): Int

  @JvmStatic external fun nativeClear(handle: Long)

  @JvmStatic external fun nativePan(handle: Long, delta: Float): Boolean

  @JvmStatic external fun nativeZoom(handle: Long, scale: Double, focusX: Float): Boolean

  @JvmStatic external fun nativeZoomAtRightEdge(handle: Long, scale: Double)

  @JvmStatic external fun nativeScaleY(handle: Long, delta: Float): Boolean

  @JvmStatic external fun nativeCandles(handle: Long): DoubleArray

  @JvmStatic external fun nativeFitContent(handle: Long)

  @JvmStatic external fun nativeSetCrosshair(handle: Long, active: Boolean, x: Float, y: Float)

  @JvmStatic private external fun nativeAcquireSnapshot(handle: Long): Long

  @JvmStatic private external fun nativeReleaseSnapshot(handle: Long)

  @JvmStatic private external fun nativeSnapshotRevision(handle: Long): Long

  @JvmStatic private external fun nativeSnapshotContentRevision(handle: Long): Long

  @JvmStatic private external fun nativeSnapshotVertices(handle: Long): FloatArray

  @JvmStatic private external fun nativeSnapshotXTicks(handle: Long): DoubleArray

  @JvmStatic private external fun nativeSnapshotYTicks(handle: Long): DoubleArray

  @JvmStatic private external fun nativeSnapshotPaneYTicks(handle: Long): DoubleArray

  @JvmStatic private external fun nativeSnapshotPanes(handle: Long): DoubleArray

  @JvmStatic private external fun nativeSnapshotActivePane(handle: Long): Int

  @JvmStatic private external fun nativeSnapshotMeta(handle: Long): DoubleArray

  fun setConfig(handle: Long, config: ChartConfig) {
    nativeSetConfig(handle, config.nativeNumbers(), config.nativeColors(), config.nativeStrings())
    nativeSetPanes(
        handle,
        config.nativePaneStrings(),
        config.nativePaneNumbers(),
        config.panesResizable,
    )
  }

  fun addSeries(handle: Long, series: SeriesConfig): Int {
    val colors = FloatArray(12)
    listOf(series.color, series.upColor, series.downColor).forEachIndexed { index, color ->
      colors[index * 4] = Color.red(color) / 255f
      colors[index * 4 + 1] = Color.green(color) / 255f
      colors[index * 4 + 2] = Color.blue(color) / 255f
      colors[index * 4 + 3] = Color.alpha(color) / 255f
    }
    return nativeAddSeries(
        handle,
        arrayOf(
            series.seriesId,
            series.paneId,
            series.priceScaleId,
            series.sourceSeriesId,
        ),
        doubleArrayOf(
            when (series.type) {
              "bar" -> 1.0
              "hollowCandlestick" -> 2.0
              "histogram" -> 3.0
              else -> 0.0
            },
            if (series.sourceType == "ohlcvVolume") 1.0 else 0.0,
            if (series.visible) 1.0 else 0.0,
            if (series.declarative) 1.0 else 0.0,
            series.lineWidthPx.toDouble(),
        ),
        colors,
    )
  }

  fun snapshot(handle: Long, config: ChartConfig): ChartSnapshot {
    val snapshot = nativeAcquireSnapshot(handle)
    check(snapshot != 0L) { "Unable to acquire chart snapshot" }
    try {
      val meta = nativeSnapshotMeta(snapshot)
      check(meta.size == SnapshotMetaIndex.SIZE) {
        "Invalid native snapshot metadata size: ${meta.size}"
      }
      fun ticks(values: DoubleArray) =
          values.asList().chunked(2).map {
            AxisTick(it[0], it[1].toFloat())
          }
      val panes = snapshotPanes(snapshot, config, ::ticks)
      return ChartSnapshot(
          revision = nativeSnapshotRevision(snapshot),
          contentRevision = nativeSnapshotContentRevision(snapshot),
          config = config,
          width = meta[SnapshotMetaIndex.WIDTH].toFloat(),
          height = meta[SnapshotMetaIndex.HEIGHT].toFloat(),
          plotLeft = meta[SnapshotMetaIndex.PLOT_LEFT].toFloat(),
          plotTop = meta[SnapshotMetaIndex.PLOT_TOP].toFloat(),
          plotRight = meta[SnapshotMetaIndex.PLOT_RIGHT].toFloat(),
          plotBottom = meta[SnapshotMetaIndex.PLOT_BOTTOM].toFloat(),
          visibleXMin = meta[SnapshotMetaIndex.VISIBLE_X_MIN],
          visibleXMax = meta[SnapshotMetaIndex.VISIBLE_X_MAX],
          horizontalScale = meta[SnapshotMetaIndex.HORIZONTAL_SCALE],
          firstVisibleIndex = meta[SnapshotMetaIndex.FIRST_VISIBLE_INDEX].toInt(),
          lastVisibleIndex = meta[SnapshotMetaIndex.LAST_VISIBLE_INDEX].toInt(),
          totalCandleCount = meta[SnapshotMetaIndex.TOTAL_CANDLE_COUNT].toInt(),
          hasVisibleCandles = meta[SnapshotMetaIndex.HAS_VISIBLE_CANDLES] != 0.0,
          visibleYMin = meta[SnapshotMetaIndex.VISIBLE_Y_MIN],
          visibleYMax = meta[SnapshotMetaIndex.VISIBLE_Y_MAX],
          yAxisScale = meta[SnapshotMetaIndex.Y_AXIS_SCALE],
          vertices = nativeSnapshotVertices(snapshot),
          xTicks = ticks(nativeSnapshotXTicks(snapshot)),
          yTicks = ticks(nativeSnapshotYTicks(snapshot)),
          panes = panes,
          activePaneIndex = nativeSnapshotActivePane(snapshot),
          currentPriceVisible = meta[SnapshotMetaIndex.CURRENT_PRICE_VISIBLE] != 0.0,
          currentPrice = meta[SnapshotMetaIndex.CURRENT_PRICE],
          currentPriceY = meta[SnapshotMetaIndex.CURRENT_PRICE_Y].toFloat(),
          currentPriceColor =
              floatArrayOf(
                  meta[SnapshotMetaIndex.CURRENT_PRICE_COLOR_R].toFloat(),
                  meta[SnapshotMetaIndex.CURRENT_PRICE_COLOR_G].toFloat(),
                  meta[SnapshotMetaIndex.CURRENT_PRICE_COLOR_B].toFloat(),
                  meta[SnapshotMetaIndex.CURRENT_PRICE_COLOR_A].toFloat(),
              ),
          currentPriceLabelColor =
              floatArrayOf(
                  meta[SnapshotMetaIndex.CURRENT_PRICE_LABEL_COLOR_R].toFloat(),
                  meta[SnapshotMetaIndex.CURRENT_PRICE_LABEL_COLOR_G].toFloat(),
                  meta[SnapshotMetaIndex.CURRENT_PRICE_LABEL_COLOR_B].toFloat(),
                  meta[SnapshotMetaIndex.CURRENT_PRICE_LABEL_COLOR_A].toFloat(),
              ),
          visibleMaximum = meta.visibleMaximum(),
          visibleMinimum = meta.visibleMinimum(),
          crosshairVisible = meta[SnapshotMetaIndex.CROSSHAIR_VISIBLE] != 0.0,
          crosshairX = meta[SnapshotMetaIndex.CROSSHAIR_X].toFloat(),
          crosshairY = meta[SnapshotMetaIndex.CROSSHAIR_Y].toFloat(),
          crosshairPrice = meta[SnapshotMetaIndex.CROSSHAIR_PRICE],
          selectedCandle =
              meta.copyOfRange(
                  SnapshotMetaIndex.SELECTED_CANDLE_START,
                  SnapshotMetaIndex.SELECTED_CANDLE_END_EXCLUSIVE,
              ),
          selectedChange = meta[SnapshotMetaIndex.SELECTED_CHANGE],
          selectedChangePercent = meta[SnapshotMetaIndex.SELECTED_CHANGE_PERCENT],
          selectedAmplitudePercent = meta[SnapshotMetaIndex.SELECTED_AMPLITUDE_PERCENT],
          selectedPercentagesValid = meta[SnapshotMetaIndex.SELECTED_PERCENTAGES_VALID] != 0.0,
      )
    } finally {
      nativeReleaseSnapshot(snapshot)
    }
  }

  private fun snapshotPanes(
      snapshot: Long,
      config: ChartConfig,
      ticks: (DoubleArray) -> List<AxisTick>,
  ): List<PaneSnapshot> {
    val paneTicks = ticks(nativeSnapshotPaneYTicks(snapshot))
    val paneMeta = nativeSnapshotPanes(snapshot)
    check(paneMeta.size % PANE_META_WIDTH == 0) {
      "Invalid native pane metadata size: ${paneMeta.size}"
    }
    return List(paneMeta.size / PANE_META_WIDTH) { index ->
      val offset = index * PANE_META_WIDTH
      val tickOffset = paneMeta[offset + 8].toInt()
      val tickCount = paneMeta[offset + 9].toInt()
      val configPane = config.panes.getOrNull(index)
      PaneSnapshot(
          paneId = configPane?.paneId ?: "pane-$index",
          priceScaleId = configPane?.priceScaleId ?: "scale-$index",
          plotLeft = paneMeta[offset].toFloat(),
          plotTop = paneMeta[offset + 1].toFloat(),
          plotRight = paneMeta[offset + 2].toFloat(),
          plotBottom = paneMeta[offset + 3].toFloat(),
          heightWeight = paneMeta[offset + 4],
          visibleYMin = paneMeta[offset + 5],
          visibleYMax = paneMeta[offset + 6],
          yAxisScale = paneMeta[offset + 7],
          yTicks = paneTicks.subList(tickOffset, tickOffset + tickCount),
          scaleVisible = paneMeta[offset + 10] != 0.0,
          volumeFormat = paneMeta[offset + 11] != 0.0,
          precision = paneMeta[offset + 12].toInt(),
      )
    }
  }
}
