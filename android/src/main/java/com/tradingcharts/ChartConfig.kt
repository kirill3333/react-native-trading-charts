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

internal data class PaneConfig(
    val paneId: String,
    val priceScaleId: String,
    val heightWeight: Double,
    val minHeightPx: Float,
    val scaleVisible: Boolean,
    val scaleMarginTop: Double,
    val scaleMarginBottom: Double,
    val volumeFormat: Boolean,
    val valueFormat: ValueFormat,
)

internal data class SeriesConfig(
    val seriesId: String,
    val type: String,
    val paneId: String,
    val priceScaleId: String,
    val visible: Boolean = true,
    val sourceType: String = "data",
    val sourceSeriesId: String = "",
    val color: Int = Color.rgb(151, 145, 165),
    val upColor: Int = Color.rgb(56, 217, 138),
    val downColor: Int = Color.rgb(255, 59, 100),
    val declarative: Boolean = false,
    val lineWidthPx: Float = 1f,
    val lineSource: String = "close",
    val lineGradientTopColor: Int = Color.rgb(56, 217, 138),
    val lineGradientBottomColor: Int = Color.rgb(56, 217, 138),
    val lineGradientEnabled: Boolean = false,
    val lineGapThresholdMs: Double = 0.0,
)

internal data class ChartConfig(
    val timeframeMs: Double = 60_000.0,
    val initialVisibleCount: Int = 100,
    val defaultScale: Double = 1.0,
    val defaultYScale: Double = 1.0,
    val displayScale: Float = 1f,
    val seriesType: String = "candlestick",
    val barLineWidthPx: Float = 1f,
    val lineWidthPx: Float = 2f,
    val lineSource: String = "close",
    val lineGradientEnabled: Boolean = false,
    val lineGapThresholdMs: Double = 0.0,
    val backgroundColor: Int = Color.rgb(16, 12, 24),
    val gridColor: Int = Color.rgb(41, 36, 49),
    val axisTextColor: Int = Color.rgb(151, 145, 165),
    val upColor: Int = Color.rgb(56, 217, 138),
    val downColor: Int = Color.rgb(255, 59, 100),
    val lineColor: Int = Color.rgb(56, 217, 138),
    val lineGradientTopColor: Int = Color.rgb(56, 217, 138),
    val lineGradientBottomColor: Int = Color.rgb(56, 217, 138),
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
    val panes: List<PaneConfig> =
        listOf(
            PaneConfig(
                paneId = "main",
                priceScaleId = "main",
                heightWeight = 1.0,
                minHeightPx = 48f,
                scaleVisible = true,
                scaleMarginTop = 0.2,
                scaleMarginBottom = 0.1,
                volumeFormat = false,
                valueFormat = ValueFormat(),
            )
        ),
    val additionalSeries: List<SeriesConfig> = emptyList(),
    val panesResizable: Boolean = false,
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
          seriesType.nativeSeriesType(),
          barLineWidthPx.toDouble(),
          lineSource.nativeLineSource(),
          lineWidthPx.toDouble(),
          lineGradientEnabled.nativeDouble(),
          lineGapThresholdMs,
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
            lineColor,
            lineGradientTopColor,
            lineGradientBottomColor,
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

  fun nativePaneNumbers(): DoubleArray =
      DoubleArray(panes.size * PANE_NUMBER_WIDTH).also { values ->
        panes.forEachIndexed { index, pane ->
          val offset = index * PANE_NUMBER_WIDTH
          values[offset] = pane.heightWeight
          values[offset + 1] = pane.minHeightPx.toDouble()
          values[offset + 2] = pane.scaleVisible.nativeDouble()
          values[offset + 3] = pane.scaleMarginTop
          values[offset + 4] = pane.scaleMarginBottom
          values[offset + 5] = pane.volumeFormat.nativeDouble()
          values[offset + 6] = pane.valueFormat.precision.toDouble()
          values[offset + 7] = pane.valueFormat.minMove
        }
      }

  fun nativePaneStrings(): Array<String> =
      panes.flatMap { listOf(it.paneId, it.priceScaleId) }.toTypedArray()

  companion object {
    const val PANE_NUMBER_WIDTH = 8

    fun fromJson(json: String, density: Float, scaledDensity: Float): ChartConfig =
        ChartConfigJsonDecoder(json, density, scaledDensity).decode()
  }
}

private fun Boolean.nativeDouble() = if (this) 1.0 else 0.0

private fun String.nativeSeriesType() =
    when (this) {
      "bar" -> 1.0
      "hollowCandlestick" -> 2.0
      "line" -> 4.0
      else -> 0.0
    }

private fun String.nativeLineSource() =
    when (this) {
      "open" -> 0.0
      "high" -> 1.0
      "low" -> 2.0
      else -> 3.0
    }
