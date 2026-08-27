package com.tradingcharts

import android.graphics.Color
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.ConcurrentHashMap
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
  private val barsAppearance = appearance.optJSONObject("bars") ?: candlesAppearance
  private val lineAppearance = appearance.optJSONObject("line") ?: JSONObject()
  private val lineGradient = lineAppearance.optJSONObject("gradient")
  private val areaAppearance = appearance.optJSONObject("area") ?: JSONObject()
  private val areaGradient = areaAppearance.optJSONObject("gradient")
  private val areaFill = areaAppearance.optJSONObject("fill") ?: JSONObject()
  private val seriesType = root.optJSONObject("series")?.optString("type") ?: "candlestick"
  private val seriesAppearance = if (seriesType == "bar") barsAppearance else candlesAppearance
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
  private val resolution = root.getJSONObject("resolution")
  private val tradeAggregation = root.getJSONObject("tradeAggregation")

  fun decode(): ChartConfig {
    var config = decodeBase()
    config = decodePalette(config)
    config = decodeAxisAppearance(config)
    config = decodeCurrentPriceAppearance(config)
    config = decodeCrosshairAppearance(config)
    config = decodeTooltipAppearance(config)
    config = decodeAxes(config)
    config = decodeFormats(config)
    config = decodeInteractions(config)
    return decodePanesAndSeries(config)
  }

  private fun decodeBase() =
      ChartConfig(
          resolution = decodeResolution(),
          tradeAggregation = decodeTradeAggregation(),
          initialVisibleCount = root.getInt("initialVisibleCount"),
          defaultScale = root.optDouble("defaultScale", 1.0),
          defaultYScale = yAxis.optDouble("defaultScale", 1.0),
          displayScale = density,
          seriesType = seriesType,
          candleRadiusPx = candlesAppearance.optDouble("radius", 0.0).toFloat() * density,
          barLineWidthPx = barsAppearance.optDouble("lineWidth", 1.0).toFloat() * density,
          lineWidthPx = lineAppearance.optDouble("width", 1.5).toFloat() * density,
          lineSource = root.optJSONObject("series")?.optString("source", "close") ?: "close",
          lineDashed = lineAppearance.optString("style", "solid") == "dashed",
          lineGradientEnabled = lineGradient != null,
          areaLineWidthPx = areaAppearance.optDouble("width", 1.5).toFloat() * density,
          areaLineDashed = areaAppearance.optString("style", "solid") == "dashed",
          areaLineGradientEnabled = areaGradient != null,
          lineGapThresholdMs =
              root.optJSONObject("series")?.optDouble("gapThresholdMs", 0.0) ?: 0.0,
      )

  private fun decodeResolution(): ResolutionConfig {
    val unit =
        when (resolution.getString("unit")) {
          "fixed" -> RESOLUTION_FIXED
          "second" -> RESOLUTION_SECOND
          "minute" -> RESOLUTION_MINUTE
          "hour" -> RESOLUTION_HOUR
          "day" -> RESOLUTION_DAY
          "week" -> RESOLUTION_WEEK
          "month" -> RESOLUTION_MONTH
          else -> throw IllegalArgumentException("Unsupported resolution unit")
        }
    val multiplier = resolution.optInt("multiplier", 1)
    val durationMs = resolution.optLong("durationMs", 60_000L)
    return ResolutionConfig(unit, multiplier, durationMs)
  }

  private fun decodeTradeAggregation(): TradeAggregationConfig {
    val origin = tradeAggregation.getJSONObject("bucketOrigin")
    val originType =
        when (origin.getString("type")) {
          "epoch" -> BUCKET_ORIGIN_EPOCH
          "session" -> BUCKET_ORIGIN_SESSION
          "timestamp" -> BUCKET_ORIGIN_TIMESTAMP
          else -> throw IllegalArgumentException("Unsupported bucket origin")
        }
    val calendarJson = tradeAggregation.optJSONObject("calendar")
    return TradeAggregationConfig(
        bucketOrigin = originType,
        originTimestampMs = origin.optLong("timestamp", 0L),
        outsideSession =
            if (tradeAggregation.getString("outsideSession") == "reject") {
              OUTSIDE_SESSION_REJECT
            } else {
              OUTSIDE_SESSION_IGNORE
            },
        candleTimestamp =
            if (tradeAggregation.getString("candleTimestamp") == "tradingDateUtc") {
              CANDLE_TIMESTAMP_TRADING_DATE_UTC
            } else {
              CANDLE_TIMESTAMP_BUCKET_START
            },
        calendar =
            if (calendarJson == null) TradingCalendarConfig() else decodeCalendar(calendarJson),
    )
  }

  private fun decodeCalendar(value: JSONObject): TradingCalendarConfig {
    val timeZone = value.getString("timeZone")
    val sessionsJson = value.getJSONArray("sessions")
    val sessions =
        List(sessionsJson.length()) { index ->
          val session = sessionsJson.getJSONObject(index)
          val weekdays = session.getJSONArray("weekdays")
          var weekdayMask = 0
          repeat(weekdays.length()) { weekdayIndex ->
            val weekday = weekdays.getInt(weekdayIndex)
            weekdayMask = weekdayMask or (1 shl (weekday - 1))
          }
          decodeSession(session, weekdayMask)
        }
    val holidaysJson = value.getJSONArray("holidays")
    val holidays =
        LongArray(holidaysJson.length()) { index ->
          LocalDate.parse(holidaysJson.getString(index)).toEpochDay()
        }
    val overridesJson = value.getJSONArray("overrides")
    val overrides =
        List(overridesJson.length()) { index ->
          val override = overridesJson.getJSONObject(index)
          val overrideSessionsJson = override.getJSONArray("sessions")
          TradingCalendarOverrideConfig(
              epochDay = LocalDate.parse(override.getString("date")).toEpochDay(),
              sessions =
                  List(overrideSessionsJson.length()) { sessionIndex ->
                    decodeSession(overrideSessionsJson.getJSONObject(sessionIndex), 0)
                  },
          )
        }
    return TradingCalendarConfig(
        configured = true,
        timeZone = timeZone,
        transitions = timeZoneTransitions(timeZone),
        sessions = sessions,
        holidayEpochDays = holidays,
        overrides = overrides,
        weekStartsOn = if (value.getString("weekStartsOn") == "sunday") 7 else 1,
    )
  }

  private fun decodeSession(value: JSONObject, weekdayMask: Int) =
      TradingSessionConfig(
          weekdayMask = weekdayMask,
          startSeconds = value.getInt("startSeconds"),
          endSeconds = value.getInt("endSeconds"),
          startDayOffset = value.getInt("startDayOffset"),
          endDayOffset = value.getInt("endDayOffset"),
      )

  private fun timeZoneTransitions(timeZone: String): List<TimeZoneTransitionConfig> {
    return TIME_ZONE_TRANSITION_CACHE.computeIfAbsent(timeZone) {
      val rules = ZoneId.of(it).rules
      val end = Instant.parse("2101-01-01T00:00:00Z")
      val result =
          mutableListOf(TimeZoneTransitionConfig(0L, rules.getOffset(Instant.EPOCH).totalSeconds))
      var cursor = Instant.EPOCH.minusNanos(1)
      var transition = rules.nextTransition(cursor)
      while (transition != null && transition.instant.isBefore(end)) {
        result +=
            TimeZoneTransitionConfig(
                transition.instant.toEpochMilli(),
                transition.offsetAfter.totalSeconds,
            )
        cursor = transition.instant.plusNanos(1)
        transition = rules.nextTransition(cursor)
      }
      result
    }
  }

  private fun decodePalette(config: ChartConfig) =
      config.copy(
          backgroundColor = chartColor(appearance.getString("backgroundColor")),
          gridColor = chartColor(gridAppearance.getString("color")),
          axisTextColor = chartColor(theme.getString("axisTextColor")),
          upColor = chartColor(seriesAppearance.getString("upColor")),
          downColor = chartColor(seriesAppearance.getString("downColor")),
          lineColor = chartColor(lineAppearance.optString("color", theme.getString("upColor"))),
          lineGradientTopColor =
              chartColor(
                  lineGradient?.optString(
                      "topColor",
                      lineAppearance.optString("color", theme.getString("upColor")),
                  ) ?: lineAppearance.optString("color", theme.getString("upColor"))
              ),
          lineGradientBottomColor =
              chartColor(
                  lineGradient?.optString(
                      "bottomColor",
                      lineAppearance.optString("color", theme.getString("upColor")),
                  ) ?: lineAppearance.optString("color", theme.getString("upColor"))
              ),
          areaLineColor = chartColor(areaAppearance.optString("color", theme.getString("upColor"))),
          areaLineGradientTopColor =
              chartColor(
                  areaGradient?.optString(
                      "topColor",
                      areaAppearance.optString("color", theme.getString("upColor")),
                  ) ?: areaAppearance.optString("color", theme.getString("upColor"))
              ),
          areaLineGradientBottomColor =
              chartColor(
                  areaGradient?.optString(
                      "bottomColor",
                      areaAppearance.optString("color", theme.getString("upColor")),
                  ) ?: areaAppearance.optString("color", theme.getString("upColor"))
              ),
          areaFillTopColor = chartColor(areaFill.getString("topColor")),
          areaFillBottomColor = chartColor(areaFill.getString("bottomColor")),
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
          showTooltipHeader = crosshair.optBoolean("showTooltipHeader", true),
          crosshairDashed = crosshair.optString("lineStyle", "solid") == "dashed",
          tooltipFields =
              crosshair.optJSONArray("tooltipFields")?.let { fields ->
                List(fields.length()) { index -> fields.getString(index) }
              } ?: config.tooltipFields,
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

  private fun decodePanesAndSeries(config: ChartConfig): ChartConfig {
    val paneValues = root.optJSONArray("panes")
    val panes =
        if (paneValues == null) {
          config.panes.map {
            it.copy(
                minHeightPx = it.minHeightPx * density,
                scaleVisible = config.showYAxis,
                scaleMarginTop = config.yScaleMarginTop,
                scaleMarginBottom = config.yScaleMarginBottom,
                valueFormat = config.valueFormat,
            )
          }
        } else {
          List(paneValues.length()) { index ->
            val pane = paneValues.getJSONObject(index)
            val scale = pane.getJSONObject("priceScale")
            val margins = scale.getJSONObject("scaleMargins")
            val format = paneValueFormat(scale.getJSONObject("valueFormat"), config.valueFormat)
            PaneConfig(
                paneId = pane.getString("paneId"),
                priceScaleId = scale.getString("priceScaleId"),
                heightWeight = pane.getDouble("heightWeight"),
                minHeightPx = pane.getDouble("minHeight").toFloat() * density,
                scaleVisible = scale.optBoolean("visible", true),
                scaleMarginTop = margins.getDouble("top"),
                scaleMarginBottom = margins.getDouble("bottom"),
                volumeFormat = format.type == "volume",
                valueFormat = format,
            )
          }
        }
    val seriesValues = root.optJSONArray("additionalSeries")
    val additionalSeries =
        if (seriesValues == null) {
          emptyList()
        } else {
          List(seriesValues.length()) { index ->
            seriesConfig(
                seriesValues.getJSONObject(index),
                config,
                declarative = true,
            )
          }
        }
    return config.copy(
        panes = panes,
        additionalSeries = additionalSeries,
        panesResizable = root.optBoolean("panesResizable", panes.size > 1),
    )
  }

  private fun paneValueFormat(json: JSONObject, fallback: ValueFormat): ValueFormat {
    if (json.optString("type") != "volume") return valueFormat(json)
    return ValueFormat(
        type = "volume",
        precision = json.optInt("precision", 2),
        significantDigits = 3,
        minMove = 1.0,
        locale = json.optString("locale", fallback.locale),
        currencySymbol = "",
        useGrouping = json.optBoolean("useGrouping", true),
    )
  }

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
    return parseChartColor(value)
  }
}

private val TIME_ZONE_TRANSITION_CACHE = ConcurrentHashMap<String, List<TimeZoneTransitionConfig>>()

internal fun seriesConfigFromJson(
    json: String,
    fallback: ChartConfig,
    declarative: Boolean = false,
): SeriesConfig = seriesConfig(JSONObject(json), fallback, declarative)

private fun String.isLineLikeSeries() = this == "line" || this == "area"

private fun JSONObject?.optionalColor(name: String): Int? =
    this?.optString(name)?.takeIf { it.isNotEmpty() }?.let(::parseChartColor)

private fun seriesLineWidthPx(
    type: String,
    appearance: JSONObject?,
    fallback: ChartConfig,
): Float {
  if (!type.isLineLikeSeries()) return fallback.barLineWidthPx
  if (appearance?.has("width") == true) {
    return appearance.getDouble("width").toFloat() * fallback.displayScale
  }
  return if (type == "area") fallback.areaLineWidthPx else fallback.lineWidthPx
}

private fun seriesLineDashed(
    type: String,
    appearance: JSONObject?,
    fallback: ChartConfig,
): Boolean {
  if (!type.isLineLikeSeries()) return false
  val fallbackDashed = if (type == "area") fallback.areaLineDashed else fallback.lineDashed
  return appearance?.optString("style")?.takeIf { it.isNotEmpty() }?.let { it == "dashed" }
      ?: fallbackDashed
}

private fun seriesLineSource(
    type: String,
    json: JSONObject,
    source: JSONObject?,
): String {
  val sourceType = source?.optString("type")
  if (sourceType == "ohlcvSma" || sourceType == "ohlcvEma") {
    return source.optString("valueSource", "close")
  }
  return if (type.isLineLikeSeries()) json.optString("source", "close") else "close"
}

private fun movingAveragePeriod(source: JSONObject?): Long {
  val type = source?.optString("type")
  return if (type == "ohlcvSma" || type == "ohlcvEma") {
    source.optLong("period", 0L)
  } else {
    1L
  }
}

private data class RsiConfigValues(
    val period: Int,
    val oversold: Double,
    val overbought: Double,
    val textColor: Int?,
    val levelLineColor: Int,
    val bandColor: Int,
)

private fun rsiConfigValues(
    source: JSONObject?,
    levels: JSONObject?,
    appearance: JSONObject?,
    color: Int,
) =
    RsiConfigValues(
        period = source?.optInt("period", 14) ?: 14,
        oversold = levels?.optDouble("oversold", 30.0) ?: 30.0,
        overbought = levels?.optDouble("overbought", 70.0) ?: 70.0,
        textColor = appearance.optionalColor("textColor"),
        levelLineColor =
            appearance.optionalColor("levelLineColor")
                ?: Color.argb(128, Color.red(color), Color.green(color), Color.blue(color)),
        bandColor =
            appearance.optionalColor("bandColor")
                ?: Color.argb(20, Color.red(color), Color.green(color), Color.blue(color)),
    )

private fun seriesConfig(
    json: JSONObject,
    fallback: ChartConfig,
    declarative: Boolean,
): SeriesConfig {
  val type = json.getString("type")
  val lineLike = type.isLineLikeSeries()
  val appearance = json.optJSONObject("appearance")
  val source = json.optJSONObject("source")
  val lineAppearance = appearance.takeIf { lineLike }
  val lineGradient = lineAppearance?.optJSONObject("gradient")
  val areaFill = lineAppearance?.optJSONObject("fill")
  val levels = json.optJSONObject("levels")
  val fallbackColor = if (type == "area") fallback.areaLineColor else fallback.lineColor
  val resolvedColor =
      appearance.optionalColor("color") ?: if (lineLike) fallbackColor else fallback.axisTextColor
  val rsi = rsiConfigValues(source, levels, appearance, resolvedColor)
  return SeriesConfig(
      seriesId = json.getString("seriesId"),
      type = type,
      paneId = json.getString("paneId"),
      priceScaleId = json.getString("priceScaleId"),
      visible = json.optBoolean("visible", true),
      sourceType = source?.optString("type", "data") ?: "data",
      sourceSeriesId = source?.optString("seriesId", "") ?: "",
      color = resolvedColor,
      upColor = appearance.optionalColor("upColor") ?: fallback.upColor,
      downColor = appearance.optionalColor("downColor") ?: fallback.downColor,
      declarative = declarative,
      lineWidthPx = seriesLineWidthPx(type, lineAppearance, fallback),
      lineSource = seriesLineSource(type, json, source),
      lineDashed = seriesLineDashed(type, lineAppearance, fallback),
      lineGradientTopColor = lineGradient.optionalColor("topColor") ?: resolvedColor,
      lineGradientBottomColor = lineGradient.optionalColor("bottomColor") ?: resolvedColor,
      lineGradientEnabled = lineGradient != null,
      lineGapThresholdMs = json.optDouble("gapThresholdMs", 0.0),
      movingAveragePeriod = movingAveragePeriod(source),
      areaFillTopColor = areaFill.optionalColor("topColor") ?: fallback.areaFillTopColor,
      areaFillBottomColor = areaFill.optionalColor("bottomColor") ?: fallback.areaFillBottomColor,
      rsiPeriod = rsi.period,
      rsiOversold = rsi.oversold,
      rsiOverbought = rsi.overbought,
      rsiTextColor = rsi.textColor,
      rsiLevelLineColor = rsi.levelLineColor,
      rsiBandColor = rsi.bandColor,
  )
}

private fun parseChartColor(value: String): Int {
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
