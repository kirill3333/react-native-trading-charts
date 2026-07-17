package com.tradingcharts

internal data class AxisTick(val value: Double, val position: Float)

internal data class ChartSnapshot(
  val revision: Long,
  val config: ChartConfig,
  val width: Float,
  val height: Float,
  val plotLeft: Float,
  val plotTop: Float,
  val plotRight: Float,
  val plotBottom: Float,
  val visibleXMin: Double,
  val visibleXMax: Double,
  val visibleYMin: Double,
  val visibleYMax: Double,
  val vertices: FloatArray,
  val xTicks: List<AxisTick>,
  val yTicks: List<AxisTick>,
  val currentPriceVisible: Boolean,
  val currentPrice: Double,
  val currentPriceY: Float,
  val currentPriceColor: FloatArray,
  val crosshairVisible: Boolean,
  val crosshairX: Float,
  val crosshairY: Float,
  val crosshairPrice: Double,
  val selectedCandle: DoubleArray,
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
  @JvmStatic external fun nativeUpdateCandle(handle: Long, values: DoubleArray): Int
  @JvmStatic external fun nativeUpdateTrade(handle: Long, values: DoubleArray): Int
  @JvmStatic external fun nativeUpdateTrades(handle: Long, values: DoubleArray): Int
  @JvmStatic external fun nativeClear(handle: Long)
  @JvmStatic external fun nativePan(handle: Long, delta: Float): Boolean
  @JvmStatic external fun nativeZoom(handle: Long, scale: Double, focusX: Float)
  @JvmStatic external fun nativeScaleY(handle: Long, delta: Float)
  @JvmStatic external fun nativeResetViewport(handle: Long)
  @JvmStatic external fun nativeSetCrosshair(handle: Long, active: Boolean, x: Float, y: Float)
  @JvmStatic private external fun nativeAcquireSnapshot(handle: Long): Long
  @JvmStatic private external fun nativeReleaseSnapshot(handle: Long)
  @JvmStatic private external fun nativeSnapshotRevision(handle: Long): Long
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
        config = config,
        width = meta[0].toFloat(),
        height = meta[1].toFloat(),
        plotLeft = meta[2].toFloat(),
        plotTop = meta[3].toFloat(),
        plotRight = meta[4].toFloat(),
        plotBottom = meta[5].toFloat(),
        visibleXMin = meta[6],
        visibleXMax = meta[7],
        visibleYMin = meta[8],
        visibleYMax = meta[9],
        vertices = nativeSnapshotVertices(snapshot),
        xTicks = ticks(nativeSnapshotXTicks(snapshot)),
        yTicks = ticks(nativeSnapshotYTicks(snapshot)),
        currentPriceVisible = meta[10] != 0.0,
        currentPrice = meta[11],
        currentPriceY = meta[12].toFloat(),
        currentPriceColor = floatArrayOf(
          meta[13].toFloat(), meta[14].toFloat(), meta[15].toFloat(), meta[16].toFloat(),
        ),
        crosshairVisible = meta[17] != 0.0,
        crosshairX = meta[18].toFloat(),
        crosshairY = meta[19].toFloat(),
        crosshairPrice = meta[20],
        selectedCandle = meta.copyOfRange(21, 27),
      )
    } finally {
      nativeReleaseSnapshot(snapshot)
    }
  }
}
