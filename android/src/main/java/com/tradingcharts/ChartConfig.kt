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

internal data class ChartConfig(
  val timeframeMs: Double = 60_000.0,
  val initialVisibleCount: Int = 100,
  val displayScale: Float = 1f,
  val backgroundColor: Int = Color.rgb(16, 12, 24),
  val gridColor: Int = Color.rgb(41, 36, 49),
  val axisTextColor: Int = Color.rgb(151, 145, 165),
  val upColor: Int = Color.rgb(56, 217, 138),
  val downColor: Int = Color.rgb(255, 59, 100),
  val crosshairColor: Int = Color.rgb(168, 162, 179),
  val tooltipBackgroundColor: Int = Color.rgb(27, 23, 35),
  val tooltipTextColor: Int = Color.rgb(245, 242, 250),
  val showXAxis: Boolean = true,
  val xAxisHeight: Float = 26f,
  val xLocale: String = "en-GB",
  val xTimeZone: String = "UTC",
  val showSeconds: Boolean = false,
  val showYAxis: Boolean = true,
  val yAxisOnRight: Boolean = true,
  val yAxisWidth: Float = 64f,
  val yScaleMarginTop: Double = 0.2,
  val yScaleMarginBottom: Double = 0.1,
  val valueFormat: ValueFormat = ValueFormat(),
  val allowPan: Boolean = true,
  val allowZoom: Boolean = true,
  val showCurrentPrice: Boolean = true,
  val showCurrentPriceLabel: Boolean = true,
  val crosshairEnabled: Boolean = true,
  val showTooltip: Boolean = true,
) {
  companion object {
    fun fromJson(json: String, density: Float): ChartConfig {
      val root = JSONObject(json)
      val theme = root.getJSONObject("theme")
      val xAxis = root.getJSONObject("xAxis")
      val yAxis = root.getJSONObject("yAxis")
      val scaleMargins = yAxis.getJSONObject("scaleMargins")
      val format = yAxis.getJSONObject("valueFormat")
      val gestures = root.getJSONObject("gestures")
      val current = root.getJSONObject("currentPrice")
      val crosshair = root.getJSONObject("crosshair")
      return ChartConfig(
        timeframeMs = root.getDouble("timeframeMs"),
        initialVisibleCount = root.getInt("initialVisibleCount"),
        displayScale = density,
        backgroundColor = Color.parseColor(theme.getString("backgroundColor")),
        gridColor = Color.parseColor(theme.getString("gridColor")),
        axisTextColor = Color.parseColor(theme.getString("axisTextColor")),
        upColor = Color.parseColor(theme.getString("upColor")),
        downColor = Color.parseColor(theme.getString("downColor")),
        crosshairColor = Color.parseColor(theme.getString("crosshairColor")),
        tooltipBackgroundColor = Color.parseColor(theme.getString("tooltipBackgroundColor")),
        tooltipTextColor = Color.parseColor(theme.getString("tooltipTextColor")),
        showXAxis = xAxis.getBoolean("visible"),
        xAxisHeight = xAxis.getDouble("height").toFloat() * density,
        xLocale = xAxis.getString("locale"),
        xTimeZone = xAxis.getString("timeZone"),
        showSeconds = xAxis.getBoolean("showSeconds"),
        showYAxis = yAxis.getBoolean("visible"),
        yAxisOnRight = yAxis.getString("position") != "left",
        yAxisWidth = yAxis.getDouble("width").toFloat() * density,
        yScaleMarginTop = scaleMargins.getDouble("top"),
        yScaleMarginBottom = scaleMargins.getDouble("bottom"),
        valueFormat = ValueFormat(
          compact = format.getString("type") == "compact",
          precision = format.getInt("precision"),
          minMove = format.optDouble("minMove", 0.01),
          locale = format.getString("locale"),
          currencySymbol = format.getString("currencySymbol"),
          useGrouping = format.optBoolean("useGrouping", true),
        ),
        allowPan = gestures.getBoolean("pan"),
        allowZoom = gestures.getBoolean("zoom"),
        showCurrentPrice = current.getBoolean("visible"),
        showCurrentPriceLabel = current.getBoolean("showLabel"),
        crosshairEnabled = crosshair.getBoolean("enabled"),
        showTooltip = crosshair.getBoolean("showTooltip"),
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
  )

  fun nativeColors(): FloatArray {
    val values = intArrayOf(
      backgroundColor, gridColor, axisTextColor, upColor, downColor,
      crosshairColor, tooltipBackgroundColor, tooltipTextColor,
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
