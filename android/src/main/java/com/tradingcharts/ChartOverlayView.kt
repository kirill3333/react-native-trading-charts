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
import java.util.LinkedHashMap
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

@Suppress("LargeClass", "TooManyFunctions")
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

  private data class IndicatorLegendKey(
      val paneIndex: Int,
      val kind: Int,
      val period: Int,
      val fastPeriod: Int,
      val slowPeriod: Int,
      val signalPeriod: Int,
      val valueSource: Int,
      val value0Bits: Long,
      val hasValue0: Boolean,
      val value1Bits: Long,
      val hasValue1: Boolean,
      val value2Bits: Long,
      val hasValue2: Boolean,
  )

  private data class IndicatorLegendLabel(
      val title: String,
      val values: List<String>,
      val titleWidth: Float,
      val valueWidths: List<Float>,
  )

  private data class TooltipLayout(
      val header: String,
      val showHeader: Boolean,
      val rows: List<TooltipRow>,
      val width: Float,
      val height: Float,
      val valueXOffset: Float,
      val headerHeight: Float,
      val rowHeight: Float,
  )

  var snapshot: ChartSnapshot? = null
    set(value) {
      // Re-applying an identical revision carries no visual change; keep the
      // previous frame instead of invalidating and redrawing all text.
      if (value != null && field?.revision == value.revision) {
        field = value
        return
      }
      field = value
      invalidate()
    }

  /** Cached axis label and its measured width, keyed by value bits. */
  private data class AxisLabel(
      val text: String,
      val width: Float,
  )

  /** Everything drawBadge needs to place one badge without re-measuring. */
  private data class BadgeContent(
      val label: AxisLabel,
      val y: Float,
      val backgroundColor: Int,
  )

  private data class PriceLineContent(
      val label: AxisLabel,
      val price: AxisLabel,
      val priceBits: Long,
      val color: Int,
  ) {
    fun matches(line: PriceLineSnapshot): Boolean =
        label.text == line.label && priceBits == line.price.toBits() && color == line.color
  }

  /** Access-ordered cache that evicts the least recently used label. */
  private class BoundedCache<K, V>(private val maximumSize: Int) :
      LinkedHashMap<K, V>(maximumSize + 1, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<K, V>?) = size > maximumSize
  }

  private val density = resources.displayMetrics.density
  private val scaledDensity = resources.displayMetrics.scaledDensity
  private val xAxisPaint = textPaint(10.5f, false)
  private val yAxisPaint = textPaint(10.5f, false)
  private val extremaTextPaint = textPaint(10.5f, false)
  private val currentPriceTextPaint = textPaint(10.5f, true)
  private val crosshairPriceTextPaint = textPaint(10.5f, true)
  private val crosshairTimeTextPaint = textPaint(10.5f, true)
  private val priceLineLabelPaint = textPaint(10.5f, false)
  private val priceLinePricePaint = textPaint(10.5f, true)
  private val tooltipHeaderPaint = textPaint(11f, false)
  private val tooltipLabelPaint = textPaint(11f, false)
  private val tooltipValuePaint = textPaint(11f, false)
  private val rsiTitlePaint = textPaint(10.5f, false)
  private val rsiValuePaint = textPaint(10.5f, false)
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
  private var paneValueFormats: Map<String, PreparedValueFormat> = emptyMap()
  private var paneVolumeFormats: Map<String, NumberFormat> = emptyMap()
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
  // Axis/badge label caches are bounded for long-running pan/zoom sessions and
  // invalidated in prepare() on any config change.
  private val xLabelCache = BoundedCache<Long, AxisLabel>(MAX_X_LABEL_CACHE_SIZE)
  private val yLabelCache = HashMap<String, BoundedCache<Long, AxisLabel>>()
  private val indicatorLegendCache = BoundedCache<IndicatorLegendKey, IndicatorLegendLabel>(64)
  private val priceLineCache = BoundedCache<String, PriceLineContent>(256)
  private var timeBadgeLabel: AxisLabel? = null
  private var timeBadgeBits = 0L
  private var currentPriceLabel: AxisLabel? = null
  private var currentPriceBits = 0L
  private val scratchDate = Date(0L)
  private val scratchRect = RectF()
  private val scratchBorderRect = RectF()

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
    applyTextStyle(priceLineLabelPaint, config.yAxisTextStyle, 10.5f, false)
    applyTextStyle(priceLinePricePaint, config.currentPriceTextStyle, 10.5f, true)
    applyTextStyle(tooltipHeaderPaint, config.tooltipHeaderTextStyle, 11f, false)
    applyTextStyle(tooltipLabelPaint, config.tooltipLabelTextStyle, 11f, false)
    applyTextStyle(tooltipValuePaint, config.tooltipValueTextStyle, 11f, false)
    applyTextStyle(rsiTitlePaint, config.yAxisTextStyle, 10.5f, false)
    applyTextStyle(rsiValuePaint, config.yAxisTextStyle, 10.5f, false)

    yAxisValueFormat = prepareValueFormat(config.valueFormat)
    extremaValueFormat = prepareValueFormat(config.extremaValueFormat)
    currentPriceValueFormat = prepareValueFormat(config.currentPriceValueFormat)
    crosshairPriceValueFormat = prepareValueFormat(config.crosshairPriceValueFormat)
    tooltipValueFormat = prepareValueFormat(config.tooltipValueFormat)
    paneValueFormats =
        config.panes.associate { it.priceScaleId to prepareValueFormat(it.valueFormat) }
    paneVolumeFormats =
        config.panes
            .filter { it.volumeFormat }
            .associate { pane ->
              pane.priceScaleId to
                  NumberFormat.getNumberInstance(Locale.forLanguageTag(pane.valueFormat.locale))
                      .apply {
                        isGroupingUsed = pane.valueFormat.useGrouping
                        minimumFractionDigits = 0
                        maximumFractionDigits = pane.valueFormat.precision
                      }
            }
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
    xLabelCache.clear()
    yLabelCache.clear()
    indicatorLegendCache.clear()
    priceLineCache.clear()
    timeBadgeLabel = null
    currentPriceLabel = null
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

  private fun formatVolume(value: Double, formatter: NumberFormat = volumeFormat): String {
    val (scaled, suffix) =
        when {
          abs(value) >= 1e12 -> value / 1e12 to "T"
          abs(value) >= 1e9 -> value / 1e9 to "B"
          abs(value) >= 1e6 -> value / 1e6 to "M"
          abs(value) >= 1e3 -> value / 1e3 to "K"
          else -> value to ""
        }
    return formatter.format(scaled) + suffix
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val frame = snapshot ?: return
    val config = frame.config
    prepare(config)
    extremumLinePaint.color = config.extremaConnectorColor
    extremumBackgroundPaint.color = config.extremaBackgroundColor

    if (config.showXAxis) drawXAxis(canvas, frame)
    if (config.showYAxis) drawYAxes(canvas, frame)
    drawIndicatorLegends(canvas, frame)
    drawPriceLines(canvas, frame)

    if (frame.currentPriceVisible && config.showCurrentPriceLabel) {
      drawBadge(
          canvas,
          frame,
          BadgeContent(
              currentPriceLabel(frame),
              frame.currentPriceY,
              colorFromFloats(frame.currentPriceLabelColor),
          ),
          currentPriceBadge = true,
      )
    }
    drawExtremum(canvas, frame.visibleMaximum, frame, maximumLabelCache)
    drawExtremum(canvas, frame.visibleMinimum, frame, minimumLabelCache)

    if (frame.crosshairVisible) {
      drawCrosshairBadges(canvas, frame)
      if (config.showTooltip && (config.showTooltipHeader || config.tooltipFields.isNotEmpty())) {
        drawTooltip(canvas, frame)
      }
    }
  }

  private fun drawPriceLines(canvas: Canvas, frame: ChartSnapshot) {
    if (frame.priceLines.isEmpty()) return
    val formatter =
        frame.panes.firstOrNull()?.priceScaleId?.let(paneValueFormats::get) ?: yAxisValueFormat
    frame.priceLines.forEach { line ->
      val content = priceLineContent(line, formatter)
      priceLineLabelPaint.color = line.color
      priceLinePricePaint.color = contrastingTextColor(line.color)

      val labelWidth = content.label.width + 8f * density
      val labelHeight =
          max(
              18f * density,
              priceLineLabelPaint.descent() - priceLineLabelPaint.ascent() + 4f * density,
          )
      val labelLeft = max(frame.plotLeft, frame.plotRight - labelWidth - 8f * density)
      val labelTop =
          (line.y - labelHeight / 2f).coerceIn(
              frame.plotTop,
              max(frame.plotTop, frame.plotBottom - labelHeight),
          )
      scratchRect.set(labelLeft, labelTop, labelLeft + labelWidth, labelTop + labelHeight)
      fillPaint.color = frame.config.backgroundColor
      canvas.drawRect(scratchRect, fillPaint)
      canvas.drawText(
          content.label.text,
          scratchRect.left + 4f * density,
          centeredBaseline(scratchRect.centerY(), priceLineLabelPaint),
          priceLineLabelPaint,
      )

      val badgeHeight =
          max(
              20f * density,
              priceLinePricePaint.descent() - priceLinePricePaint.ascent() + 6f * density,
          )
      val badgeWidth = min(frame.config.yAxisWidth, content.price.width + 12f * density)
      val badgeY =
          line.y.coerceIn(
              badgeHeight / 2f,
              max(badgeHeight / 2f, frame.height - badgeHeight / 2f),
          )
      val badgeLeft = frame.plotRight
      scratchRect.set(
          badgeLeft,
          badgeY - badgeHeight / 2f,
          badgeLeft + badgeWidth,
          badgeY + badgeHeight / 2f,
      )
      fillPaint.color = line.color
      canvas.drawRoundRect(
          scratchRect,
          frame.config.priceLineBorder.radiusPx,
          frame.config.priceLineBorder.radiusPx,
          fillPaint,
      )
      canvas.drawText(
          content.price.text,
          scratchRect.centerX() - content.price.width / 2f,
          centeredBaseline(scratchRect.centerY(), priceLinePricePaint),
          priceLinePricePaint,
      )
    }
  }

  private fun priceLineContent(
      line: PriceLineSnapshot,
      formatter: PreparedValueFormat,
  ): PriceLineContent {
    val cached = priceLineCache[line.id]
    if (cached != null && cached.matches(line)) return cached
    val price = formatValue(line.price, formatter)
    return PriceLineContent(
            AxisLabel(line.label, priceLineLabelPaint.measureText(line.label)),
            AxisLabel(price, priceLinePricePaint.measureText(price)),
            line.price.toBits(),
            line.color,
        )
        .also { priceLineCache[line.id] = it }
  }

  private fun contrastingTextColor(color: Int): Int {
    val luminance =
        (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0
    return if (luminance > 0.6) Color.BLACK else Color.WHITE
  }

  private fun currentPriceLabel(frame: ChartSnapshot): AxisLabel {
    val bits = frame.currentPrice.toBits()
    val cached = currentPriceLabel
    if (cached != null && currentPriceBits == bits) return cached
    val text = formatValue(frame.currentPrice, currentPriceValueFormat)
    return AxisLabel(text, currentPriceTextPaint.measureText(text)).also {
      currentPriceLabel = it
      currentPriceBits = bits
    }
  }

  private fun drawCrosshairBadges(canvas: Canvas, frame: ChartSnapshot) {
    val activePane = frame.panes.getOrNull(frame.activePaneIndex) ?: frame.panes.firstOrNull()
    val priceText =
        if (activePane?.volumeFormat == true) {
          formatVolume(
              frame.crosshairPrice,
              paneVolumeFormats[activePane.priceScaleId] ?: volumeFormat,
          )
        } else {
          formatValue(
              frame.crosshairPrice,
              activePane?.let { paneValueFormats[it.priceScaleId] } ?: crosshairPriceValueFormat,
          )
        }
    drawBadge(
        canvas,
        frame,
        BadgeContent(
            AxisLabel(priceText, crosshairPriceTextPaint.measureText(priceText)),
            frame.crosshairY,
            frame.config.crosshairPriceBackgroundColor,
        ),
        currentPriceBadge = false,
    )
    drawTimeBadge(canvas, frame)
  }

  private fun drawXAxis(canvas: Canvas, frame: ChartSnapshot) {
    val xAxisTop = frame.panes.lastOrNull()?.plotBottom ?: frame.plotBottom
    var lastRight = -Float.MAX_VALUE
    val formatIndex = timeFormatIndex(frame)
    val formatter = axisDateFormats[formatIndex]
    frame.xTicks.forEach { tick ->
      val key = 31L * tick.value.toBits() + formatIndex
      val label =
          xLabelCache.getOrPut(key) {
            val text = formatter.format(scratchDate.apply { time = tick.value.toLong() })
            AxisLabel(text, xAxisPaint.measureText(text))
          }
      val x = max(2f, min(frame.width - label.width - 2f, tick.position - label.width / 2f))
      if (x >= lastRight + 8f * density) {
        canvas.drawText(label.text, x, xAxisTop + 16f * density, xAxisPaint)
        lastRight = x + label.width
      }
    }
  }

  private fun drawYAxes(canvas: Canvas, frame: ChartSnapshot) {
    frame.panes.forEach { pane ->
      if (!pane.scaleVisible) return@forEach
      val valueFormatter = paneValueFormats[pane.priceScaleId] ?: yAxisValueFormat
      val volumeFormatter = paneVolumeFormats[pane.priceScaleId]
      val paneCache =
          yLabelCache.getOrPut(pane.priceScaleId) {
            BoundedCache(MAX_Y_LABEL_CACHE_SIZE)
          }
      pane.yTicks.forEach { tick ->
        val label =
            paneCache.getOrPut(tick.value.toBits()) {
              val text =
                  if (pane.volumeFormat) {
                    formatVolume(tick.value, volumeFormatter ?: volumeFormat)
                  } else {
                    formatValue(tick.value, valueFormatter)
                  }
              AxisLabel(text, yAxisPaint.measureText(text))
            }
        val x = pane.plotRight + 6f * density
        canvas.drawText(label.text, x, centeredBaseline(tick.position, yAxisPaint), yAxisPaint)
      }
    }
  }

  private fun drawIndicatorLegends(canvas: Canvas, frame: ChartSnapshot) {
    frame.indicatorLegends.forEachIndexed { index, legend ->
      val pane = frame.panes.getOrNull(legend.paneIndex) ?: return@forEachIndexed
      var row = 0
      for (previous in 0 until index) {
        if (frame.indicatorLegends[previous].paneIndex == legend.paneIndex) row += 1
      }
      val value0 = legend.values.getOrNull(0)
      val value1 = legend.values.getOrNull(1)
      val value2 = legend.values.getOrNull(2)
      val key =
          IndicatorLegendKey(
              legend.paneIndex,
              legend.kind,
              legend.period,
              legend.fastPeriod,
              legend.slowPeriod,
              legend.signalPeriod,
              legend.valueSource,
              value0?.value?.toBits() ?: 0L,
              value0?.hasValue == true,
              value1?.value?.toBits() ?: 0L,
              value1?.hasValue == true,
              value2?.value?.toBits() ?: 0L,
              value2?.hasValue == true,
          )
      val label =
          indicatorLegendCache.getOrPut(key) {
            val title = indicatorLegendTitle(legend)
            val formatter = paneValueFormats[pane.priceScaleId] ?: yAxisValueFormat
            val values =
                legend.values.map { value ->
                  if (value.hasValue) formatValue(value.value, formatter) else "—"
                }
            IndicatorLegendLabel(
                title,
                values,
                rsiTitlePaint.measureText(title),
                values.map(rsiValuePaint::measureText),
            )
          }
      val baseline = pane.plotTop + (16f + row * 15f) * density
      val left = pane.plotLeft + 8f * density
      rsiTitlePaint.color =
          if (legend.textColorSet) legend.textColor else frame.config.yAxisTextStyle.color
      canvas.drawText(label.title, left, baseline, rsiTitlePaint)
      var valueLeft = left + label.titleWidth + 6f * density
      legend.values.forEachIndexed { valueIndex, value ->
        rsiValuePaint.color = value.color
        canvas.drawText(label.values[valueIndex], valueLeft, baseline, rsiValuePaint)
        valueLeft += label.valueWidths[valueIndex] + 6f * density
      }
    }
  }

  private fun indicatorLegendTitle(legend: IndicatorLegendSnapshot): String {
    if (legend.kind == INDICATOR_KIND_RSI) return "RSI ${legend.period}"
    val source =
        when (legend.valueSource) {
          0 -> "OPEN"
          1 -> "HIGH"
          2 -> "LOW"
          else -> "CLOSE"
        }
    return "MACD ${legend.fastPeriod} ${legend.slowPeriod} $source ${legend.signalPeriod}"
  }

  private fun centeredBaseline(y: Float, paint: Paint) = y - (paint.ascent() + paint.descent()) / 2f

  private fun drawBadge(
      canvas: Canvas,
      frame: ChartSnapshot,
      badge: BadgeContent,
      currentPriceBadge: Boolean,
  ) {
    val config = frame.config
    val textPaint = if (currentPriceBadge) currentPriceTextPaint else crosshairPriceTextPaint
    val border = if (currentPriceBadge) config.currentPriceBorder else config.crosshairPriceBorder
    val height = max(20f * density, textPaint.descent() - textPaint.ascent() + 6f * density)
    val halfHeight = height / 2f
    val badgeY = badge.y.coerceIn(halfHeight, max(halfHeight, frame.height - halfHeight))
    val width = min(config.yAxisWidth, badge.label.width + 12f * density)
    val x = frame.plotRight
    val rect = scratchRect
    rect.set(x, badgeY - halfHeight, x + width, badgeY + halfHeight)
    drawBackground(canvas, rect, badge.backgroundColor, border)
    canvas.drawText(
        badge.label.text,
        rect.left + 6f * density,
        centeredBaseline(rect.centerY(), textPaint),
        textPaint,
    )
  }

  private fun drawTimeBadge(canvas: Canvas, frame: ChartSnapshot) {
    val bits = frame.selectedCandle[0].toBits()
    val cached = timeBadgeLabel
    val label =
        if (cached != null && timeBadgeBits == bits) {
          cached
        } else {
          val text =
              crosshairTimeDateFormat.format(
                  scratchDate.apply { time = frame.selectedCandle[0].toLong() }
              )
          AxisLabel(text, crosshairTimeTextPaint.measureText(text)).also {
            timeBadgeLabel = it
            timeBadgeBits = bits
          }
        }
    val height =
        max(
            20f * density,
            crosshairTimeTextPaint.descent() - crosshairTimeTextPaint.ascent() + 6f * density,
        )
    val width = label.width + 12f * density
    val left = max(frame.plotLeft, min(frame.plotRight - width, frame.crosshairX - width / 2f))
    val xAxisTop = frame.panes.lastOrNull()?.plotBottom ?: frame.plotBottom
    val rect = scratchRect
    rect.set(left, xAxisTop, left + width, xAxisTop + height)
    drawBackground(
        canvas,
        rect,
        frame.config.crosshairTimeBackgroundColor,
        frame.config.crosshairTimeBorder,
    )
    canvas.drawText(
        label.text,
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
      val borderRect = scratchBorderRect
      borderRect.set(rect)
      borderRect.inset(inset, inset)
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
    val plotMidX = (frame.plotLeft + frame.plotRight) / 2f
    val left =
        if (frame.crosshairX > plotMidX) frame.plotLeft + 8f * density
        else frame.plotRight - layout.width - 8f * density
    val rect = scratchRect
    rect.set(
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
    var baseline: Float
    if (layout.showHeader) {
      baseline = rect.top + 9f * density - tooltipHeaderPaint.ascent()
      canvas.drawText(layout.header, rect.left + 10f * density, baseline, tooltipHeaderPaint)
      baseline += layout.headerHeight
    } else {
      baseline = rect.top + 9f * density - tooltipLabelPaint.ascent()
    }
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
    val layout = createTooltipLayout(c, rows, config)
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
    return config.tooltipFields.map { field ->
      when (field) {
        "open" ->
            TooltipRow(
                labels.open,
                formatValue(candle[1], tooltipValueFormat),
                config.tooltipValueTextStyle.color,
            )
        "close" ->
            TooltipRow(
                labels.close,
                formatValue(candle[4], tooltipValueFormat),
                config.tooltipValueTextStyle.color,
            )
        "high" ->
            TooltipRow(
                labels.high,
                formatValue(candle[2], tooltipValueFormat),
                config.tooltipValueTextStyle.color,
            )
        "low" ->
            TooltipRow(
                labels.low,
                formatValue(candle[3], tooltipValueFormat),
                config.tooltipValueTextStyle.color,
            )
        "amplitude" ->
            TooltipRow(
                labels.amplitude,
                formatPercent(frame.selectedAmplitudePercent, frame.selectedPercentagesValid),
                config.tooltipValueTextStyle.color,
            )
        "changePercent" ->
            TooltipRow(
                labels.changePercent,
                formatPercent(frame.selectedChangePercent, frame.selectedPercentagesValid),
                changeColor,
            )
        "change" ->
            TooltipRow(
                labels.change,
                formatValue(frame.selectedChange, tooltipValueFormat),
                changeColor,
            )
        "volume" ->
            TooltipRow(
                labels.volume,
                formatVolume(candle[5]),
                config.tooltipValueTextStyle.color,
            )
        else -> error("Unsupported tooltip field: $field")
      }
    }
  }

  private fun createTooltipLayout(
      candle: DoubleArray,
      rows: List<TooltipRow>,
      config: ChartConfig,
  ): TooltipLayout {
    val showHeader = config.showTooltipHeader
    val header = if (showHeader) tooltipHeaderDateFormat.format(Date(candle[0].toLong())) else ""
    val labelWidth = rows.maxOfOrNull { tooltipLabelPaint.measureText(it.label) } ?: 0f
    val valueWidth = rows.maxOfOrNull { tooltipValuePaint.measureText(it.value) } ?: 0f
    val valueXOffset = 10f * density + labelWidth + 12f * density
    val rowsWidth = if (rows.isEmpty()) 0f else labelWidth + 12f * density + valueWidth
    val contentWidth =
        max(if (showHeader) tooltipHeaderPaint.measureText(header) else 0f, rowsWidth)
    val headerHeight =
        if (showHeader) {
          max(17f * density, tooltipHeaderPaint.descent() - tooltipHeaderPaint.ascent())
        } else {
          0f
        }
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
        showHeader,
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
    private const val INDICATOR_KIND_RSI = 0
    private const val MIN_CRYPTO_ZERO_COUNT = 1
    private const val MAX_X_LABEL_CACHE_SIZE = 1024
    private const val MAX_Y_LABEL_CACHE_SIZE = 256
    private const val SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉"
  }
}
