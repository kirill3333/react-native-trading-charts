package com.tradingcharts

import android.graphics.Color
import org.json.JSONObject

internal class ChartConfigJsonDecoder(
    json: String,
    private val density: Float,
    private val scaledDensity: Float,
) {
  private val root = JSONObject(json)
  private val theme = root.getJSONObject("theme")
  private val appearance = root.getJSONObject("appearance")
  private val gridAppearance = appearance.getJSONObject("grid")
  private val candlesAppearance = appearance.getJSONObject("candles")
  private val xAxisAppearance = appearance.getJSONObject("xAxis")
  private val yAxisAppearance = appearance.getJSONObject("yAxis")
  private val extremaAppearance = appearance.getJSONObject("priceExtremes")
  private val currentAppearance = appearance.getJSONObject("currentPrice")
  private val currentLineAppearance = currentAppearance.getJSONObject("line")
  private val currentLabelAppearance = currentAppearance.getJSONObject("label")
  private val crosshairAppearance = appearance.getJSONObject("crosshair")
  private val crosshairLineAppearance = crosshairAppearance.getJSONObject("line")
  private val crosshairPriceAppearance = crosshairAppearance.getJSONObject("priceLabel")
  private val crosshairTimeAppearance = crosshairAppearance.getJSONObject("timeLabel")
  private val tooltipAppearance = appearance.getJSONObject("tooltip")
  private val formatters = root.getJSONObject("formatters")
  private val dateFormatters = formatters.getJSONObject("date")
  private val priceFormatters = formatters.getJSONObject("price")
  private val xDateFormatters = dateFormatters.getJSONObject("xAxis")
  private val xAxis = root.getJSONObject("xAxis")
  private val yAxis = root.getJSONObject("yAxis")
  private val scaleMargins = yAxis.getJSONObject("scaleMargins")
  private val gestures = root.getJSONObject("gestures")
  private val current = root.getJSONObject("currentPrice")
  private val priceExtremes = root.optJSONObject("priceExtremes")
  private val crosshair = root.getJSONObject("crosshair")
  private val tooltipLabels = crosshair.optJSONObject("tooltipLabels")

  fun decode(): ChartConfig {
    var config = decodeBase()
    config = decodePalette(config)
    config = decodeAxisAppearance(config)
    config = decodeCurrentPriceAppearance(config)
    config = decodeCrosshairAppearance(config)
    config = decodeTooltipAppearance(config)
    config = decodeAxes(config)
    config = decodeFormats(config)
    return decodeInteractions(config)
  }

  private fun decodeBase() =
      ChartConfig(
          timeframeMs = root.getDouble("timeframeMs"),
          initialVisibleCount = root.getInt("initialVisibleCount"),
          defaultScale = root.optDouble("defaultScale", 1.0),
          defaultYScale = yAxis.optDouble("defaultScale", 1.0),
          displayScale = density,
      )

  private fun decodePalette(config: ChartConfig) =
      config.copy(
          backgroundColor = chartColor(appearance.getString("backgroundColor")),
          gridColor = chartColor(gridAppearance.getString("color")),
          axisTextColor = chartColor(theme.getString("axisTextColor")),
          upColor = chartColor(candlesAppearance.getString("upColor")),
          downColor = chartColor(candlesAppearance.getString("downColor")),
          gridOpacity = gridAppearance.getDouble("opacity").toFloat(),
          currentPriceLineUpColor = chartColor(currentLineAppearance.getString("upColor")),
          currentPriceLineDownColor = chartColor(currentLineAppearance.getString("downColor")),
          currentPriceLabelUpColor =
              chartColor(currentLabelAppearance.getString("upBackgroundColor")),
          currentPriceLabelDownColor =
              chartColor(currentLabelAppearance.getString("downBackgroundColor")),
      )

  private fun decodeAxisAppearance(config: ChartConfig) =
      config.copy(
          xAxisTextStyle =
              textStyle(
                  xAxisAppearance.getJSONObject("text"),
                  Color.rgb(151, 145, 165),
              ),
          yAxisTextStyle =
              textStyle(
                  yAxisAppearance.getJSONObject("text"),
                  Color.rgb(151, 145, 165),
              ),
          extremaTextStyle =
              textStyle(
                  extremaAppearance.getJSONObject("text"),
                  Color.rgb(151, 145, 165),
              ),
          extremaConnectorColor = chartColor(extremaAppearance.getString("connectorColor")),
          extremaBackgroundColor = chartColor(extremaAppearance.getString("backgroundColor")),
      )

  private fun decodeCurrentPriceAppearance(config: ChartConfig) =
      config.copy(
          currentPriceTextStyle =
              textStyle(
                  currentLabelAppearance.getJSONObject("text"),
                  Color.BLACK,
              ),
          currentPriceBorder =
              border(
                  currentLabelAppearance.getJSONObject("border"),
                  defaultRadius = 4f,
              ),
      )

  private fun decodeCrosshairAppearance(config: ChartConfig) =
      config.copy(
          crosshairColor = chartColor(crosshairLineAppearance.getString("color")),
          crosshairOpacity = crosshairLineAppearance.getDouble("opacity").toFloat(),
          crosshairPriceBackgroundColor =
              chartColor(crosshairPriceAppearance.getString("backgroundColor")),
          crosshairPriceTextStyle =
              textStyle(
                  crosshairPriceAppearance.getJSONObject("text"),
                  Color.BLACK,
              ),
          crosshairPriceBorder =
              border(
                  crosshairPriceAppearance.getJSONObject("border"),
                  defaultRadius = 4f,
              ),
          crosshairTimeBackgroundColor =
              chartColor(crosshairTimeAppearance.getString("backgroundColor")),
          crosshairTimeTextStyle =
              textStyle(
                  crosshairTimeAppearance.getJSONObject("text"),
                  Color.BLACK,
              ),
          crosshairTimeBorder =
              border(
                  crosshairTimeAppearance.getJSONObject("border"),
                  defaultRadius = 4f,
              ),
      )

  private fun decodeTooltipAppearance(config: ChartConfig) =
      config.copy(
          tooltipBackgroundColor = chartColor(tooltipAppearance.getString("backgroundColor")),
          tooltipTextColor =
              chartColor(tooltipAppearance.getJSONObject("valueText").getString("color")),
          tooltipHeaderTextStyle =
              textStyle(
                  tooltipAppearance.getJSONObject("headerText"),
                  Color.rgb(245, 242, 250),
              ),
          tooltipLabelTextStyle =
              textStyle(
                  tooltipAppearance.getJSONObject("labelText"),
                  Color.rgb(245, 242, 250),
              ),
          tooltipValueTextStyle =
              textStyle(
                  tooltipAppearance.getJSONObject("valueText"),
                  Color.rgb(245, 242, 250),
              ),
          tooltipPositiveValueColor = chartColor(tooltipAppearance.getString("positiveValueColor")),
          tooltipNegativeValueColor = chartColor(tooltipAppearance.getString("negativeValueColor")),
          tooltipBorder = border(tooltipAppearance.getJSONObject("border"), defaultRadius = 8f),
          tooltipBackgroundOpacity = tooltipAppearance.getDouble("backgroundOpacity").toFloat(),
      )

  private fun decodeAxes(config: ChartConfig) =
      config.copy(
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
      )

  private fun decodeFormats(config: ChartConfig) =
      config.copy(
          valueFormat = valueFormat(yAxis.getJSONObject("valueFormat")),
          extremaValueFormat = valueFormat(priceFormatters.getJSONObject("priceExtremes")),
          currentPriceValueFormat = valueFormat(priceFormatters.getJSONObject("currentPrice")),
          crosshairPriceValueFormat = valueFormat(priceFormatters.getJSONObject("crosshairPrice")),
          tooltipValueFormat = valueFormat(priceFormatters.getJSONObject("tooltip")),
          xAxisDateFormats =
              XAxisDateFormatConfig(
                  locale = xDateFormatters.getString("locale"),
                  timeZone = xDateFormatters.getString("timeZone"),
                  seconds = xDateFormatters.getString("seconds"),
                  time = xDateFormatters.getString("time"),
                  day = xDateFormatters.getString("day"),
                  month = xDateFormatters.getString("month"),
                  year = xDateFormatters.getString("year"),
              ),
          crosshairTimeDateFormat = datePattern(dateFormatters.getJSONObject("crosshairTimeBadge")),
          tooltipHeaderDateFormat = datePattern(dateFormatters.getJSONObject("tooltipHeader")),
      )

  private fun decodeInteractions(config: ChartConfig) =
      config.copy(
          allowPan = gestures.getBoolean("pan"),
          allowZoom = gestures.getBoolean("zoom"),
          allowYAxisScale =
              gestures.optBoolean(
                  "yAxisScale",
                  gestures.getBoolean("zoom"),
              ),
          showCurrentPrice = current.getBoolean("visible"),
          showCurrentPriceLabel = current.getBoolean("showLabel"),
          pinCurrentPriceToEdge = current.optBoolean("pinToEdge", true),
          showPriceExtremes = priceExtremes?.optBoolean("visible", true) ?: true,
          crosshairEnabled = crosshair.getBoolean("enabled"),
          showTooltip = crosshair.getBoolean("showTooltip"),
          crosshairDashed = crosshair.optString("lineStyle", "solid") == "dashed",
          tooltipLabels =
              CrosshairTooltipLabels(
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

  private fun textStyle(json: JSONObject, defaultColor: Int) =
      TextStyleConfig(
          color = if (json.has("color")) chartColor(json.getString("color")) else defaultColor,
          fontFamily = if (json.has("fontFamily")) json.getString("fontFamily") else null,
          fontSizePx =
              if (json.has("fontSize")) {
                json.getDouble("fontSize").toFloat() * scaledDensity
              } else null,
          fontWeight = if (json.has("fontWeight")) json.getString("fontWeight") else null,
      )

  private fun border(json: JSONObject, defaultRadius: Float) =
      BorderStyleConfig(
          color = chartColor(json.optString("color", "#00000000")),
          widthPx = json.optDouble("width", 0.0).toFloat() * density,
          radiusPx = json.optDouble("radius", defaultRadius.toDouble()).toFloat() * density,
      )

  private fun valueFormat(json: JSONObject) =
      ValueFormat(
          type = json.getString("type"),
          precision = json.optInt("precision", 2),
          significantDigits = json.optInt("significantDigits", 3),
          minMove = json.optDouble("minMove", 0.01),
          locale = json.getString("locale"),
          currencySymbol = json.getString("currencySymbol"),
          useGrouping = json.optBoolean("useGrouping", true),
      )

  private fun datePattern(json: JSONObject) =
      DatePatternConfig(
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
}
