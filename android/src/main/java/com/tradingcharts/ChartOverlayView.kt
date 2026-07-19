package com.tradingcharts

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
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
import kotlin.math.roundToInt

internal class ChartOverlayView(context: Context) : View(context) {
  private class ExtremumLabelCache {
    var formatterKey: String? = null
    var valueBits: Long = 0L
    var hasValue: Boolean = false
    var text: String = ""
    var width: Float = 0f
  }

  private data class TooltipRow(
    val label: String,
    val value: String,
    val valueColor: Int,
  )

  private data class TooltipLayout(
    val header: String,
    val rows: List<TooltipRow>,
    val width: Float,
    val height: Float,
    val valueXOffset: Float,
  )

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
  private val extremumLinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    strokeWidth = density
  }
  private val extremumBackgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val tooltipTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = 11f * scaledDensity
    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
  }
  private var formatterKey: String? = null
  private lateinit var numberFormat: NumberFormat
  private lateinit var percentFormat: NumberFormat
  private lateinit var volumeFormat: NumberFormat
  private lateinit var dateFormat: SimpleDateFormat
  private lateinit var fullDateFormat: SimpleDateFormat
  private val maximumLabelCache = ExtremumLabelCache()
  private val minimumLabelCache = ExtremumLabelCache()
  private var tooltipLayout: TooltipLayout? = null
  private var tooltipCandle: DoubleArray? = null
  private var tooltipConfig: ChartConfig? = null
  private var tooltipChangeBits: Long = 0L
  private var tooltipChangePercentBits: Long = 0L
  private var tooltipAmplitudePercentBits: Long = 0L
  private var tooltipPercentagesValid = false

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
    percentFormat = NumberFormat.getNumberInstance(numberLocale).apply {
      isGroupingUsed = false
      minimumFractionDigits = 2
      maximumFractionDigits = 2
    }
    volumeFormat = NumberFormat.getNumberInstance(numberLocale).apply {
      isGroupingUsed = config.valueFormat.useGrouping
      minimumFractionDigits = 0
      maximumFractionDigits = 2
    }
    val dateLocale = Locale.forLanguageTag(config.xLocale)
    val zone = TimeZone.getTimeZone(config.xTimeZone)
    dateFormat = SimpleDateFormat("HH:mm", dateLocale).apply { timeZone = zone }
    fullDateFormat = SimpleDateFormat("d MMM yyyy HH:mm:ss", dateLocale).apply {
      timeZone = zone
    }
    tooltipLayout = null
    tooltipConfig = null
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

  private fun formatPercent(value: Double, valid: Boolean): String =
    if (valid) "${percentFormat.format(value)}%" else "—"

  private fun formatVolume(value: Double): String {
    val magnitude = abs(value)
    val (scaled, suffix) = when {
      magnitude >= 1e12 -> value / 1e12 to "T"
      magnitude >= 1e9 -> value / 1e9 to "B"
      magnitude >= 1e6 -> value / 1e6 to "M"
      magnitude >= 1e3 -> value / 1e3 to "K"
      else -> value to ""
    }
    return volumeFormat.format(scaled) + suffix
  }

  private fun prepareExtremumLabel(
    extremum: PriceExtremumSnapshot,
    frame: ChartSnapshot,
    cache: ExtremumLabelCache,
  ) {
    val currentFormatterKey = formatterKey
    val valueBits = extremum.value.toBits()
    if (
      cache.hasValue &&
      cache.formatterKey == currentFormatterKey &&
      cache.valueBits == valueBits
    ) {
      return
    }
    cache.hasValue = true
    cache.formatterKey = currentFormatterKey
    cache.valueBits = valueBits
    cache.text = formatValue(extremum.value, frame)
    cache.width = axisPaint.measureText(cache.text)
  }

  private fun drawExtremum(
    canvas: Canvas,
    extremum: PriceExtremumSnapshot,
    frame: ChartSnapshot,
    cache: ExtremumLabelCache,
  ) {
    if (!extremum.visible) return
    prepareExtremumLabel(extremum, frame, cache)

    val direction = if (extremum.labelOnRight) 1f else -1f
    val lineEndX = (extremum.x + direction * 20f * density)
      .coerceIn(frame.plotLeft, frame.plotRight)
    canvas.drawLine(extremum.x, extremum.y, lineEndX, extremum.y, extremumLinePaint)

    val unclampedTextX = if (extremum.labelOnRight) {
      lineEndX + 4f * density
    } else {
      lineEndX - 4f * density - cache.width
    }
    val maximumTextX = max(frame.plotLeft, frame.plotRight - cache.width)
    val textX = unclampedTextX.coerceIn(frame.plotLeft, maximumTextX)
    val centeredBaseline = extremum.y - (axisPaint.ascent() + axisPaint.descent()) / 2f
    val minimumBaseline = frame.plotTop - axisPaint.ascent()
    val maximumBaseline = max(minimumBaseline, frame.plotBottom - axisPaint.descent())
    val baseline = centeredBaseline.coerceIn(minimumBaseline, maximumBaseline)
    canvas.drawRoundRect(
      textX - 2f * density,
      baseline + axisPaint.ascent() - density,
      textX + cache.width + 2f * density,
      baseline + axisPaint.descent() + density,
      2f * density,
      2f * density,
      extremumBackgroundPaint,
    )
    canvas.drawText(cache.text, textX, baseline, axisPaint)
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val frame = snapshot ?: return
    prepareFormatters(frame)
    val config = frame.config
    axisPaint.color = config.axisTextColor
    axisPaint.typeface = Typeface.MONOSPACE
    extremumLinePaint.color = config.axisTextColor
    extremumBackgroundPaint.color = config.backgroundColor

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

    drawExtremum(canvas, frame.visibleMaximum, frame, maximumLabelCache)
    drawExtremum(canvas, frame.visibleMinimum, frame, minimumLabelCache)

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
    val layout = prepareTooltipLayout(frame)
    tooltipTextPaint.color = frame.config.tooltipTextColor
    tooltipPaint.color = frame.config.tooltipBackgroundColor
    tooltipPaint.alpha = (
      Color.alpha(frame.config.tooltipBackgroundColor) *
        frame.config.tooltipBackgroundOpacity
      ).roundToInt()
    val boxWidth = layout.width
    val boxHeight = layout.height
    val left = if (frame.crosshairX > frame.width / 2f) frame.plotLeft + 8f * density
      else frame.plotRight - boxWidth - 8f * density
    val rect = RectF(left, frame.plotTop + 8f * density, left + boxWidth, frame.plotTop + 8f * density + boxHeight)
    canvas.drawRoundRect(rect, 8f * density, 8f * density, tooltipPaint)
    var y = rect.top + 9f * density - tooltipTextPaint.ascent()
    canvas.drawText(layout.header, rect.left + 10f * density, y, tooltipTextPaint)
    y += 17f * density
    layout.rows.forEach { row ->
      tooltipTextPaint.color = frame.config.tooltipTextColor
      canvas.drawText(row.label, rect.left + 10f * density, y, tooltipTextPaint)
      tooltipTextPaint.color = row.valueColor
      canvas.drawText(row.value, rect.left + layout.valueXOffset, y, tooltipTextPaint)
      y += 17f * density
    }
  }

  private fun prepareTooltipLayout(frame: ChartSnapshot): TooltipLayout {
    val c = frame.selectedCandle
    val cached = tooltipLayout
    if (
      cached != null &&
      tooltipConfig === frame.config &&
      tooltipCandle?.contentEquals(c) == true &&
      tooltipChangeBits == frame.selectedChange.toBits() &&
      tooltipChangePercentBits == frame.selectedChangePercent.toBits() &&
      tooltipAmplitudePercentBits == frame.selectedAmplitudePercent.toBits() &&
      tooltipPercentagesValid == frame.selectedPercentagesValid
    ) {
      return cached
    }

    val config = frame.config
    val labels = config.tooltipLabels
    val changeColor = when {
      frame.selectedChange > 0.0 -> config.upColor
      frame.selectedChange < 0.0 -> config.downColor
      else -> config.tooltipTextColor
    }
    val rows = listOf(
      TooltipRow(labels.open, formatValue(c[1], frame), config.tooltipTextColor),
      TooltipRow(labels.close, formatValue(c[4], frame), config.tooltipTextColor),
      TooltipRow(labels.high, formatValue(c[2], frame), config.tooltipTextColor),
      TooltipRow(labels.low, formatValue(c[3], frame), config.tooltipTextColor),
      TooltipRow(
        labels.amplitude,
        formatPercent(frame.selectedAmplitudePercent, frame.selectedPercentagesValid),
        config.tooltipTextColor,
      ),
      TooltipRow(
        labels.changePercent,
        formatPercent(frame.selectedChangePercent, frame.selectedPercentagesValid),
        changeColor,
      ),
      TooltipRow(labels.change, formatValue(frame.selectedChange, frame), changeColor),
      TooltipRow(labels.volume, formatVolume(c[5]), config.tooltipTextColor),
    )
    val header = formatTime(c[0], frame, true)
    val labelWidth = rows.maxOf { tooltipTextPaint.measureText(it.label) }
    val valueWidth = rows.maxOf { tooltipTextPaint.measureText(it.value) }
    val contentWidth = max(
      tooltipTextPaint.measureText(header),
      labelWidth + 12f * density + valueWidth,
    )
    val result = TooltipLayout(
      header = header,
      rows = rows,
      width = contentWidth + 20f * density,
      height = (rows.size + 1) * 17f * density + 18f * density,
      valueXOffset = 10f * density + labelWidth + 12f * density,
    )
    tooltipLayout = result
    tooltipCandle = c.copyOf()
    tooltipConfig = config
    tooltipChangeBits = frame.selectedChange.toBits()
    tooltipChangePercentBits = frame.selectedChangePercent.toBits()
    tooltipAmplitudePercentBits = frame.selectedAmplitudePercent.toBits()
    tooltipPercentagesValid = frame.selectedPercentagesValid
    return result
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
