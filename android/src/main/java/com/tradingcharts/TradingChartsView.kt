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
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt
import org.json.JSONException

private fun DoubleArray?.hasSameContentAs(other: DoubleArray?): Boolean {
  if (other == null) return this == null
  return this?.contentEquals(other) == true
}

class TradingChartsView(context: Context) : FrameLayout(context) {
  private val engineHandle = ChartEngineNative.nativeCreate()
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
                              ChartEngineNative.nativeScaleY(engineHandle, -distanceY)
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
                  if (crosshairPinned) {
                    crosshairPinned = false
                    crosshairGestureActive = false
                    ChartEngineNative.nativeSetCrosshair(engineHandle, false, event.x, event.y)
                    scheduleFrame()
                    return true
                  }
                  if (!config.crosshairEnabled || !isPointInPlot(event.x, event.y)) return true
                  suppressFlingForTouch = true
                  stopFling()
                  crosshairPinned = true
                  crosshairGestureActive = false
                  ChartEngineNative.nativeSetCrosshair(engineHandle, true, event.x, event.y)
                  scheduleFrame()
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
      scheduleFrame()
    } catch (error: JSONException) {
      logInvalidConfig(error)
    } catch (error: IllegalArgumentException) {
      logInvalidConfig(error)
    }
  }

  private fun logInvalidConfig(error: Exception) {
    Log.e(TAG, "Invalid configJson", error)
  }

  fun applyHistory(values: DoubleArray) {
    crosshairPinned = false
    crosshairGestureActive = false
    pendingScaleChange = false
    pendingYAxisScaleChange = false
    logStatus("setHistory", ChartEngineNative.nativeSetHistory(engineHandle, values))
    scheduleFrame()
  }

  fun prependHistory(values: DoubleArray) {
    crosshairPinned = false
    crosshairGestureActive = false
    logStatus("prependHistory", ChartEngineNative.nativePrependHistory(engineHandle, values))
    scheduleFrame()
  }

  fun applyCandle(values: DoubleArray) {
    logStatus("updateCandle", ChartEngineNative.nativeUpdateCandle(engineHandle, values))
    scheduleFrame()
  }

  fun applyTrade(values: DoubleArray) {
    logStatus("updateTrade", ChartEngineNative.nativeUpdateTrade(engineHandle, values))
    scheduleFrame()
  }

  fun applyTrades(values: DoubleArray) {
    logStatus("updateTrades", ChartEngineNative.nativeUpdateTrades(engineHandle, values))
    scheduleFrame()
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
    }
  }

  private fun scheduleFrame() {
    if (disposed || !isAttachedToWindow || !frameScheduled.compareAndSet(false, true)) return
    postOnAnimation {
      frameScheduled.set(false)
      if (disposed || !isAttachedToWindow) return@postOnAnimation
      val snapshot = ChartEngineNative.snapshot(engineHandle, config)
      renderer.snapshot = snapshot
      overlay.snapshot = snapshot
      plotView.requestRender()
      emitVisibleRangeChange(snapshot)
      emitSelectedCandleChange(snapshot)
      emitScaleChanges(snapshot)
    }
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
    UIManagerHelper.getEventDispatcher(reactContext)
        ?.dispatchEvent(VisibleRangeChangeEvent(UIManagerHelper.getSurfaceId(this), id, snapshot))
  }

  private fun emitSelectedCandleChange(snapshot: ChartSnapshot) {
    if (id == NO_ID) return
    val selected = snapshot.selectedCandle.takeIf { snapshot.crosshairVisible }
    if (lastSelectedCandle.hasSameContentAs(selected)) return
    lastSelectedCandle = selected?.copyOf()
    val reactContext = context as? ReactContext ?: return
    UIManagerHelper.getEventDispatcher(reactContext)
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
    val dispatcher = UIManagerHelper.getEventDispatcher(reactContext) ?: return
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
    }
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
    }
    parent?.requestDisallowInterceptTouchEvent(
        event.actionMasked != MotionEvent.ACTION_UP &&
            event.actionMasked != MotionEvent.ACTION_CANCEL
    )
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
    frameScheduled.set(false)
    plotView.onPause()
    registeredChartId?.let { TradingChartsRegistry.unregister(this, it) }
    registeredChartId = null
    super.onDetachedFromWindow()
  }

  fun dispose() {
    if (disposed) return
    stopFling()
    disposed = true
    registeredChartId?.let { TradingChartsRegistry.unregister(this, it) }
    registeredChartId = null
    ChartEngineNative.nativeDestroy(engineHandle)
  }

  companion object {
    private const val TAG = "TradingCharts"
    private const val FLING_DISTANCE_LIMIT = 1_000_000_000
    private const val PAST_EDGE_DATA_WAIT_MS = 1_500L
  }
}
