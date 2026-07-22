package com.tradingcharts

internal data class AxisTick(val value: Double, val position: Float)

internal data class PriceExtremumSnapshot(
  val visible: Boolean,
  val value: Double,
  val x: Float,
  val y: Float,
  val labelOnRight: Boolean,
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

internal object ChartEngineNative {
  init {
    System.loadLibrary("tradingcharts")
  }

  @JvmStatic external fun nativeCreate(): Long
  @JvmStatic external fun nativeDestroy(handle: Long)
  @JvmStatic external fun nativeSetConfig(
    handle: Long,
    numbers: DoubleArray,
    colors: FloatArray,
    strings: Array<String>,
  )
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
  @JvmStatic private external fun nativeSnapshotMeta(handle: Long): DoubleArray

  fun setConfig(handle: Long, config: ChartConfig) {
    nativeSetConfig(handle, config.nativeNumbers(), config.nativeColors(), config.nativeStrings())
  }

  fun snapshot(handle: Long, config: ChartConfig): ChartSnapshot {
    val snapshot = nativeAcquireSnapshot(handle)
    check(snapshot != 0L) { "Unable to acquire chart snapshot" }
    try {
      val meta = nativeSnapshotMeta(snapshot)
      fun ticks(values: DoubleArray) = values.asList().chunked(2).map {
        AxisTick(it[0], it[1].toFloat())
      }
      return ChartSnapshot(
        revision = nativeSnapshotRevision(snapshot),
        contentRevision = nativeSnapshotContentRevision(snapshot),
        config = config,
        width = meta[0].toFloat(),
        height = meta[1].toFloat(),
        plotLeft = meta[2].toFloat(),
        plotTop = meta[3].toFloat(),
        plotRight = meta[4].toFloat(),
        plotBottom = meta[5].toFloat(),
        visibleXMin = meta[6],
        visibleXMax = meta[7],
        horizontalScale = meta[49],
        firstVisibleIndex = meta[27].toInt(),
        lastVisibleIndex = meta[28].toInt(),
        totalCandleCount = meta[29].toInt(),
        hasVisibleCandles = meta[30] != 0.0,
        visibleYMin = meta[8],
        visibleYMax = meta[9],
        yAxisScale = meta[50],
        vertices = nativeSnapshotVertices(snapshot),
        xTicks = ticks(nativeSnapshotXTicks(snapshot)),
        yTicks = ticks(nativeSnapshotYTicks(snapshot)),
        currentPriceVisible = meta[10] != 0.0,
        currentPrice = meta[11],
        currentPriceY = meta[12].toFloat(),
        currentPriceColor = floatArrayOf(
          meta[13].toFloat(), meta[14].toFloat(), meta[15].toFloat(), meta[16].toFloat(),
        ),
        currentPriceLabelColor = floatArrayOf(
          meta[45].toFloat(), meta[46].toFloat(), meta[47].toFloat(), meta[48].toFloat(),
        ),
        visibleMaximum = PriceExtremumSnapshot(
          visible = meta[31] != 0.0,
          value = meta[32],
          x = meta[33].toFloat(),
          y = meta[34].toFloat(),
          labelOnRight = meta[35] != 0.0,
        ),
        visibleMinimum = PriceExtremumSnapshot(
          visible = meta[36] != 0.0,
          value = meta[37],
          x = meta[38].toFloat(),
          y = meta[39].toFloat(),
          labelOnRight = meta[40] != 0.0,
        ),
        crosshairVisible = meta[17] != 0.0,
        crosshairX = meta[18].toFloat(),
        crosshairY = meta[19].toFloat(),
        crosshairPrice = meta[20],
        selectedCandle = meta.copyOfRange(21, 27),
        selectedChange = meta[41],
        selectedChangePercent = meta[42],
        selectedAmplitudePercent = meta[43],
        selectedPercentagesValid = meta[44] != 0.0,
      )
    } finally {
      nativeReleaseSnapshot(snapshot)
    }
  }
}
