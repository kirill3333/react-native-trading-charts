package com.tradingcharts

import android.graphics.Color
import org.json.JSONObject

internal data class ValueFormat(
  val compact: Boolean = false,
  val precision: Int = 2,
  val minMove: Double = 0.01,
  val locale: String = "en-GB",
  val currencySymbol: String = "",
  val useGrouping: Boolean = true,
)

internal data class TextStyleConfig(
  val color: Int,
  val fontFamily: String? = null,
  val fontSizePx: Float? = null,
  val fontWeight: String? = null,
)

internal data class BorderStyleConfig(
  val color: Int = Color.TRANSPARENT,
  val widthPx: Float = 0f,
  val radiusPx: Float,
)

internal data class DatePatternConfig(
  val pattern: String,
  val locale: String,
  val timeZone: String,
)

internal data class XAxisDateFormatConfig(
  val locale: String,
  val timeZone: String,
  val seconds: String,
  val time: String,
  val day: String,
  val month: String,
  val year: String,
)

internal data class CrosshairTooltipLabels(
  val open: String = "Open",
  val close: String = "Close",
  val high: String = "High",
  val low: String = "Low",
  val amplitude: String = "Amplitude",
  val changePercent: String = "Change %",
  val change: String = "Change",
  val volume: String = "Volume",
)

internal data class ChartConfig(
  val timeframeMs: Double = 60_000.0,
  val initialVisibleCount: Int = 100,
  val defaultScale: Double = 1.0,
  val defaultYScale: Double = 1.0,
  val displayScale: Float = 1f,
  val backgroundColor: Int = Color.rgb(16, 12, 24),
  val gridColor: Int = Color.rgb(41, 36, 49),
  val axisTextColor: Int = Color.rgb(151, 145, 165),
  val upColor: Int = Color.rgb(56, 217, 138),
  val downColor: Int = Color.rgb(255, 59, 100),
  val crosshairColor: Int = Color.rgb(168, 162, 179),
  val tooltipBackgroundColor: Int = Color.rgb(27, 23, 35),
  val tooltipTextColor: Int = Color.rgb(245, 242, 250),
  val gridOpacity: Float = 0.75f,
  val currentPriceLineUpColor: Int = Color.rgb(56, 217, 138),
  val currentPriceLineDownColor: Int = Color.rgb(255, 59, 100),
  val currentPriceLabelUpColor: Int = Color.rgb(56, 217, 138),
  val currentPriceLabelDownColor: Int = Color.rgb(255, 59, 100),
  val crosshairOpacity: Float = 0.85f,
  val xAxisTextStyle: TextStyleConfig = TextStyleConfig(Color.rgb(151, 145, 165)),
  val yAxisTextStyle: TextStyleConfig = TextStyleConfig(Color.rgb(151, 145, 165)),
  val extremaTextStyle: TextStyleConfig = TextStyleConfig(Color.rgb(151, 145, 165)),
  val extremaConnectorColor: Int = Color.rgb(151, 145, 165),
  val extremaBackgroundColor: Int = Color.rgb(16, 12, 24),
  val currentPriceTextStyle: TextStyleConfig = TextStyleConfig(Color.BLACK),
  val currentPriceBorder: BorderStyleConfig = BorderStyleConfig(radiusPx = 4f),
  val crosshairPriceBackgroundColor: Int = Color.rgb(168, 162, 179),
  val crosshairPriceTextStyle: TextStyleConfig = TextStyleConfig(Color.BLACK),
  val crosshairPriceBorder: BorderStyleConfig = BorderStyleConfig(radiusPx = 4f),
  val crosshairTimeBackgroundColor: Int = Color.rgb(168, 162, 179),
  val crosshairTimeTextStyle: TextStyleConfig = TextStyleConfig(Color.BLACK),
  val crosshairTimeBorder: BorderStyleConfig = BorderStyleConfig(radiusPx = 4f),
  val tooltipHeaderTextStyle: TextStyleConfig = TextStyleConfig(Color.rgb(245, 242, 250)),
  val tooltipLabelTextStyle: TextStyleConfig = TextStyleConfig(Color.rgb(245, 242, 250)),
  val tooltipValueTextStyle: TextStyleConfig = TextStyleConfig(Color.rgb(245, 242, 250)),
  val tooltipPositiveValueColor: Int = Color.rgb(56, 217, 138),
  val tooltipNegativeValueColor: Int = Color.rgb(255, 59, 100),
  val tooltipBorder: BorderStyleConfig = BorderStyleConfig(radiusPx = 8f),
  val showXAxis: Boolean = true,
  val xAxisHeight: Float = 26f,
  val xLocale: String = "en-GB",
  val xTimeZone: String = "UTC",
  val showSeconds: Boolean = false,
  val logicalSpacing: Boolean = false,
  val showYAxis: Boolean = true,
  val yAxisOnRight: Boolean = true,
  val yAxisWidth: Float = 64f,
  val yScaleMarginTop: Double = 0.2,
  val yScaleMarginBottom: Double = 0.1,
  val valueFormat: ValueFormat = ValueFormat(),
  val extremaValueFormat: ValueFormat = ValueFormat(),
  val currentPriceValueFormat: ValueFormat = ValueFormat(),
  val crosshairPriceValueFormat: ValueFormat = ValueFormat(),
  val tooltipValueFormat: ValueFormat = ValueFormat(),
  val xAxisDateFormats: XAxisDateFormatConfig = XAxisDateFormatConfig(
    "en-GB", "UTC", "HH:mm:ss", "HH:mm", "d MMM", "MMM yyyy", "yyyy",
  ),
  val crosshairTimeDateFormat: DatePatternConfig = DatePatternConfig(
    "d MMM yyyy HH:mm:ss", "en-GB", "UTC",
  ),
  val tooltipHeaderDateFormat: DatePatternConfig = DatePatternConfig(
    "d MMM yyyy HH:mm:ss", "en-GB", "UTC",
  ),
  val allowPan: Boolean = true,
  val allowZoom: Boolean = true,
  val allowYAxisScale: Boolean = true,
  val showCurrentPrice: Boolean = true,
  val showCurrentPriceLabel: Boolean = true,
  val pinCurrentPriceToEdge: Boolean = true,
  val showPriceExtremes: Boolean = true,
  val crosshairEnabled: Boolean = true,
  val showTooltip: Boolean = true,
  val tooltipBackgroundOpacity: Float = 1f,
  val crosshairDashed: Boolean = false,
  val tooltipLabels: CrosshairTooltipLabels = CrosshairTooltipLabels(),
) {
  companion object {
    private fun textStyle(
      json: JSONObject,
      defaultColor: Int,
      scaledDensity: Float,
    ) = TextStyleConfig(
      color = if (json.has("color")) chartColor(json.getString("color")) else defaultColor,
      fontFamily = if (json.has("fontFamily")) json.getString("fontFamily") else null,
      fontSizePx = if (json.has("fontSize")) {
        json.getDouble("fontSize").toFloat() * scaledDensity
      } else null,
      fontWeight = if (json.has("fontWeight")) json.getString("fontWeight") else null,
    )

    private fun border(json: JSONObject, density: Float, defaultRadius: Float) =
      BorderStyleConfig(
        color = chartColor(json.optString("color", "#00000000")),
        widthPx = json.optDouble("width", 0.0).toFloat() * density,
        radiusPx = json.optDouble("radius", defaultRadius.toDouble()).toFloat() * density,
      )

    private fun valueFormat(json: JSONObject) = ValueFormat(
      compact = json.getString("type") == "compact",
      precision = json.getInt("precision"),
      minMove = json.optDouble("minMove", 0.01),
      locale = json.getString("locale"),
      currencySymbol = json.getString("currencySymbol"),
      useGrouping = json.optBoolean("useGrouping", true),
    )

    private fun datePattern(json: JSONObject) = DatePatternConfig(
      pattern = json.getString("pattern"),
      locale = json.getString("locale"),
      timeZone = json.getString("timeZone"),
    )

    private fun chartColor(value: String): Int {
      val raw = value.removePrefix("#").toLong(16)
      return if (value.length == 7) {
        Color.rgb(
          ((raw shr 16) and 0xff).toInt(),
          ((raw shr 8) and 0xff).toInt(),
          (raw and 0xff).toInt(),
        )
      } else {
        Color.argb(
          (raw and 0xff).toInt(),
          ((raw shr 24) and 0xff).toInt(),
          ((raw shr 16) and 0xff).toInt(),
          ((raw shr 8) and 0xff).toInt(),
        )
      }
    }

    fun fromJson(json: String, density: Float, scaledDensity: Float): ChartConfig {
      val root = JSONObject(json)
      val theme = root.getJSONObject("theme")
      val appearance = root.getJSONObject("appearance")
      val gridAppearance = appearance.getJSONObject("grid")
      val candlesAppearance = appearance.getJSONObject("candles")
      val xAxisAppearance = appearance.getJSONObject("xAxis")
      val yAxisAppearance = appearance.getJSONObject("yAxis")
      val extremaAppearance = appearance.getJSONObject("priceExtremes")
      val currentAppearance = appearance.getJSONObject("currentPrice")
      val currentLineAppearance = currentAppearance.getJSONObject("line")
      val currentLabelAppearance = currentAppearance.getJSONObject("label")
      val crosshairAppearance = appearance.getJSONObject("crosshair")
      val crosshairLineAppearance = crosshairAppearance.getJSONObject("line")
      val crosshairPriceAppearance = crosshairAppearance.getJSONObject("priceLabel")
      val crosshairTimeAppearance = crosshairAppearance.getJSONObject("timeLabel")
      val tooltipAppearance = appearance.getJSONObject("tooltip")
      val formatters = root.getJSONObject("formatters")
      val dateFormatters = formatters.getJSONObject("date")
      val priceFormatters = formatters.getJSONObject("price")
      val xDateFormatters = dateFormatters.getJSONObject("xAxis")
      val xAxis = root.getJSONObject("xAxis")
      val yAxis = root.getJSONObject("yAxis")
      val scaleMargins = yAxis.getJSONObject("scaleMargins")
      val format = yAxis.getJSONObject("valueFormat")
      val gestures = root.getJSONObject("gestures")
      val current = root.getJSONObject("currentPrice")
      val priceExtremes = root.optJSONObject("priceExtremes")
      val crosshair = root.getJSONObject("crosshair")
      val tooltipLabels = crosshair.optJSONObject("tooltipLabels")
      return ChartConfig(
        timeframeMs = root.getDouble("timeframeMs"),
        initialVisibleCount = root.getInt("initialVisibleCount"),
        defaultScale = root.optDouble("defaultScale", 1.0),
        defaultYScale = yAxis.optDouble("defaultScale", 1.0),
        displayScale = density,
        backgroundColor = chartColor(appearance.getString("backgroundColor")),
        gridColor = chartColor(gridAppearance.getString("color")),
        axisTextColor = chartColor(theme.getString("axisTextColor")),
        upColor = chartColor(candlesAppearance.getString("upColor")),
        downColor = chartColor(candlesAppearance.getString("downColor")),
        crosshairColor = chartColor(crosshairLineAppearance.getString("color")),
        tooltipBackgroundColor = chartColor(tooltipAppearance.getString("backgroundColor")),
        tooltipTextColor = chartColor(tooltipAppearance.getJSONObject("valueText").getString("color")),
        gridOpacity = gridAppearance.getDouble("opacity").toFloat(),
        currentPriceLineUpColor = chartColor(currentLineAppearance.getString("upColor")),
        currentPriceLineDownColor = chartColor(currentLineAppearance.getString("downColor")),
        currentPriceLabelUpColor = chartColor(currentLabelAppearance.getString("upBackgroundColor")),
        currentPriceLabelDownColor = chartColor(currentLabelAppearance.getString("downBackgroundColor")),
        crosshairOpacity = crosshairLineAppearance.getDouble("opacity").toFloat(),
        xAxisTextStyle = textStyle(
          xAxisAppearance.getJSONObject("text"),
          Color.rgb(151, 145, 165),
          scaledDensity,
        ),
        yAxisTextStyle = textStyle(
          yAxisAppearance.getJSONObject("text"),
          Color.rgb(151, 145, 165),
          scaledDensity,
        ),
        extremaTextStyle = textStyle(
          extremaAppearance.getJSONObject("text"),
          Color.rgb(151, 145, 165),
          scaledDensity,
        ),
        extremaConnectorColor = chartColor(extremaAppearance.getString("connectorColor")),
        extremaBackgroundColor = chartColor(extremaAppearance.getString("backgroundColor")),
        currentPriceTextStyle = textStyle(
          currentLabelAppearance.getJSONObject("text"),
          Color.BLACK,
          scaledDensity,
        ),
        currentPriceBorder = border(
          currentLabelAppearance.getJSONObject("border"), density, 4f,
        ),
        crosshairPriceBackgroundColor = chartColor(
          crosshairPriceAppearance.getString("backgroundColor"),
        ),
        crosshairPriceTextStyle = textStyle(
          crosshairPriceAppearance.getJSONObject("text"), Color.BLACK, scaledDensity,
        ),
        crosshairPriceBorder = border(
          crosshairPriceAppearance.getJSONObject("border"), density, 4f,
        ),
        crosshairTimeBackgroundColor = chartColor(
          crosshairTimeAppearance.getString("backgroundColor"),
        ),
        crosshairTimeTextStyle = textStyle(
          crosshairTimeAppearance.getJSONObject("text"), Color.BLACK, scaledDensity,
        ),
        crosshairTimeBorder = border(
          crosshairTimeAppearance.getJSONObject("border"), density, 4f,
        ),
        tooltipHeaderTextStyle = textStyle(
          tooltipAppearance.getJSONObject("headerText"),
          Color.rgb(245, 242, 250),
          scaledDensity,
        ),
        tooltipLabelTextStyle = textStyle(
          tooltipAppearance.getJSONObject("labelText"),
          Color.rgb(245, 242, 250),
          scaledDensity,
        ),
        tooltipValueTextStyle = textStyle(
          tooltipAppearance.getJSONObject("valueText"),
          Color.rgb(245, 242, 250),
          scaledDensity,
        ),
        tooltipPositiveValueColor = chartColor(
          tooltipAppearance.getString("positiveValueColor"),
        ),
        tooltipNegativeValueColor = chartColor(
          tooltipAppearance.getString("negativeValueColor"),
        ),
        tooltipBorder = border(tooltipAppearance.getJSONObject("border"), density, 8f),
        showXAxis = xAxis.getBoolean("visible"),
        xAxisHeight = xAxis.getDouble("height").toFloat() * density,
        xLocale = xAxis.getString("locale"),
        xTimeZone = xAxis.getString("timeZone"),
        showSeconds = xAxis.getBoolean("showSeconds"),
        logicalSpacing = xAxis.getString("spacing") == "logical",
        showYAxis = yAxis.getBoolean("visible"),
        yAxisOnRight = yAxis.getString("position") != "left",
        yAxisWidth = yAxis.getDouble("width").toFloat() * density,
        yScaleMarginTop = scaleMargins.getDouble("top"),
        yScaleMarginBottom = scaleMargins.getDouble("bottom"),
        valueFormat = valueFormat(format),
        extremaValueFormat = valueFormat(priceFormatters.getJSONObject("priceExtremes")),
        currentPriceValueFormat = valueFormat(priceFormatters.getJSONObject("currentPrice")),
        crosshairPriceValueFormat = valueFormat(priceFormatters.getJSONObject("crosshairPrice")),
        tooltipValueFormat = valueFormat(priceFormatters.getJSONObject("tooltip")),
        xAxisDateFormats = XAxisDateFormatConfig(
          locale = xDateFormatters.getString("locale"),
          timeZone = xDateFormatters.getString("timeZone"),
          seconds = xDateFormatters.getString("seconds"),
          time = xDateFormatters.getString("time"),
          day = xDateFormatters.getString("day"),
          month = xDateFormatters.getString("month"),
          year = xDateFormatters.getString("year"),
        ),
        crosshairTimeDateFormat = datePattern(
          dateFormatters.getJSONObject("crosshairTimeBadge"),
        ),
        tooltipHeaderDateFormat = datePattern(
          dateFormatters.getJSONObject("tooltipHeader"),
        ),
        allowPan = gestures.getBoolean("pan"),
        allowZoom = gestures.getBoolean("zoom"),
        allowYAxisScale = gestures.optBoolean(
          "yAxisScale",
          gestures.getBoolean("zoom"),
        ),
        showCurrentPrice = current.getBoolean("visible"),
        showCurrentPriceLabel = current.getBoolean("showLabel"),
        pinCurrentPriceToEdge = current.optBoolean("pinToEdge", true),
        showPriceExtremes = priceExtremes?.optBoolean("visible", true) ?: true,
        crosshairEnabled = crosshair.getBoolean("enabled"),
        showTooltip = crosshair.getBoolean("showTooltip"),
        tooltipBackgroundOpacity = tooltipAppearance.getDouble("backgroundOpacity").toFloat(),
        crosshairDashed = crosshair.optString("lineStyle", "solid") == "dashed",
        tooltipLabels = CrosshairTooltipLabels(
          open = tooltipLabels?.optString("open", "Open") ?: "Open",
          close = tooltipLabels?.optString("close", "Close") ?: "Close",
          high = tooltipLabels?.optString("high", "High") ?: "High",
          low = tooltipLabels?.optString("low", "Low") ?: "Low",
          amplitude = tooltipLabels?.optString("amplitude", "Amplitude") ?: "Amplitude",
          changePercent =
            tooltipLabels?.optString("changePercent", "Change %") ?: "Change %",
          change = tooltipLabels?.optString("change", "Change") ?: "Change",
          volume = tooltipLabels?.optString("volume", "Volume") ?: "Volume",
        ),
      )
    }
  }

  fun nativeNumbers() = doubleArrayOf(
    timeframeMs,
    initialVisibleCount.toDouble(),
    if (showXAxis) 1.0 else 0.0,
    xAxisHeight.toDouble(),
    if (showSeconds) 1.0 else 0.0,
    if (showYAxis) 1.0 else 0.0,
    if (yAxisOnRight) 1.0 else 0.0,
    yAxisWidth.toDouble(),
    if (valueFormat.compact) 1.0 else 0.0,
    valueFormat.precision.toDouble(),
    valueFormat.minMove,
    if (valueFormat.useGrouping) 1.0 else 0.0,
    if (allowPan) 1.0 else 0.0,
    if (allowZoom) 1.0 else 0.0,
    if (showCurrentPrice) 1.0 else 0.0,
    if (showCurrentPriceLabel) 1.0 else 0.0,
    if (crosshairEnabled) 1.0 else 0.0,
    if (showTooltip) 1.0 else 0.0,
    yScaleMarginTop,
    yScaleMarginBottom,
    displayScale.toDouble(),
    if (logicalSpacing) 1.0 else 0.0,
    if (pinCurrentPriceToEdge) 1.0 else 0.0,
    if (showPriceExtremes) 1.0 else 0.0,
    defaultScale,
    if (crosshairDashed) 1.0 else 0.0,
    tooltipBackgroundOpacity.toDouble(),
    gridOpacity.toDouble(),
    crosshairOpacity.toDouble(),
    defaultYScale,
    if (allowYAxisScale) 1.0 else 0.0,
  )

  fun nativeColors(): FloatArray {
    val values = intArrayOf(
      backgroundColor, gridColor, axisTextColor, upColor, downColor,
      crosshairColor, tooltipBackgroundColor, tooltipTextColor,
      currentPriceLineUpColor, currentPriceLineDownColor,
      currentPriceLabelUpColor, currentPriceLabelDownColor,
    )
    return FloatArray(values.size * 4).also { output ->
      values.forEachIndexed { index, color ->
        output[index * 4] = Color.red(color) / 255f
        output[index * 4 + 1] = Color.green(color) / 255f
        output[index * 4 + 2] = Color.blue(color) / 255f
        output[index * 4 + 3] = Color.alpha(color) / 255f
      }
    }
  }

  fun nativeStrings() = arrayOf(xLocale, xTimeZone, valueFormat.locale, valueFormat.currencySymbol)
}
