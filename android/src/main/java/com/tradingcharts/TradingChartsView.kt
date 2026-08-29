package com.tradingcharts

import android.content.Context
import android.opengl.GLSurfaceView
import android.os.SystemClock
import android.util.Log
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.widget.FrameLayout
import android.widget.OverScroller
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

private fun DoubleArray?.hasSameContentAs(other: DoubleArray?): Boolean {
  if (other == null) return this == null
  return this?.contentEquals(other) == true
}

@Suppress("TooManyFunctions")
class TradingChartsView(context: Context) : FrameLayout(context) {
  private val engineHandle = ChartEngineNative.nativeCreate()
  private val contentBuffers = ContentVertexBufferPool()
  private val renderer = ChartRenderer()
  private val plotView =
      GLSurfaceView(context).apply {
        setEGLContextClientVersion(3)
        setEGLConfigChooser(8, 8, 8, 8, 16, 0)
        setRenderer(renderer)
        renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
        isClickable = false
      }
  private val overlay = ChartOverlayView(context)
  private val frameScheduled = AtomicBoolean(false)
  private val flingScroller = OverScroller(context)
  private var config = ChartConfig()
  private var registeredChartId: String? = null
  private var pendingChartId: String? = null
  private var disposed = false
  private var crosshairPinned = false
  private var crosshairGestureActive = false
  private var suppressFlingForTouch = false
  private var lastFlingX = 0
  private var pastEdgeWaitStartedAtMs = 0L
  private var lastVisibleRangeKey: Triple<Int, Int, Int>? = null
  private var lastSelectedCandle: DoubleArray? = null
  private var pendingScaleChange = false
  private var pendingYAxisScaleChange = false
  private val declarativeSeriesIds = mutableSetOf<String>()
  private var activeSeparatorIndex = -1
  private var separatorLastY = 0f
  private var pendingPaneResizeIndex = -1
  private var pendingPaneResizeFinished = false
  private var lastSnapshot: ChartSnapshot? = null
  private var lastAppliedRevision = -1L
  private var yAxisPressEnabled = false

  private val frameCallback = Runnable {
    frameScheduled.set(false)
    if (disposed || !isAttachedToWindow) return@Runnable
    // Pending event flags accompany engine mutations; skip the whole
    // snapshot marshal only when neither happened since the last frame.
    val hasPendingEvents =
        pendingPaneResizeIndex >= 0 || pendingScaleChange || pendingYAxisScaleChange
    if (
        !hasPendingEvents &&
            lastSnapshot != null &&
            ChartEngineNative.nativeEngineRevision(engineHandle) == lastAppliedRevision
    ) {
      return@Runnable
    }
    val frame =
        ChartEngineNative.snapshot(engineHandle, config, lastSnapshot, contentBuffers)
            ?: run {
              // All bounded direct-buffer slots are temporarily owned by the
              // GL thread. Retry on the next vsync without blocking the UI or
              // allocating an unbounded fallback buffer.
              scheduleFrame()
              return@Runnable
            }
    val snapshot = frame.snapshot
    lastSnapshot = snapshot
    lastAppliedRevision = snapshot.revision
    renderer.submit(frame)
    overlay.snapshot = snapshot
    plotView.requestRender()
    emitVisibleRangeChange(snapshot)
    emitSelectedCandleChange(snapshot)
    emitScaleChanges(snapshot)
    emitPaneResize(snapshot)
  }

  private val flingFrame =
      object : Runnable {
        override fun run() {
          if (disposed || !isAttachedToWindow || !flingScroller.computeScrollOffset()) return
          val currentX = flingScroller.currX
          val deltaX = currentX - lastFlingX
          lastFlingX = currentX
          if (deltaX != 0) {
            val moved = ChartEngineNative.nativePan(engineHandle, deltaX.toFloat())
            if (!moved) {
              val now = SystemClock.uptimeMillis()
              if (deltaX > 0 && pastEdgeWaitStartedAtMs == 0L) {
                // A positive delta moves toward older candles. Allow an in-flight
                // prepend to extend the viewport before abandoning the fling.
                pastEdgeWaitStartedAtMs = now
              }
              val waitingForPastData =
                  deltaX > 0 && now - pastEdgeWaitStartedAtMs < PAST_EDGE_DATA_WAIT_MS
              if (!waitingForPastData) {
                stopFling()
                return
              }
            } else {
              pastEdgeWaitStartedAtMs = 0L
              scheduleFrame()
            }
          }
          if (!flingScroller.isFinished) postOnAnimation(this)
        }
      }

  private val scaleDetector =
      ScaleGestureDetector(
          context,
          object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
              if (!config.allowZoom) return false
              suppressFlingForTouch = true
              stopFling()
              crosshairPinned = false
              crosshairGestureActive = false
              ChartEngineNative.nativeSetCrosshair(
                  engineHandle,
                  false,
                  detector.focusX,
                  detector.focusY,
              )
              return true
            }

            override fun onScale(detector: ScaleGestureDetector): Boolean {
              if (!config.allowZoom) return false
              if (
                  ChartEngineNative.nativeZoom(
                      engineHandle,
                      detector.scaleFactor.toDouble(),
                      detector.focusX,
                  )
              ) {
                pendingScaleChange = true
              }
              scheduleFrame()
              return true
            }
          },
      )

  private val gestureDetector =
      GestureDetector(
              context,
              object : GestureDetector.SimpleOnGestureListener() {
                override fun onDown(event: MotionEvent): Boolean {
                  stopFling()
                  return true
                }

                override fun onScroll(
                    first: MotionEvent?,
                    current: MotionEvent,
                    distanceX: Float,
                    distanceY: Float,
                ): Boolean {
                  var shouldScheduleFrame = false
                  if (crosshairPinned) {
                    ChartEngineNative.nativeSetCrosshair(engineHandle, true, current.x, current.y)
                    shouldScheduleFrame = true
                  } else if (!scaleDetector.isInProgress) {
                    if (isPointInYAxis(first)) {
                      if (
                          config.allowYAxisScale &&
                              ChartEngineNative.nativeScaleYAt(
                                  engineHandle,
                                  -distanceY,
                                  current.y,
                              )
                      ) {
                        pendingYAxisScaleChange = true
                        shouldScheduleFrame = true
                      }
                    } else if (config.allowPan) {
                      shouldScheduleFrame = ChartEngineNative.nativePan(engineHandle, -distanceX)
                    }
                  }
                  if (shouldScheduleFrame) scheduleFrame()
                  return true
                }

                override fun onLongPress(event: MotionEvent) {
                  if (
                      !config.crosshairEnabled ||
                          (!crosshairPinned && !isPointInPlot(event.x, event.y))
                  )
                      return
                  suppressFlingForTouch = true
                  stopFling()
                  crosshairPinned = true
                  crosshairGestureActive = true
                  ChartEngineNative.nativeSetCrosshair(engineHandle, true, event.x, event.y)
                  scheduleFrame()
                }

                override fun onSingleTapUp(event: MotionEvent): Boolean {
                  performClick()
                  if (tryEmitYAxisPress(event)) {
                    // Axis presses never alter crosshair state.
                  } else if (crosshairPinned) {
                    crosshairPinned = false
                    crosshairGestureActive = false
                    ChartEngineNative.nativeSetCrosshair(engineHandle, false, event.x, event.y)
                    scheduleFrame()
                  } else if (config.crosshairEnabled && isPointInPlot(event.x, event.y)) {
                    suppressFlingForTouch = true
                    stopFling()
                    crosshairPinned = true
                    crosshairGestureActive = false
                    ChartEngineNative.nativeSetCrosshair(engineHandle, true, event.x, event.y)
                    scheduleFrame()
                  }
                  return true
                }

                override fun onFling(
                    first: MotionEvent?,
                    current: MotionEvent,
                    velocityX: Float,
                    velocityY: Float,
                ): Boolean {
                  if (!canStartFling(first)) return false
                  startFling(velocityX)
                  return true
                }
              },
          )
          .also { detector ->
            detector.setOnDoubleTapListener(null)
          }

  private fun canStartFling(first: MotionEvent?): Boolean {
    if (first == null || suppressFlingForTouch || crosshairPinned) return false
    return config.allowPan && !isPointInYAxis(first)
  }

  private fun isPointInYAxis(first: MotionEvent?): Boolean {
    if (first == null || !config.showYAxis) return false
    return if (config.yAxisOnRight) {
      first.x >= width - config.yAxisWidth
    } else {
      first.x <= config.yAxisWidth
    }
  }

  private fun isPointInPlot(x: Float, y: Float): Boolean {
    val frame = overlay.snapshot ?: return false
    return x >= frame.plotLeft &&
        x <= frame.plotRight &&
        y >= frame.plotTop &&
        y <= frame.plotBottom
  }

  private fun startFling(velocityX: Float) {
    stopFling()
    lastFlingX = 0
    flingScroller.fling(
        0,
        0,
        velocityX.roundToInt(),
        0,
        -FLING_DISTANCE_LIMIT,
        FLING_DISTANCE_LIMIT,
        0,
        0,
    )
    postOnAnimation(flingFrame)
  }

  private fun stopFling() {
    removeCallbacks(flingFrame)
    if (!flingScroller.isFinished) flingScroller.forceFinished(true)
    lastFlingX = 0
    pastEdgeWaitStartedAtMs = 0L
  }

  init {
    addView(plotView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(overlay, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    ChartEngineNative.setConfig(engineHandle, config)
    isClickable = true
  }

  fun setChartId(value: String?) {
    pendingChartId = value?.takeIf { it.isNotBlank() }
    post {
      if (disposed) return@post
      val next = pendingChartId
      if (next == registeredChartId) return@post
      registeredChartId?.let { TradingChartsRegistry.unregister(this, it) }
      registeredChartId = next
      next?.let { TradingChartsRegistry.register(this, it) }
    }
  }

  fun setConfigJson(value: String?) {
    if (value.isNullOrBlank()) return
    try {
      config =
          ChartConfig.fromJson(
              value,
              resources.displayMetrics.density,
              resources.displayMetrics.scaledDensity,
          )
      if (!config.allowPan) stopFling()
      if (!config.crosshairEnabled) {
        crosshairPinned = false
        crosshairGestureActive = false
      }
      pendingScaleChange = false
      pendingYAxisScaleChange = false
      ChartEngineNative.setConfig(engineHandle, config)
      reconcileDeclarativeSeries()
      scheduleFrame()
    } catch (error: JSONException) {
      logInvalidConfig(error)
    } catch (error: IllegalArgumentException) {
      logInvalidConfig(error)
    }
  }

  fun setYAxisPressEnabled(enabled: Boolean) {
    yAxisPressEnabled = enabled
  }

  private fun logInvalidConfig(error: Exception) {
    Log.e(TAG, "Invalid configJson", error)
  }

  fun applyHistory(values: DoubleArray) {
    crosshairPinned = false
    crosshairGestureActive = false
    pendingScaleChange = false
    pendingYAxisScaleChange = false
    val status = ChartEngineNative.nativeSetHistory(engineHandle, values)
    logStatus("setHistory", status)
    if (status == STATUS_APPLIED) scheduleFrame()
  }

  fun prependHistory(values: DoubleArray) {
    crosshairPinned = false
    crosshairGestureActive = false
    val status = ChartEngineNative.nativePrependHistory(engineHandle, values)
    logStatus("prependHistory", status)
    if (status == STATUS_APPLIED) scheduleFrame()
  }

  fun applyCandle(values: DoubleArray) {
    val status = ChartEngineNative.nativeUpdateCandle(engineHandle, values)
    logStatus("updateCandle", status)
    if (status == STATUS_APPLIED) scheduleFrame()
  }

  fun applyTrade(values: DoubleArray) {
    val status = ChartEngineNative.nativeUpdateTrade(engineHandle, values)
    logStatus("updateTrade", status)
    if (status == STATUS_APPLIED) scheduleFrame()
  }

  fun applyTrades(values: DoubleArray) {
    val status = ChartEngineNative.nativeUpdateTrades(engineHandle, values)
    logStatus("updateTrades", status)
    if (status == STATUS_APPLIED) scheduleFrame()
  }

  fun addSeries(seriesJson: String) {
    try {
      val series = seriesConfigFromJson(seriesJson, config)
      val status = ChartEngineNative.addSeries(engineHandle, series)
      logStatus("addSeries", status)
      if (status == STATUS_APPLIED) scheduleFrame()
    } catch (error: JSONException) {
      logInvalidConfig(error)
    } catch (error: IllegalArgumentException) {
      logInvalidConfig(error)
    }
  }

  fun setSeriesData(
      seriesId: String,
      dataType: String,
      values: DoubleArray,
      prepend: Boolean,
      update: Boolean,
  ) {
    val histogram = dataType == "histogram"
    val status =
        when {
          update ->
              ChartEngineNative.nativeUpdateSeriesData(
                  engineHandle,
                  seriesId,
                  histogram,
                  values,
              )
          prepend ->
              ChartEngineNative.nativePrependSeriesData(
                  engineHandle,
                  seriesId,
                  histogram,
                  values,
              )
          else ->
              ChartEngineNative.nativeSetSeriesData(
                  engineHandle,
                  seriesId,
                  histogram,
                  values,
              )
        }
    logStatus("seriesData", status)
    if (status == STATUS_APPLIED) scheduleFrame()
  }

  fun removeSeries(seriesId: String) {
    if (ChartEngineNative.nativeRemoveSeries(engineHandle, seriesId)) {
      scheduleFrame()
    }
  }

  fun setPaneHeight(paneId: String, heightWeight: Double) {
    if (ChartEngineNative.nativeSetPaneHeight(engineHandle, paneId, heightWeight)) {
      scheduleFrame()
    }
  }

  fun setPriceLine(id: String, price: Double, label: String, color: String) {
    if (
        ChartEngineNative.nativeSetPriceLine(
            engineHandle,
            id,
            price,
            label,
            color,
            parseChartColor(color),
        )
    ) {
      scheduleFrame()
    }
  }

  fun removePriceLine(id: String) {
    if (ChartEngineNative.nativeRemovePriceLine(engineHandle, id)) scheduleFrame()
  }

  fun clearPriceLines() {
    if (ChartEngineNative.nativeClearPriceLines(engineHandle)) scheduleFrame()
  }

  fun priceLinesJson(): String {
    val values = JSONArray()
    ChartEngineNative.priceLines(engineHandle).forEach { line ->
      values.put(
          JSONObject()
              .put("id", line.id)
              .put("price", line.price)
              .put("label", line.label)
              .put("color", line.color)
      )
    }
    return values.toString()
  }

  fun zoom(scale: Double) {
    stopFling()
    crosshairPinned = false
    crosshairGestureActive = false
    pendingScaleChange = false
    ChartEngineNative.nativeZoomAtRightEdge(engineHandle, scale)
    scheduleFrame()
  }

  fun fitContent() {
    stopFling()
    crosshairPinned = false
    crosshairGestureActive = false
    pendingScaleChange = false
    pendingYAxisScaleChange = false
    ChartEngineNative.nativeFitContent(engineHandle)
    scheduleFrame()
  }

  fun clearData() {
    stopFling()
    crosshairPinned = false
    crosshairGestureActive = false
    pendingScaleChange = false
    pendingYAxisScaleChange = false
    ChartEngineNative.nativeClear(engineHandle)
    lastVisibleRangeKey = null
    scheduleFrame()
  }

  fun candles(): DoubleArray = ChartEngineNative.nativeCandles(engineHandle)

  private fun logStatus(operation: String, status: Int) {
    when (status) {
      1 -> Log.w(TAG, "$operation ignored an out-of-order timestamp")
      2 -> Log.e(TAG, "$operation received invalid data")
      3 -> Log.w(TAG, "$operation ignored a trade outside the configured session")
    }
  }

  private fun scheduleFrame() {
    if (disposed || !isAttachedToWindow || !frameScheduled.compareAndSet(false, true)) return
    postOnAnimation(frameCallback)
  }

  @Suppress("DEPRECATION")
  private fun eventDispatcher(reactContext: ReactContext) =
      UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)

  private fun tryEmitYAxisPress(event: MotionEvent): Boolean {
    if (!yAxisPressEnabled || !isPointInYAxis(event)) return false
    val value = ChartEngineNative.yAxisValueAt(engineHandle, event.y)
    val pane = value?.let { config.panes.getOrNull(it.paneIndex) }
    if (value == null || pane == null) return false
    emitYAxisPress(event, value, pane)
    return true
  }

  private fun emitYAxisPress(event: MotionEvent, value: YAxisValue, pane: PaneConfig) {
    if (id == NO_ID) return
    val reactContext = context as? ReactContext ?: return
    val density = resources.displayMetrics.density.toDouble()
    eventDispatcher(reactContext)
        ?.dispatchEvent(
            YAxisPressEvent(
                UIManagerHelper.getSurfaceId(this),
                id,
                event.x / density,
                event.y / density,
                value.price,
                pane.paneId,
                pane.priceScaleId,
            )
        )
  }

  private fun emitVisibleRangeChange(snapshot: ChartSnapshot) {
    if (!snapshot.hasVisibleCandles || id == NO_ID) return
    val key =
        Triple(
            snapshot.firstVisibleIndex,
            snapshot.lastVisibleIndex,
            snapshot.totalCandleCount,
        )
    if (key == lastVisibleRangeKey) return
    lastVisibleRangeKey = key
    val reactContext = context as? ReactContext ?: return
    eventDispatcher(reactContext)
        ?.dispatchEvent(VisibleRangeChangeEvent(UIManagerHelper.getSurfaceId(this), id, snapshot))
  }

  private fun emitSelectedCandleChange(snapshot: ChartSnapshot) {
    if (id == NO_ID) return
    val selected = snapshot.selectedCandle.takeIf { snapshot.crosshairVisible }
    if (lastSelectedCandle.hasSameContentAs(selected)) return
    lastSelectedCandle = selected?.copyOf()
    val reactContext = context as? ReactContext ?: return
    eventDispatcher(reactContext)
        ?.dispatchEvent(
            SelectedCandleChangeEvent(
                UIManagerHelper.getSurfaceId(this),
                id,
                selected != null,
                selected ?: DoubleArray(6),
            )
        )
  }

  private fun emitScaleChanges(snapshot: ChartSnapshot) {
    val emitHorizontal = pendingScaleChange
    val emitYAxis = pendingYAxisScaleChange
    pendingScaleChange = false
    pendingYAxisScaleChange = false
    if ((!emitHorizontal && !emitYAxis) || id == NO_ID) return
    val reactContext = context as? ReactContext ?: return
    val dispatcher = eventDispatcher(reactContext) ?: return
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    if (emitHorizontal) {
      dispatcher.dispatchEvent(
          ScaleChangeEvent(
              surfaceId,
              id,
              ScaleChangeEvent.HORIZONTAL_EVENT_NAME,
              snapshot.horizontalScale,
          )
      )
    }
    if (emitYAxis) {
      dispatcher.dispatchEvent(
          ScaleChangeEvent(
              surfaceId,
              id,
              ScaleChangeEvent.Y_AXIS_EVENT_NAME,
              snapshot.yAxisScale,
          )
      )
      val pane = snapshot.panes.getOrNull(snapshot.activePaneIndex) ?: snapshot.panes.firstOrNull()
      if (pane != null) {
        dispatcher.dispatchEvent(
            PriceScaleChangeEvent(
                surfaceId,
                id,
                pane.paneId,
                pane.priceScaleId,
                pane.yAxisScale,
            )
        )
      }
    }
  }

  private fun emitPaneResize(snapshot: ChartSnapshot) {
    val separatorIndex = pendingPaneResizeIndex
    val first = snapshot.panes.getOrNull(separatorIndex)
    val second = snapshot.panes.getOrNull(separatorIndex + 1)
    val reactContext = context as? ReactContext
    val hasTarget = separatorIndex >= 0 && id != NO_ID
    val hasPayload = first != null && second != null && reactContext != null
    pendingPaneResizeIndex = -1
    if (!hasTarget || !hasPayload) {
      // Reset alongside the index so a stale flag cannot fire a late event.
      pendingPaneResizeFinished = false
      return
    }
    val finished = pendingPaneResizeFinished
    pendingPaneResizeFinished = false
    eventDispatcher(reactContext)
        ?.dispatchEvent(
            PaneResizeEvent(
                UIManagerHelper.getSurfaceId(this),
                id,
                first.paneId,
                first.heightWeight,
                second.paneId,
                second.heightWeight,
                finished,
            )
        )
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    ChartEngineNative.nativeSetSize(engineHandle, width.toFloat(), height.toFloat())
    scheduleFrame()
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      suppressFlingForTouch = false
      crosshairGestureActive = false
      stopFling()
      if (config.panesResizable) {
        activeSeparatorIndex =
            ChartEngineNative.nativeSeparatorAt(
                engineHandle,
                event.y,
                12f * resources.displayMetrics.density,
            )
        if (activeSeparatorIndex >= 0) {
          suppressFlingForTouch = true
          separatorLastY = event.y
        }
      }
    }
    parent?.requestDisallowInterceptTouchEvent(
        event.actionMasked != MotionEvent.ACTION_UP &&
            event.actionMasked != MotionEvent.ACTION_CANCEL
    )
    if (activeSeparatorIndex >= 0) {
      when (event.actionMasked) {
        MotionEvent.ACTION_MOVE -> {
          val delta = event.y - separatorLastY
          separatorLastY = event.y
          if (
              ChartEngineNative.nativeResizePaneSeparator(
                  engineHandle,
                  activeSeparatorIndex,
                  delta,
              )
          ) {
            pendingPaneResizeIndex = activeSeparatorIndex
            scheduleFrame()
          }
        }
        MotionEvent.ACTION_UP,
        MotionEvent.ACTION_CANCEL -> {
          pendingPaneResizeIndex = activeSeparatorIndex
          pendingPaneResizeFinished = true
          activeSeparatorIndex = -1
          scheduleFrame()
        }
      }
      return true
    }
    scaleDetector.onTouchEvent(event)
    gestureDetector.onTouchEvent(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_MOVE -> {
        // GestureDetector stops dispatching onScroll after onLongPress. Keep
        // updating the crosshair from the original long-press touch instead.
        if (crosshairGestureActive && !scaleDetector.isInProgress) {
          ChartEngineNative.nativeSetCrosshair(engineHandle, true, event.x, event.y)
          scheduleFrame()
        }
      }
      MotionEvent.ACTION_UP,
      MotionEvent.ACTION_CANCEL -> crosshairGestureActive = false
    }
    return true
  }

  override fun performClick(): Boolean {
    super.performClick()
    return true
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    (context as? ReactContext)?.addLifecycleEventListener(lifecycleListener)
    plotView.onResume()
    pendingChartId?.let { id ->
      if (registeredChartId == null) {
        registeredChartId = id
        TradingChartsRegistry.register(this, id)
      }
    }
    scheduleFrame()
  }

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (visibility != VISIBLE) stopFling()
  }

  override fun onDetachedFromWindow() {
    stopFling()
    removeCallbacks(frameCallback)
    frameScheduled.set(false)
    (context as? ReactContext)?.removeLifecycleEventListener(lifecycleListener)
    plotView.onPause()
    registeredChartId?.let { TradingChartsRegistry.unregister(this, it) }
    registeredChartId = null
    super.onDetachedFromWindow()
  }

  fun dispose() {
    if (disposed) return
    stopFling()
    disposed = true
    renderer.clearPending()
    (context as? ReactContext)?.removeLifecycleEventListener(lifecycleListener)
    registeredChartId?.let { TradingChartsRegistry.unregister(this, it) }
    registeredChartId = null
    ChartEngineNative.nativeDestroy(engineHandle)
  }

  private val lifecycleListener =
      object : LifecycleEventListener {
        override fun onHostResume() {
          plotView.onResume()
          scheduleFrame()
        }

        override fun onHostPause() {
          stopFling()
          plotView.onPause()
        }

        override fun onHostDestroy() = Unit
      }

  private fun reconcileDeclarativeSeries() {
    val requestedIds = config.additionalSeries.mapTo(mutableSetOf()) { it.seriesId }
    (declarativeSeriesIds - requestedIds).forEach {
      ChartEngineNative.nativeRemoveSeries(engineHandle, it)
    }
    val nextIds = mutableSetOf<String>()
    config.additionalSeries.forEach {
      val status = ChartEngineNative.addSeries(engineHandle, it)
      logStatus("additionalSeries", status)
      if (status == 0) nextIds += it.seriesId
    }
    declarativeSeriesIds.clear()
    declarativeSeriesIds.addAll(nextIds)
  }

  companion object {
    private const val TAG = "TradingCharts"
    private const val FLING_DISTANCE_LIMIT = 1_000_000_000
    private const val PAST_EDGE_DATA_WAIT_MS = 1_500L
    private const val STATUS_APPLIED = 0
  }
}
