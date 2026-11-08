package com.tradingcharts

import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.content.Context
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import kotlin.math.roundToInt
import kotlin.math.roundToLong

internal class ChartPulseDot(context: Context) : FrameLayout(context) {
  private val diameter = (8 * resources.displayMetrics.density).roundToInt()
  private val halo = circle()
  private val core = circle()
  private val plot = Rect()
  private var color: Int? = null
  private var endpointVisible = false
  private var hierarchyVisible = false
  private var hostActive = true
  private var radius = 0.0
  private var haloRadius = 0.0
  private var frequency = 0.0
  private val pulse =
      ObjectAnimator().apply {
        target = halo
        repeatCount = ObjectAnimator.INFINITE
        interpolator = LinearInterpolator()
      }

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }

  private fun circle() =
      View(context).also {
        it.background = GradientDrawable().apply { shape = GradientDrawable.OVAL }
        it.visibility = INVISIBLE
        addView(it, LayoutParams(diameter, diameter, Gravity.TOP or Gravity.LEFT))
      }

  private fun configurePulse(config: ChartConfig) {
    if (
        radius == config.pulseDotRadius &&
            haloRadius == config.pulseDotHaloRadius &&
            frequency == config.pulseDotFrequency
    )
        return
    stopAnimation()
    radius = config.pulseDotRadius
    haloRadius = config.pulseDotHaloRadius
    frequency = config.pulseDotFrequency
    val scalePerDp = 2.0 * resources.displayMetrics.density / diameter
    val coreScale = (radius * scalePerDp).toFloat()
    val haloScale = (haloRadius * scalePerDp).toFloat()
    val startScale = minOf(coreScale, haloScale)
    core.scaleX = coreScale
    core.scaleY = coreScale
    pulse.setValues(
        PropertyValuesHolder.ofFloat(View.SCALE_X, startScale, haloScale),
        PropertyValuesHolder.ofFloat(View.SCALE_Y, startScale, haloScale),
        PropertyValuesHolder.ofFloat(View.ALPHA, 0.25f, 0f),
    )
    pulse.duration = (1000 / frequency).roundToLong().coerceAtLeast(1)
  }

  fun apply(frame: ChartSnapshot) {
    val nextColor =
        if (frame.lineEndpointBelowBase) frame.config.pulseDotBelowBaseColor
        else frame.config.pulseDotColor
    endpointVisible = frame.lineEndpointVisible && nextColor != null
    if (endpointVisible && nextColor != null) {
      configurePulse(frame.config)
      if (color != nextColor) {
        (core.background as GradientDrawable).setColor(nextColor)
        (halo.background as GradientDrawable).setColor(nextColor)
        color = nextColor
      }
      plot.set(
          frame.plotLeft.roundToInt(),
          frame.plotTop.roundToInt(),
          frame.plotRight.roundToInt(),
          frame.plotBottom.roundToInt(),
      )
      clipBounds = plot
      core.translationX = frame.lineEndpointX - diameter / 2f
      core.translationY = frame.lineEndpointY - diameter / 2f
      halo.translationX = core.translationX
      halo.translationY = core.translationY
    }
    updateAnimation()
  }

  fun setHostActive(active: Boolean) {
    hostActive = active
    updateAnimation()
  }

  override fun onVisibilityAggregated(isVisible: Boolean) {
    super.onVisibilityAggregated(isVisible)
    hierarchyVisible = isVisible
    updateAnimation()
  }

  override fun onDetachedFromWindow() {
    hierarchyVisible = false
    stopAnimation()
    super.onDetachedFromWindow()
  }

  private fun updateAnimation() {
    if (hostActive && endpointVisible && hierarchyVisible) {
      if (core.visibility != VISIBLE) {
        core.visibility = VISIBLE
        halo.visibility = VISIBLE
        pulse.start()
      }
    } else {
      stopAnimation()
    }
  }

  private fun stopAnimation() {
    if (core.visibility == VISIBLE) {
      pulse.cancel()
      core.visibility = INVISIBLE
      halo.visibility = INVISIBLE
    }
  }
}
