package com.tradingcharts

import java.nio.ByteBuffer

private const val CONTENT_FLOATS_PER_VERTEX = 6

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
    val rsiScale: Boolean,
)

internal data class RsiLegendSnapshot(
    val paneIndex: Int,
    val period: Int,
    val value: Double,
    val hasValue: Boolean,
    val textColor: Int,
    val valueColor: Int,
    val textColorSet: Boolean,
)

internal data class ChartFrame(
    val snapshot: ChartSnapshot,
    val contentVertices: ContentVertexBufferLease?,
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
    // Content geometry is transferred separately through a pooled direct buffer.
    // Overlay (crosshair) remains small and follows every revision.
    val overlayVertices: FloatArray,
    val xTicks: List<AxisTick>,
    val yTicks: List<AxisTick>,
    val panes: List<PaneSnapshot>,
    val rsiLegends: List<RsiLegendSnapshot>,
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
  const val VERSION = 0
  const val PAYLOAD_SIZE = 1
  const val WIDTH = 2
  const val HEIGHT = 3
  const val PLOT_LEFT = 4
  const val PLOT_TOP = 5
  const val PLOT_RIGHT = 6
  const val PLOT_BOTTOM = 7
  const val VISIBLE_X_MIN = 8
  const val VISIBLE_X_MAX = 9
  const val VISIBLE_Y_MIN = 10
  const val VISIBLE_Y_MAX = 11
  const val CURRENT_PRICE_VISIBLE = 12
  const val CURRENT_PRICE = 13
  const val CURRENT_PRICE_Y = 14
  const val CURRENT_PRICE_COLOR_R = 15
  const val CURRENT_PRICE_COLOR_G = 16
  const val CURRENT_PRICE_COLOR_B = 17
  const val CURRENT_PRICE_COLOR_A = 18
  const val CROSSHAIR_VISIBLE = 19
  const val CROSSHAIR_X = 20
  const val CROSSHAIR_Y = 21
  const val CROSSHAIR_PRICE = 22
  const val SELECTED_CANDLE_START = 23
  const val SELECTED_CANDLE_END_EXCLUSIVE = 29
  const val FIRST_VISIBLE_INDEX = 29
  const val LAST_VISIBLE_INDEX = 30
  const val TOTAL_CANDLE_COUNT = 31
  const val HAS_VISIBLE_CANDLES = 32
  const val VISIBLE_MAXIMUM_VISIBLE = 33
  const val VISIBLE_MAXIMUM_VALUE = 34
  const val VISIBLE_MAXIMUM_X = 35
  const val VISIBLE_MAXIMUM_Y = 36
  const val VISIBLE_MAXIMUM_LABEL_ON_RIGHT = 37
  const val VISIBLE_MINIMUM_VISIBLE = 38
  const val VISIBLE_MINIMUM_VALUE = 39
  const val VISIBLE_MINIMUM_X = 40
  const val VISIBLE_MINIMUM_Y = 41
  const val VISIBLE_MINIMUM_LABEL_ON_RIGHT = 42
  const val SELECTED_CHANGE = 43
  const val SELECTED_CHANGE_PERCENT = 44
  const val SELECTED_AMPLITUDE_PERCENT = 45
  const val SELECTED_PERCENTAGES_VALID = 46
  const val CURRENT_PRICE_LABEL_COLOR_R = 47
  const val CURRENT_PRICE_LABEL_COLOR_G = 48
  const val CURRENT_PRICE_LABEL_COLOR_B = 49
  const val CURRENT_PRICE_LABEL_COLOR_A = 50
  const val HORIZONTAL_SCALE = 51
  const val Y_AXIS_SCALE = 52
  const val SIZE = 53
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
  init {
    System.loadLibrary("tradingcharts")
    validateTransportDescriptor(nativeTransportAbi())
    val sentinel = seriesRoundTripSentinel()
    validateSeriesRoundTrip(
        nativeRoundTripSeriesPayload(sentinel.strings, sentinel.numbers, sentinel.colors)
    )
  }

  @JvmStatic private external fun nativeTransportAbi(): IntArray

  @JvmStatic
  private external fun nativeRoundTripSeriesPayload(
      strings: Array<String>,
      numbers: DoubleArray,
      colors: FloatArray,
  ): DoubleArray

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
  @Suppress("LongParameterList")
  external fun nativeSetTradingCalendar(
      handle: Long,
      configured: Boolean,
      timeZone: String,
      transitionRangeEndMs: Long,
      transitionTimes: LongArray,
      transitionOffsets: IntArray,
      sessions: IntArray,
      holidayEpochDays: LongArray,
      overrideEpochDays: LongArray,
      overrideSessionOffsets: IntArray,
      overrideSessions: IntArray,
      weekStartsOn: Int,
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

  @JvmStatic external fun nativeEngineRevision(handle: Long): Long

  @JvmStatic private external fun nativeAcquireSnapshot(handle: Long): Long

  @JvmStatic private external fun nativeReleaseSnapshot(handle: Long)

  @JvmStatic private external fun nativeSnapshotRevision(handle: Long): Long

  @JvmStatic private external fun nativeSnapshotContentRevision(handle: Long): Long

  @JvmStatic private external fun nativeSnapshotContentVertexCount(handle: Long): Int

  @JvmStatic
  private external fun nativeCopySnapshotContentVertices(
      handle: Long,
      target: ByteBuffer,
  ): Int

  @JvmStatic private external fun nativeSnapshotOverlayVertices(handle: Long): FloatArray

  @JvmStatic private external fun nativeSnapshotXTicks(handle: Long): DoubleArray

  @JvmStatic private external fun nativeSnapshotYTicks(handle: Long): DoubleArray

  @JvmStatic private external fun nativeSnapshotPaneYTicks(handle: Long): DoubleArray

  @JvmStatic private external fun nativeSnapshotPanes(handle: Long): DoubleArray

  @JvmStatic private external fun nativeSnapshotRsiLegends(handle: Long): DoubleArray

  @JvmStatic private external fun nativeSnapshotActivePane(handle: Long): Int

  @JvmStatic private external fun nativeSnapshotMeta(handle: Long): DoubleArray

  fun setConfig(handle: Long, config: ChartConfig) {
    nativeSetConfig(handle, config.nativeNumbers(), config.nativeColors(), config.nativeStrings())
    val calendar = config.tradeAggregation.calendar
    nativeSetTradingCalendar(
        handle,
        calendar.configured,
        calendar.timeZone,
        calendar.transitionRangeEndMs,
        config.nativeTransitionTimes(),
        config.nativeTransitionOffsets(),
        config.nativeTradingSessions(),
        config.nativeHolidayEpochDays(),
        config.nativeOverrideEpochDays(),
        config.nativeOverrideSessionOffsets(),
        config.nativeOverrideSessions(),
        calendar.weekStartsOn,
    )
    nativeSetPanes(
        handle,
        config.nativePaneStrings(),
        config.nativePaneNumbers(),
        config.panesResizable,
    )
  }

  fun addSeries(handle: Long, series: SeriesConfig): Int {
    val payload = series.nativeTransportPayload()
    return nativeAddSeries(
        handle,
        payload.strings,
        payload.numbers,
        payload.colors,
    )
  }

  fun snapshot(
      handle: Long,
      config: ChartConfig,
      previous: ChartSnapshot?,
      contentBuffers: ContentVertexBufferPool,
  ): ChartFrame? {
    val snapshot = nativeAcquireSnapshot(handle)
    check(snapshot != 0L) { "Unable to acquire chart snapshot" }
    var contentVertices: ContentVertexBufferLease? = null
    try {
      val contentRevision = nativeSnapshotContentRevision(snapshot)
      if (previous == null || previous.contentRevision != contentRevision) {
        contentVertices =
            copyContentVertices(snapshot, contentRevision, contentBuffers) ?: return null
      }
      val frame =
          ChartFrame(
              snapshot = buildSnapshot(snapshot, contentRevision, config),
              contentVertices = contentVertices,
          )
      contentVertices = null
      return frame
    } finally {
      contentVertices?.release()
      nativeReleaseSnapshot(snapshot)
    }
  }

  private fun copyContentVertices(
      snapshot: Long,
      contentRevision: Long,
      contentBuffers: ContentVertexBufferPool,
  ): ContentVertexBufferLease? {
    val contentVertexCount = nativeSnapshotContentVertexCount(snapshot)
    check(contentVertexCount >= 0) { "Invalid native content vertex count" }
    check(contentVertexCount % CONTENT_FLOATS_PER_VERTEX == 0) {
      "Invalid native content vertex layout: $contentVertexCount floats"
    }
    val lease = contentBuffers.acquire(contentVertexCount, contentRevision) ?: return null
    val copied = nativeCopySnapshotContentVertices(snapshot, lease.writableBuffer())
    if (copied != contentVertexCount) {
      lease.release()
      error("Unable to copy native content vertices: expected $contentVertexCount, copied $copied")
    }
    return lease
  }

  private fun buildSnapshot(
      snapshot: Long,
      contentRevision: Long,
      config: ChartConfig,
  ): ChartSnapshot {
    val meta = nativeSnapshotMeta(snapshot)
    check(meta.size == SnapshotMetaIndex.SIZE) {
      "Invalid native snapshot metadata size: ${meta.size}"
    }
    check(meta[SnapshotMetaIndex.VERSION] == CHART_ENGINE_TRANSPORT_ABI_VERSION.toDouble()) {
      "Unsupported native snapshot metadata ABI version: ${meta[SnapshotMetaIndex.VERSION]}"
    }
    check(meta[SnapshotMetaIndex.PAYLOAD_SIZE] == SnapshotMetaIndex.SIZE.toDouble()) {
      "Invalid native snapshot metadata declared size: ${meta[SnapshotMetaIndex.PAYLOAD_SIZE]}"
    }
    fun ticks(values: DoubleArray): List<AxisTick> {
      val payload =
          decodeSnapshotRecordPayload(values, SnapshotTransportAbi.TICK_RECORD_WIDTH, "ticks")
      return List(payload.recordCount) { index ->
        val offset = payload.offset(index)
        AxisTick(payload.values[offset], payload.values[offset + 1].toFloat())
      }
    }
    val panes = snapshotPanes(snapshot, config, ::ticks)
    val overlayVertices = nativeSnapshotOverlayVertices(snapshot)
    check(overlayVertices.size % CONTENT_FLOATS_PER_VERTEX == 0) {
      "Invalid native overlay vertex layout: ${overlayVertices.size} floats"
    }
    return ChartSnapshot(
        revision = nativeSnapshotRevision(snapshot),
        contentRevision = contentRevision,
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
        overlayVertices = overlayVertices,
        xTicks = ticks(nativeSnapshotXTicks(snapshot)),
        yTicks = ticks(nativeSnapshotYTicks(snapshot)),
        panes = panes,
        rsiLegends = snapshotRsiLegends(snapshot),
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
  }

  private fun snapshotPanes(
      snapshot: Long,
      config: ChartConfig,
      ticks: (DoubleArray) -> List<AxisTick>,
  ): List<PaneSnapshot> {
    val paneTicks = ticks(nativeSnapshotPaneYTicks(snapshot))
    val paneMeta =
        decodeSnapshotRecordPayload(
            nativeSnapshotPanes(snapshot),
            SnapshotTransportAbi.PANE_RECORD_WIDTH,
            "panes",
        )
    return List(paneMeta.recordCount) { index ->
      val record = paneMeta.paneRecord(index)
      check(
          record.yTickOffset >= 0 &&
              record.yTickCount >= 0 &&
              record.yTickOffset + record.yTickCount <= paneTicks.size
      ) {
        "Invalid native pane tick range: offset=${record.yTickOffset}, " +
            "count=${record.yTickCount}, " +
            "total=${paneTicks.size}"
      }
      val configPane = config.panes.getOrNull(index)
      PaneSnapshot(
          paneId = configPane?.paneId ?: "pane-$index",
          priceScaleId = configPane?.priceScaleId ?: "scale-$index",
          plotLeft = record.plotLeft,
          plotTop = record.plotTop,
          plotRight = record.plotRight,
          plotBottom = record.plotBottom,
          heightWeight = record.heightWeight,
          visibleYMin = record.visibleYMin,
          visibleYMax = record.visibleYMax,
          yAxisScale = record.yAxisScale,
          yTicks =
              paneTicks.subList(
                  record.yTickOffset,
                  record.yTickOffset + record.yTickCount,
              ),
          scaleVisible = record.scaleVisible,
          volumeFormat = record.volumeFormat,
          precision = record.precision,
          rsiScale = record.rsiScale,
      )
    }
  }

  private fun snapshotRsiLegends(snapshot: Long): List<RsiLegendSnapshot> {
    val payload =
        decodeSnapshotRecordPayload(
            nativeSnapshotRsiLegends(snapshot),
            SnapshotTransportAbi.RSI_LEGEND_RECORD_WIDTH,
            "RSI legends",
        )
    return List(payload.recordCount) { index ->
      val record = payload.rsiLegendRecord(index)
      RsiLegendSnapshot(
          paneIndex = record.paneIndex,
          period = record.period,
          value = record.value,
          hasValue = record.hasValue,
          textColor = record.textColor,
          valueColor = record.valueColor,
          textColorSet = record.textColorSet,
      )
    }
  }
}
