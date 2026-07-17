package com.tradingcharts

import android.content.Context
import android.opengl.GLSurfaceView
import android.util.Log
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.widget.FrameLayout
import android.widget.OverScroller
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt

class TradingChartsView(context: Context) : FrameLayout(context) {
  private val engineHandle = ChartEngineNative.nativeCreate()
  private val renderer = ChartRenderer()
  private val plotView = GLSurfaceView(context).apply {
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
  private var crosshairActive = false
  private var suppressFlingForTouch = false
  private var lastFlingX = 0

  private val flingFrame = object : Runnable {
    override fun run() {
      if (disposed || !isAttachedToWindow || !flingScroller.computeScrollOffset()) return
      val currentX = flingScroller.currX
      val deltaX = currentX - lastFlingX
      lastFlingX = currentX
      if (deltaX != 0) {
        val moved = ChartEngineNative.nativePan(engineHandle, deltaX.toFloat())
        if (!moved) {
          stopFling()
          return
        }
        scheduleFrame()
      }
      if (!flingScroller.isFinished) postOnAnimation(this)
    }
  }

  private val scaleDetector = ScaleGestureDetector(
    context,
    object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
      override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
        suppressFlingForTouch = true
        stopFling()
        return config.allowZoom
      }

      override fun onScale(detector: ScaleGestureDetector): Boolean {
        if (!config.allowZoom) return false
        ChartEngineNative.nativeZoom(
          engineHandle,
          detector.scaleFactor.toDouble(),
          detector.focusX,
        )
        scheduleFrame()
        return true
      }
    },
  )

  private val gestureDetector = GestureDetector(
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
        if (crosshairActive) {
          ChartEngineNative.nativeSetCrosshair(engineHandle, true, current.x, current.y)
        } else if (!scaleDetector.isInProgress) {
          if (isYAxisGesture(first)) {
            ChartEngineNative.nativeScaleY(engineHandle, -distanceY)
          } else if (config.allowPan) {
            ChartEngineNative.nativePan(engineHandle, -distanceX)
          }
        }
        scheduleFrame()
        return true
      }

      override fun onLongPress(event: MotionEvent) {
        if (!config.crosshairEnabled) return
        suppressFlingForTouch = true
        stopFling()
        crosshairActive = true
        ChartEngineNative.nativeSetCrosshair(engineHandle, true, event.x, event.y)
        scheduleFrame()
      }

      override fun onFling(
        first: MotionEvent?,
        current: MotionEvent,
        velocityX: Float,
        velocityY: Float,
      ): Boolean {
        if (
          first == null ||
          suppressFlingForTouch ||
          crosshairActive ||
          isYAxisGesture(first) ||
          !config.allowPan
        ) {
          return false
        }
        startFling(velocityX)
        return true
      }

      override fun onDoubleTap(event: MotionEvent): Boolean {
        suppressFlingForTouch = true
        stopFling()
        ChartEngineNative.nativeResetViewport(engineHandle)
        scheduleFrame()
        return true
      }
    },
  )

  private fun isYAxisGesture(first: MotionEvent?): Boolean {
    if (first == null || !config.showYAxis || !config.allowZoom) return false
    return if (config.yAxisOnRight) {
      first.x >= width - config.yAxisWidth
    } else {
      first.x <= config.yAxisWidth
    }
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
      config = ChartConfig.fromJson(value, resources.displayMetrics.density)
      if (!config.allowPan) stopFling()
      ChartEngineNative.setConfig(engineHandle, config)
      scheduleFrame()
    } catch (error: Exception) {
      Log.e(TAG, "Invalid configJson", error)
    }
  }

  fun applyHistory(values: DoubleArray) {
    logStatus("setHistory", ChartEngineNative.nativeSetHistory(engineHandle, values))
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

  fun clearData() {
    stopFling()
    ChartEngineNative.nativeClear(engineHandle)
    scheduleFrame()
  }

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
      stopFling()
    }
    parent?.requestDisallowInterceptTouchEvent(
      event.actionMasked != MotionEvent.ACTION_UP && event.actionMasked != MotionEvent.ACTION_CANCEL
    )
    scaleDetector.onTouchEvent(event)
    gestureDetector.onTouchEvent(event)
    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
      if (crosshairActive) {
        crosshairActive = false
        ChartEngineNative.nativeSetCrosshair(engineHandle, false, event.x, event.y)
        scheduleFrame()
      }
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
  }
}
