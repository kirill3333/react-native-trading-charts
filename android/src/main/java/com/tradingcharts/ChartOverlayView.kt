package com.tradingcharts

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.util.Log
import android.view.View
import java.text.DecimalFormatSymbols
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.roundToInt

internal class ChartOverlayView(context: Context) : View(context) {
  private data class PreparedValueFormat(
      val number: NumberFormat,
      val currencySymbol: String,
      val decimalSeparator: String,
      val type: String,
      val significantDigits: Int,
  )

  private class ExtremumLabelCache {
    var config: ChartConfig? = null
    var valueBits: Long = 0L
    var hasValue = false
    var text = ""
    var width = 0f
  }

  private data class TooltipRow(val label: String, val value: String, val valueColor: Int)

  private data class TooltipLayout(
      val header: String,
      val rows: List<TooltipRow>,
      val width: Float,
      val height: Float,
      val valueXOffset: Float,
      val headerHeight: Float,
      val rowHeight: Float,
  )

  var snapshot: ChartSnapshot? = null
    set(value) {
      field = value
      invalidate()
    }

  private val density = resources.displayMetrics.density
  private val scaledDensity = resources.displayMetrics.scaledDensity
  private val xAxisPaint = textPaint(10.5f, false)
  private val yAxisPaint = textPaint(10.5f, false)
  private val extremaTextPaint = textPaint(10.5f, false)
  private val currentPriceTextPaint = textPaint(10.5f, true)
  private val crosshairPriceTextPaint = textPaint(10.5f, true)
  private val crosshairTimeTextPaint = textPaint(10.5f, true)
  private val tooltipHeaderPaint = textPaint(11f, false)
  private val tooltipLabelPaint = textPaint(11f, false)
  private val tooltipValuePaint = textPaint(11f, false)
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val extremumLinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeWidth = density }
  private val extremumBackgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG)

  private var preparedConfig: ChartConfig? = null
  private lateinit var yAxisValueFormat: PreparedValueFormat
  private lateinit var extremaValueFormat: PreparedValueFormat
  private lateinit var currentPriceValueFormat: PreparedValueFormat
  private lateinit var crosshairPriceValueFormat: PreparedValueFormat
  private lateinit var tooltipValueFormat: PreparedValueFormat
  private lateinit var percentFormat: NumberFormat
  private lateinit var volumeFormat: NumberFormat
  private lateinit var axisDateFormats: List<SimpleDateFormat>
  private lateinit var crosshairTimeDateFormat: SimpleDateFormat
  private lateinit var tooltipHeaderDateFormat: SimpleDateFormat
  private val maximumLabelCache = ExtremumLabelCache()
  private val minimumLabelCache = ExtremumLabelCache()
  private var tooltipLayout: TooltipLayout? = null
  private var tooltipCandle: DoubleArray? = null
  private var tooltipConfig: ChartConfig? = null
  private var tooltipChangeBits = 0L
  private var tooltipChangePercentBits = 0L
  private var tooltipAmplitudePercentBits = 0L
  private var tooltipPercentagesValid = false

  init {
    setWillNotDraw(false)
  }

  private fun textPaint(sizeSp: Float, bold: Boolean) =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = sizeSp * scaledDensity
        typeface = Typeface.create(Typeface.MONOSPACE, if (bold) Typeface.BOLD else Typeface.NORMAL)
      }

  private fun prepare(config: ChartConfig) {
    if (preparedConfig === config) return
    preparedConfig = config
    applyTextStyle(xAxisPaint, config.xAxisTextStyle, 10.5f, false)
    applyTextStyle(yAxisPaint, config.yAxisTextStyle, 10.5f, false)
    applyTextStyle(extremaTextPaint, config.extremaTextStyle, 10.5f, false)
    applyTextStyle(currentPriceTextPaint, config.currentPriceTextStyle, 10.5f, true)
    applyTextStyle(crosshairPriceTextPaint, config.crosshairPriceTextStyle, 10.5f, true)
    applyTextStyle(crosshairTimeTextPaint, config.crosshairTimeTextStyle, 10.5f, true)
    applyTextStyle(tooltipHeaderPaint, config.tooltipHeaderTextStyle, 11f, false)
    applyTextStyle(tooltipLabelPaint, config.tooltipLabelTextStyle, 11f, false)
    applyTextStyle(tooltipValuePaint, config.tooltipValueTextStyle, 11f, false)

    yAxisValueFormat = prepareValueFormat(config.valueFormat)
    extremaValueFormat = prepareValueFormat(config.extremaValueFormat)
    currentPriceValueFormat = prepareValueFormat(config.currentPriceValueFormat)
    crosshairPriceValueFormat = prepareValueFormat(config.crosshairPriceValueFormat)
    tooltipValueFormat = prepareValueFormat(config.tooltipValueFormat)
    val locale = Locale.forLanguageTag(config.valueFormat.locale)
    percentFormat =
        NumberFormat.getNumberInstance(locale).apply {
          isGroupingUsed = false
          minimumFractionDigits = 2
          maximumFractionDigits = 2
        }
    volumeFormat =
        NumberFormat.getNumberInstance(locale).apply {
          isGroupingUsed = config.valueFormat.useGrouping
          minimumFractionDigits = 0
          maximumFractionDigits = 2
        }
    val axisDates = config.xAxisDateFormats
    axisDateFormats =
        listOf(
            safeDateFormat(axisDates.seconds, axisDates.locale, axisDates.timeZone, "HH:mm:ss"),
            safeDateFormat(axisDates.time, axisDates.locale, axisDates.timeZone, "HH:mm"),
            safeDateFormat(axisDates.day, axisDates.locale, axisDates.timeZone, "d MMM"),
            safeDateFormat(axisDates.month, axisDates.locale, axisDates.timeZone, "MMM yyyy"),
            safeDateFormat(axisDates.year, axisDates.locale, axisDates.timeZone, "yyyy"),
        )
    crosshairTimeDateFormat = safeDateFormat(config.crosshairTimeDateFormat, "d MMM yyyy HH:mm:ss")
    tooltipHeaderDateFormat = safeDateFormat(config.tooltipHeaderDateFormat, "d MMM yyyy HH:mm:ss")
    tooltipLayout = null
    tooltipConfig = null
    maximumLabelCache.hasValue = false
    minimumLabelCache.hasValue = false
  }

  private fun applyTextStyle(
      paint: Paint,
      style: TextStyleConfig,
      defaultSizeSp: Float,
      defaultBold: Boolean,
  ) {
    paint.color = style.color
    paint.textSize = style.fontSizePx ?: defaultSizeSp * scaledDensity
    val bold =
        when (style.fontWeight) {
          "medium",
          "semibold",
          "bold" -> true
          "regular" -> false
          else -> defaultBold
        }
    val family =
        style.fontFamily?.let { Typeface.create(it, Typeface.NORMAL) } ?: Typeface.MONOSPACE
    paint.typeface = Typeface.create(family, if (bold) Typeface.BOLD else Typeface.NORMAL)
  }

  private fun prepareValueFormat(format: ValueFormat): PreparedValueFormat {
    val locale = Locale.forLanguageTag(format.locale)
    val number =
        NumberFormat.getNumberInstance(locale).apply {
          isGroupingUsed = format.useGrouping
          minimumFractionDigits = if (format.type == "price") format.precision else 0
          maximumFractionDigits = if (format.significant) 12 else format.precision
        }
    return PreparedValueFormat(
        number = number,
        currencySymbol = format.currencySymbol,
        decimalSeparator = DecimalFormatSymbols.getInstance(locale).decimalSeparator.toString(),
        type = format.type,
        significantDigits = format.significantDigits,
    )
  }

  private fun safeDateFormat(config: DatePatternConfig, fallback: String) =
      safeDateFormat(config.pattern, config.locale, config.timeZone, fallback)

  private fun safeDateFormat(
      pattern: String,
      locale: String,
      zone: String,
      fallback: String,
  ): SimpleDateFormat {
    val result =
        try {
          SimpleDateFormat(pattern, Locale.forLanguageTag(locale))
        } catch (error: IllegalArgumentException) {
          Log.w(TAG, "Invalid date pattern '$pattern'; using '$fallback'", error)
          SimpleDateFormat(fallback, Locale.forLanguageTag(locale))
        }
    result.timeZone = TimeZone.getTimeZone(zone)
    return result
  }

  private fun formatValue(value: Double, format: PreparedValueFormat): String {
    if (format.type == "significant") {
      val rounded = roundToSignificant(value, format.significantDigits)
      val compact = cryptoZeroCount(rounded, format)
      return format.currencySymbol + (compact ?: format.number.format(rounded))
    }

    var scaled = value
    var suffix = ""
    if (format.type == "compact") {
      when {
        abs(value) >= 1e12 -> {
          scaled = value / 1e12
          suffix = "T"
        }
        abs(value) >= 1e9 -> {
          scaled = value / 1e9
          suffix = "B"
        }
        abs(value) >= 1e6 -> {
          scaled = value / 1e6
          suffix = "M"
        }
        abs(value) >= 1e3 -> {
          scaled = value / 1e3
          suffix = "K"
        }
      }
    }
    return format.currencySymbol + format.number.format(scaled) + suffix
  }

  private fun roundToSignificant(value: Double, digits: Int): Double {
    val magnitude = abs(value)
    if (magnitude == 0.0 || !magnitude.isFinite()) return value
    var exponent = floor(log10(magnitude))
    val multiplier = 10.0.pow(digits - 1)
    var normalized = magnitude / 10.0.pow(exponent)
    normalized = round(normalized * multiplier) / multiplier
    if (normalized >= 10.0) {
      normalized = 1.0
      exponent += 1.0
    }
    val rounded = normalized * 10.0.pow(exponent)
    return if (value < 0.0) -rounded else rounded
  }

  private fun cryptoZeroCount(value: Double, format: PreparedValueFormat): String? {
    val magnitude = abs(value)
    if (magnitude == 0.0 || !magnitude.isFinite()) return null
    val exponent = floor(log10(magnitude)).toInt()
    val zeroCount = -exponent - 1
    if (zeroCount < MIN_CRYPTO_ZERO_COUNT) return null

    val multiplier = 10.0.pow(format.significantDigits - 1)
    val normalized = magnitude / 10.0.pow(exponent)
    val significant =
        round(normalized * multiplier).toLong().toString().trimEnd('0').ifEmpty { "0" }
    val sign = if (value < 0.0) "-" else ""
    return "${sign}0${format.decimalSeparator}0${subscript(zeroCount)}$significant"
  }

  private fun subscript(value: Int): String = buildString {
    value.toString().forEach { digit -> append(SUBSCRIPT_DIGITS[digit - '0']) }
  }

  private fun timeFormatIndex(frame: ChartSnapshot): Int {
    val span = frame.visibleXMax - frame.visibleXMin
    return when {
      span <= 5 * 60 * 1000.0 || (frame.config.showSeconds && span <= 2 * 60 * 60 * 1000.0) -> 0
      span <= 2 * 24 * 60 * 60 * 1000.0 -> 1
      span <= 180 * 24 * 60 * 60 * 1000.0 -> 2
      span <= 2 * 365 * 24 * 60 * 60 * 1000.0 -> 3
      else -> 4
    }
  }

  private fun formatPercent(value: Double, valid: Boolean) =
      if (valid) "${percentFormat.format(value)}%" else "—"

  private fun formatVolume(value: Double): String {
    val (scaled, suffix) =
        when {
          abs(value) >= 1e12 -> value / 1e12 to "T"
          abs(value) >= 1e9 -> value / 1e9 to "B"
          abs(value) >= 1e6 -> value / 1e6 to "M"
          abs(value) >= 1e3 -> value / 1e3 to "K"
          else -> value to ""
        }
    return volumeFormat.format(scaled) + suffix
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val frame = snapshot ?: return
    val config = frame.config
    prepare(config)
    extremumLinePaint.color = config.extremaConnectorColor
    extremumBackgroundPaint.color = config.extremaBackgroundColor

    if (config.showXAxis) {
      var lastRight = -Float.MAX_VALUE
      val formatter = axisDateFormats[timeFormatIndex(frame)]
      frame.xTicks.forEach { tick ->
        val label = formatter.format(Date(tick.value.toLong()))
        val width = xAxisPaint.measureText(label)
        val x = max(2f, min(frame.width - width - 2f, tick.position - width / 2f))
        if (x >= lastRight + 8f * density) {
          canvas.drawText(label, x, frame.plotBottom + 16f * density, xAxisPaint)
          lastRight = x + width
        }
      }
    }

    if (config.showYAxis) {
      frame.yTicks.forEach { tick ->
        val label = formatValue(tick.value, yAxisValueFormat)
        val width = yAxisPaint.measureText(label)
        val x =
            if (config.yAxisOnRight) frame.plotRight + 6f * density
            else max(2f, frame.plotLeft - width - 6f * density)
        canvas.drawText(label, x, centeredBaseline(tick.position, yAxisPaint), yAxisPaint)
      }
    }

    if (frame.currentPriceVisible && config.showCurrentPriceLabel) {
      drawBadge(
          canvas,
          formatValue(frame.currentPrice, currentPriceValueFormat),
          frame.currentPriceY,
          colorFromFloats(frame.currentPriceLabelColor),
          currentPriceBadge = true,
      )
    }
    drawExtremum(canvas, frame.visibleMaximum, frame, maximumLabelCache)
    drawExtremum(canvas, frame.visibleMinimum, frame, minimumLabelCache)

    if (frame.crosshairVisible) {
      drawBadge(
          canvas,
          formatValue(frame.crosshairPrice, crosshairPriceValueFormat),
          frame.crosshairY,
          config.crosshairPriceBackgroundColor,
          currentPriceBadge = false,
      )
      drawTimeBadge(
          canvas,
          crosshairTimeDateFormat.format(Date(frame.selectedCandle[0].toLong())),
          frame,
      )
      if (config.showTooltip) drawTooltip(canvas, frame)
    }
  }

  private fun centeredBaseline(y: Float, paint: Paint) = y - (paint.ascent() + paint.descent()) / 2f

  private fun drawBadge(
      canvas: Canvas,
      text: String,
      y: Float,
      backgroundColor: Int,
      currentPriceBadge: Boolean,
  ) {
    val frame = requireNotNull(snapshot)
    val config = frame.config
    val textPaint = if (currentPriceBadge) currentPriceTextPaint else crosshairPriceTextPaint
    val border = if (currentPriceBadge) config.currentPriceBorder else config.crosshairPriceBorder
    val textWidth = textPaint.measureText(text)
    val height = max(20f * density, textPaint.descent() - textPaint.ascent() + 6f * density)
    val halfHeight = height / 2f
    val badgeY = y.coerceIn(halfHeight, max(halfHeight, frame.height - halfHeight))
    val width = min(config.yAxisWidth, textWidth + 12f * density)
    val x = if (config.yAxisOnRight) frame.plotRight else max(0f, frame.plotLeft - width)
    val rect = RectF(x, badgeY - halfHeight, x + width, badgeY + halfHeight)
    drawBackground(canvas, rect, backgroundColor, border)
    canvas.drawText(
        text,
        rect.left + 6f * density,
        centeredBaseline(rect.centerY(), textPaint),
        textPaint,
    )
  }

  private fun drawTimeBadge(canvas: Canvas, text: String, frame: ChartSnapshot) {
    val height =
        max(
            20f * density,
            crosshairTimeTextPaint.descent() - crosshairTimeTextPaint.ascent() + 6f * density,
        )
    val width = crosshairTimeTextPaint.measureText(text) + 12f * density
    val left = max(frame.plotLeft, min(frame.plotRight - width, frame.crosshairX - width / 2f))
    val rect = RectF(left, frame.plotBottom, left + width, frame.plotBottom + height)
    drawBackground(
        canvas,
        rect,
        frame.config.crosshairTimeBackgroundColor,
        frame.config.crosshairTimeBorder,
    )
    canvas.drawText(
        text,
        rect.left + 6f * density,
        centeredBaseline(rect.centerY(), crosshairTimeTextPaint),
        crosshairTimeTextPaint,
    )
  }

  private fun drawBackground(
      canvas: Canvas,
      rect: RectF,
      color: Int,
      border: BorderStyleConfig,
  ) {
    fillPaint.color = color
    canvas.drawRoundRect(rect, border.radiusPx, border.radiusPx, fillPaint)
    if (border.widthPx > 0f) {
      borderPaint.color = border.color
      borderPaint.strokeWidth = border.widthPx
      val inset = border.widthPx / 2f
      val borderRect = RectF(rect).apply { inset(inset, inset) }
      canvas.drawRoundRect(
          borderRect,
          max(0f, border.radiusPx - inset),
          max(0f, border.radiusPx - inset),
          borderPaint,
      )
    }
  }

  private fun drawExtremum(
      canvas: Canvas,
      extremum: PriceExtremumSnapshot,
      frame: ChartSnapshot,
      cache: ExtremumLabelCache,
  ) {
    if (!extremum.visible) return
    val valueBits = extremum.value.toBits()
    if (!cache.hasValue || cache.config !== frame.config || cache.valueBits != valueBits) {
      cache.hasValue = true
      cache.config = frame.config
      cache.valueBits = valueBits
      cache.text = formatValue(extremum.value, extremaValueFormat)
      cache.width = extremaTextPaint.measureText(cache.text)
    }
    val direction = if (extremum.labelOnRight) 1f else -1f
    val lineEndX =
        (extremum.x + direction * 20f * density).coerceIn(frame.plotLeft, frame.plotRight)
    canvas.drawLine(extremum.x, extremum.y, lineEndX, extremum.y, extremumLinePaint)
    val unclampedX =
        if (extremum.labelOnRight) lineEndX + 4f * density
        else lineEndX - 4f * density - cache.width
    val x = unclampedX.coerceIn(frame.plotLeft, max(frame.plotLeft, frame.plotRight - cache.width))
    val baseline =
        centeredBaseline(extremum.y, extremaTextPaint)
            .coerceIn(
                frame.plotTop - extremaTextPaint.ascent(),
                max(
                    frame.plotTop - extremaTextPaint.ascent(),
                    frame.plotBottom - extremaTextPaint.descent(),
                ),
            )
    canvas.drawRoundRect(
        x - 2f * density,
        baseline + extremaTextPaint.ascent() - density,
        x + cache.width + 2f * density,
        baseline + extremaTextPaint.descent() + density,
        2f * density,
        2f * density,
        extremumBackgroundPaint,
    )
    canvas.drawText(cache.text, x, baseline, extremaTextPaint)
  }

  private fun drawTooltip(canvas: Canvas, frame: ChartSnapshot) {
    val layout = prepareTooltipLayout(frame)
    val config = frame.config
    val left =
        if (frame.crosshairX > frame.width / 2f) frame.plotLeft + 8f * density
        else frame.plotRight - layout.width - 8f * density
    val rect =
        RectF(
            left,
            frame.plotTop + 8f * density,
            left + layout.width,
            frame.plotTop + 8f * density + layout.height,
        )
    val background = config.tooltipBackgroundColor
    val alpha = (Color.alpha(background) * config.tooltipBackgroundOpacity).roundToInt()
    drawBackground(
        canvas,
        rect,
        Color.argb(alpha, Color.red(background), Color.green(background), Color.blue(background)),
        config.tooltipBorder,
    )
    var baseline = rect.top + 9f * density - tooltipHeaderPaint.ascent()
    canvas.drawText(layout.header, rect.left + 10f * density, baseline, tooltipHeaderPaint)
    baseline += layout.headerHeight
    layout.rows.forEach { row ->
      canvas.drawText(row.label, rect.left + 10f * density, baseline, tooltipLabelPaint)
      tooltipValuePaint.color = row.valueColor
      canvas.drawText(row.value, rect.left + layout.valueXOffset, baseline, tooltipValuePaint)
      baseline += layout.rowHeight
    }
  }

  private fun prepareTooltipLayout(frame: ChartSnapshot): TooltipLayout {
    val c = frame.selectedCandle
    val cached = tooltipLayout
    if (cached != null && tooltipLayoutIsCurrent(frame, c)) return cached

    val config = frame.config
    val rows = buildTooltipRows(frame, c, config)
    val layout = createTooltipLayout(c, rows)
    cacheTooltipLayout(frame, c, config, layout)
    return layout
  }

  private fun tooltipLayoutIsCurrent(frame: ChartSnapshot, candle: DoubleArray): Boolean {
    if (tooltipConfig !== frame.config || tooltipCandle?.contentEquals(candle) != true) return false
    if (
        tooltipChangeBits != frame.selectedChange.toBits() ||
            tooltipChangePercentBits != frame.selectedChangePercent.toBits()
    ) {
      return false
    }
    return tooltipAmplitudePercentBits == frame.selectedAmplitudePercent.toBits() &&
        tooltipPercentagesValid == frame.selectedPercentagesValid
  }

  private fun buildTooltipRows(
      frame: ChartSnapshot,
      candle: DoubleArray,
      config: ChartConfig,
  ): List<TooltipRow> {
    val labels = config.tooltipLabels
    val changeColor =
        when {
          frame.selectedChange > 0 -> config.tooltipPositiveValueColor
          frame.selectedChange < 0 -> config.tooltipNegativeValueColor
          else -> config.tooltipValueTextStyle.color
        }
    val rows =
        listOf(
            TooltipRow(
                labels.open,
                formatValue(candle[1], tooltipValueFormat),
                config.tooltipValueTextStyle.color,
            ),
            TooltipRow(
                labels.close,
                formatValue(candle[4], tooltipValueFormat),
                config.tooltipValueTextStyle.color,
            ),
            TooltipRow(
                labels.high,
                formatValue(candle[2], tooltipValueFormat),
                config.tooltipValueTextStyle.color,
            ),
            TooltipRow(
                labels.low,
                formatValue(candle[3], tooltipValueFormat),
                config.tooltipValueTextStyle.color,
            ),
            TooltipRow(
                labels.amplitude,
                formatPercent(frame.selectedAmplitudePercent, frame.selectedPercentagesValid),
                config.tooltipValueTextStyle.color,
            ),
            TooltipRow(
                labels.changePercent,
                formatPercent(frame.selectedChangePercent, frame.selectedPercentagesValid),
                changeColor,
            ),
            TooltipRow(
                labels.change,
                formatValue(frame.selectedChange, tooltipValueFormat),
                changeColor,
            ),
            TooltipRow(
                labels.volume,
                formatVolume(candle[5]),
                config.tooltipValueTextStyle.color,
            ),
        )
    return rows
  }

  private fun createTooltipLayout(candle: DoubleArray, rows: List<TooltipRow>): TooltipLayout {
    val header = tooltipHeaderDateFormat.format(Date(candle[0].toLong()))
    val labelWidth = rows.maxOf { tooltipLabelPaint.measureText(it.label) }
    val valueWidth = rows.maxOf { tooltipValuePaint.measureText(it.value) }
    val valueXOffset = 10f * density + labelWidth + 12f * density
    val contentWidth =
        max(tooltipHeaderPaint.measureText(header), labelWidth + 12f * density + valueWidth)
    val headerHeight =
        max(17f * density, tooltipHeaderPaint.descent() - tooltipHeaderPaint.ascent())
    val rowHeight =
        max(
            17f * density,
            max(
                tooltipLabelPaint.descent() - tooltipLabelPaint.ascent(),
                tooltipValuePaint.descent() - tooltipValuePaint.ascent(),
            ),
        )
    return TooltipLayout(
        header,
        rows,
        contentWidth + 20f * density,
        18f * density + headerHeight + rows.size * rowHeight,
        valueXOffset,
        headerHeight,
        rowHeight,
    )
  }

  private fun cacheTooltipLayout(
      frame: ChartSnapshot,
      candle: DoubleArray,
      config: ChartConfig,
      layout: TooltipLayout,
  ) {
    tooltipLayout = layout
    tooltipCandle = candle.copyOf()
    tooltipConfig = config
    tooltipChangeBits = frame.selectedChange.toBits()
    tooltipChangePercentBits = frame.selectedChangePercent.toBits()
    tooltipAmplitudePercentBits = frame.selectedAmplitudePercent.toBits()
    tooltipPercentagesValid = frame.selectedPercentagesValid
  }

  private fun colorFromFloats(value: FloatArray) =
      Color.argb(
          (value[3] * 255).toInt(),
          (value[0] * 255).toInt(),
          (value[1] * 255).toInt(),
          (value[2] * 255).toInt(),
      )

  companion object {
    private const val TAG = "TradingCharts"
    private const val MIN_CRYPTO_ZERO_COUNT = 1
    private const val SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉"
  }
}
