package com.tradingcharts

import android.graphics.Color

internal data class ValueFormat(
    val type: String = "price",
    val precision: Int = 2,
    val significantDigits: Int = 3,
    val minMove: Double = 0.01,
    val locale: String = "en-GB",
    val currencySymbol: String = "",
    val useGrouping: Boolean = true,
) {
  val compact: Boolean
    get() = type == "compact"

  val significant: Boolean
    get() = type == "significant"
}

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
    val seriesType: String = "candlestick",
    val barLineWidthPx: Float = 1f,
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
    val xAxisDateFormats: XAxisDateFormatConfig =
        XAxisDateFormatConfig(
            "en-GB",
            "UTC",
            "HH:mm:ss",
            "HH:mm",
            "d MMM",
            "MMM yyyy",
            "yyyy",
        ),
    val crosshairTimeDateFormat: DatePatternConfig =
        DatePatternConfig(
            "d MMM yyyy HH:mm:ss",
            "en-GB",
            "UTC",
        ),
    val tooltipHeaderDateFormat: DatePatternConfig =
        DatePatternConfig(
            "d MMM yyyy HH:mm:ss",
            "en-GB",
            "UTC",
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
  fun nativeNumbers() =
      doubleArrayOf(
          timeframeMs,
          initialVisibleCount.toDouble(),
          showXAxis.nativeDouble(),
          xAxisHeight.toDouble(),
          showSeconds.nativeDouble(),
          showYAxis.nativeDouble(),
          yAxisOnRight.nativeDouble(),
          yAxisWidth.toDouble(),
          valueFormat.compact.nativeDouble(),
          valueFormat.precision.toDouble(),
          valueFormat.minMove,
          valueFormat.useGrouping.nativeDouble(),
          allowPan.nativeDouble(),
          allowZoom.nativeDouble(),
          showCurrentPrice.nativeDouble(),
          showCurrentPriceLabel.nativeDouble(),
          crosshairEnabled.nativeDouble(),
          showTooltip.nativeDouble(),
          yScaleMarginTop,
          yScaleMarginBottom,
          displayScale.toDouble(),
          logicalSpacing.nativeDouble(),
          pinCurrentPriceToEdge.nativeDouble(),
          showPriceExtremes.nativeDouble(),
          defaultScale,
          crosshairDashed.nativeDouble(),
          tooltipBackgroundOpacity.toDouble(),
          gridOpacity.toDouble(),
          crosshairOpacity.toDouble(),
          defaultYScale,
          allowYAxisScale.nativeDouble(),
          (seriesType == "bar").nativeDouble(),
          barLineWidthPx.toDouble(),
      )

  fun nativeColors(): FloatArray {
    val values =
        intArrayOf(
            backgroundColor,
            gridColor,
            axisTextColor,
            upColor,
            downColor,
            crosshairColor,
            tooltipBackgroundColor,
            tooltipTextColor,
            currentPriceLineUpColor,
            currentPriceLineDownColor,
            currentPriceLabelUpColor,
            currentPriceLabelDownColor,
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

  companion object {
    fun fromJson(json: String, density: Float, scaledDensity: Float): ChartConfig =
        ChartConfigJsonDecoder(json, density, scaledDensity).decode()
  }
}

private fun Boolean.nativeDouble() = if (this) 1.0 else 0.0
