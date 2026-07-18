package com.tradingcharts

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.view.View
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

internal class ChartOverlayView(context: Context) : View(context) {
  var snapshot: ChartSnapshot? = null
    set(value) {
      field = value
      invalidate()
    }

  private val density = resources.displayMetrics.density
  private val scaledDensity = density * resources.configuration.fontScale
  private val axisPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = 10.5f * scaledDensity
    typeface = Typeface.MONOSPACE
  }
  private val badgePaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val badgeTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = 10.5f * scaledDensity
    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
  }
  private val tooltipPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val tooltipTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = 11f * scaledDensity
    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
  }
  private var formatterKey: String? = null
  private lateinit var numberFormat: NumberFormat
  private lateinit var dateFormat: SimpleDateFormat
  private lateinit var fullDateFormat: SimpleDateFormat

  init {
    setWillNotDraw(false)
  }

  private fun prepareFormatters(frame: ChartSnapshot) {
    val config = frame.config
    val key = "${config.xLocale}|${config.xTimeZone}|${config.showSeconds}|${config.valueFormat}"
    if (formatterKey == key) return
    formatterKey = key
    val numberLocale = Locale.forLanguageTag(config.valueFormat.locale)
    numberFormat = NumberFormat.getNumberInstance(numberLocale).apply {
      isGroupingUsed = config.valueFormat.useGrouping
      minimumFractionDigits = if (config.valueFormat.compact) 0 else config.valueFormat.precision
      maximumFractionDigits = config.valueFormat.precision
    }
    val dateLocale = Locale.forLanguageTag(config.xLocale)
    val zone = TimeZone.getTimeZone(config.xTimeZone)
    dateFormat = SimpleDateFormat("HH:mm", dateLocale).apply { timeZone = zone }
    fullDateFormat = SimpleDateFormat("d MMM yyyy HH:mm:ss", dateLocale).apply {
      timeZone = zone
    }
  }

  private fun formatValue(value: Double, frame: ChartSnapshot): String {
    val format = frame.config.valueFormat
    var scaled = value
    var suffix = ""
    if (format.compact) {
      when {
        abs(value) >= 1e12 -> { scaled = value / 1e12; suffix = "T" }
        abs(value) >= 1e9 -> { scaled = value / 1e9; suffix = "B" }
        abs(value) >= 1e6 -> { scaled = value / 1e6; suffix = "M" }
        abs(value) >= 1e3 -> { scaled = value / 1e3; suffix = "K" }
      }
    }
    return format.currencySymbol + numberFormat.format(scaled) + suffix
  }

  private fun formatTime(timestamp: Double, frame: ChartSnapshot, full: Boolean): String {
    if (full) return fullDateFormat.format(Date(timestamp.toLong()))
    val span = frame.visibleXMax - frame.visibleXMin
    dateFormat.applyPattern(
      when {
        span <= 5 * 60 * 1000.0 ||
          (frame.config.showSeconds && span <= 2 * 60 * 60 * 1000.0) -> "HH:mm:ss"
        span <= 2 * 24 * 60 * 60 * 1000.0 -> "HH:mm"
        span <= 180 * 24 * 60 * 60 * 1000.0 -> "d MMM"
        span <= 2 * 365 * 24 * 60 * 60 * 1000.0 -> "MMM yyyy"
        else -> "yyyy"
      },
    )
    return dateFormat.format(Date(timestamp.toLong()))
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val frame = snapshot ?: return
    prepareFormatters(frame)
    val config = frame.config
    axisPaint.color = config.axisTextColor
    axisPaint.typeface = Typeface.MONOSPACE

    if (config.showXAxis) {
      var lastRight = -Float.MAX_VALUE
      frame.xTicks.forEach { tick ->
        val label = formatTime(tick.value, frame, false)
        val textWidth = axisPaint.measureText(label)
        val x = max(2f, min(frame.width - textWidth - 2f, tick.position - textWidth / 2f))
        if (x >= lastRight + 8f * density) {
          canvas.drawText(label, x, frame.plotBottom + 16f * density, axisPaint)
          lastRight = x + textWidth
        }
      }
    }

    if (config.showYAxis) {
      frame.yTicks.forEach { tick ->
        val label = formatValue(tick.value, frame)
        val textWidth = axisPaint.measureText(label)
        val x = if (config.yAxisOnRight) frame.plotRight + 6f * density
          else max(2f, frame.plotLeft - textWidth - 6f * density)
        canvas.drawText(label, x, tick.position - (axisPaint.ascent() + axisPaint.descent()) / 2f, axisPaint)
      }
    }

    if (frame.currentPriceVisible && config.showCurrentPriceLabel) {
      val badgeHalfHeight = 10f * density
      val badgeY = frame.currentPriceY.coerceIn(
        badgeHalfHeight,
        max(badgeHalfHeight, frame.height - badgeHalfHeight),
      )
      drawBadge(
        canvas,
        formatValue(frame.currentPrice, frame),
        badgeY,
        colorFromFloats(frame.currentPriceColor),
        config,
      )
    }

    if (frame.crosshairVisible) {
      drawBadge(
        canvas,
        formatValue(frame.crosshairPrice, frame),
        frame.crosshairY,
        config.crosshairColor,
        config,
      )
      drawTimeBadge(canvas, formatTime(frame.selectedCandle[0], frame, true), frame)
      if (config.showTooltip) drawTooltip(canvas, frame)
    }
  }

  private fun drawBadge(canvas: Canvas, text: String, y: Float, color: Int, config: ChartConfig) {
    badgePaint.color = color
    badgeTextPaint.color = android.graphics.Color.BLACK
    val textWidth = badgeTextPaint.measureText(text)
    val badgeWidth = min(config.yAxisWidth, textWidth + 12f * density)
    val x = if (config.yAxisOnRight) snapshot!!.plotRight
      else max(0f, snapshot!!.plotLeft - badgeWidth)
    val frame = RectF(x, y - 10f * density, x + badgeWidth, y + 10f * density)
    canvas.drawRoundRect(frame, 4f * density, 4f * density, badgePaint)
    val baseline = frame.centerY() - (badgeTextPaint.ascent() + badgeTextPaint.descent()) / 2f
    canvas.drawText(text, frame.left + 6f * density, baseline, badgeTextPaint)
  }

  private fun drawTimeBadge(canvas: Canvas, text: String, frame: ChartSnapshot) {
    badgePaint.color = frame.config.crosshairColor
    badgeTextPaint.color = android.graphics.Color.BLACK
    val width = badgeTextPaint.measureText(text) + 12f * density
    val left = max(frame.plotLeft, min(frame.plotRight - width, frame.crosshairX - width / 2f))
    val rect = RectF(left, frame.plotBottom, left + width, frame.plotBottom + 20f * density)
    canvas.drawRoundRect(rect, 4f * density, 4f * density, badgePaint)
    val baseline = rect.centerY() - (badgeTextPaint.ascent() + badgeTextPaint.descent()) / 2f
    canvas.drawText(text, rect.left + 6f * density, baseline, badgeTextPaint)
  }

  private fun drawTooltip(canvas: Canvas, frame: ChartSnapshot) {
    val c = frame.selectedCandle
    val lines = listOf(
      formatTime(c[0], frame, true),
      "O  ${formatValue(c[1], frame)}",
      "H  ${formatValue(c[2], frame)}",
      "L  ${formatValue(c[3], frame)}",
      "C  ${formatValue(c[4], frame)}",
    )
    tooltipTextPaint.color = frame.config.tooltipTextColor
    tooltipPaint.color = frame.config.tooltipBackgroundColor
    val boxWidth = lines.maxOf { tooltipTextPaint.measureText(it) } + 20f * density
    val boxHeight = lines.size * 17f * density + 18f * density
    val left = if (frame.crosshairX > frame.width / 2f) frame.plotLeft + 8f * density
      else frame.plotRight - boxWidth - 8f * density
    val rect = RectF(left, frame.plotTop + 8f * density, left + boxWidth, frame.plotTop + 8f * density + boxHeight)
    canvas.drawRoundRect(rect, 8f * density, 8f * density, tooltipPaint)
    var y = rect.top + 9f * density - tooltipTextPaint.ascent()
    lines.forEach { line ->
      canvas.drawText(line, rect.left + 10f * density, y, tooltipTextPaint)
      y += 17f * density
    }
  }

  private fun colorFromFloats(value: FloatArray): Int {
    return android.graphics.Color.argb(
      (value[3] * 255).toInt(),
      (value[0] * 255).toInt(),
      (value[1] * 255).toInt(),
      (value[2] * 255).toInt(),
    )
  }
}
