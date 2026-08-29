// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import UIKit

struct OverlayStyle {
  var xAxis: [NSAttributedString.Key: Any]
  var yAxis: [NSAttributedString.Key: Any]
  var extrema: [NSAttributedString.Key: Any]
  var currentPrice: [NSAttributedString.Key: Any]
  var crosshairPrice: [NSAttributedString.Key: Any]
  var crosshairTime: [NSAttributedString.Key: Any]
  var tooltipHeader: [NSAttributedString.Key: Any]
  var tooltipLabel: [NSAttributedString.Key: Any]
  var tooltipValue: [NSAttributedString.Key: Any]
  var tooltipUp: [NSAttributedString.Key: Any]
  var tooltipDown: [NSAttributedString.Key: Any]
  var extremaConnector: UIColor
  var extremaBackground: UIColor
  var crosshairPriceBackground: UIColor
  var crosshairTimeBackground: UIColor
  var tooltipBackground: NativeColor
  var currentPriceBorder: BorderStyle
  var crosshairPriceBorder: BorderStyle
  var crosshairTimeBorder: BorderStyle
  var tooltipBorder: BorderStyle

  static func resolve(_ configuration: ResolvedChartConfiguration) -> OverlayStyle {
    let config = configuration.native
    let appearance = configuration.presentation.dictionary("appearance")
    let xAxis = appearance.dictionary("xAxis")
    let yAxis = appearance.dictionary("yAxis")
    let extrema = appearance.dictionary("priceExtremes")
    let currentLabel = appearance.dictionary("currentPrice").dictionary("label")
    let crosshair = appearance.dictionary("crosshair")
    let crosshairPrice = crosshair.dictionary("priceLabel")
    let crosshairTime = crosshair.dictionary("timeLabel")
    let tooltip = appearance.dictionary("tooltip")
    let tooltipValue = textAttributes(
      tooltip.dictionary("valueText"), fallback: config.tooltip_text,
      size: 11, weight: .medium)
    var tooltipUp = tooltipValue
    tooltipUp[.foregroundColor] = uiColor(colorFromHex(
      tooltip.stringOrNil("positiveValueColor"), fallback: config.up))
    var tooltipDown = tooltipValue
    tooltipDown[.foregroundColor] = uiColor(colorFromHex(
      tooltip.stringOrNil("negativeValueColor"), fallback: config.down))
    return OverlayStyle(
      xAxis: textAttributes(xAxis.dictionary("text"), fallback: config.axis_text, size: 10.5, weight: .regular),
      yAxis: textAttributes(yAxis.dictionary("text"), fallback: config.axis_text, size: 10.5, weight: .regular),
      extrema: textAttributes(extrema.dictionary("text"), fallback: config.axis_text, size: 10.5, weight: .regular),
      currentPrice: textAttributes(
        currentLabel.dictionary("text"), fallback: blackColor(), size: 11, weight: .semibold
      ),
      crosshairPrice: textAttributes(
        crosshairPrice.dictionary("text"), fallback: blackColor(), size: 11, weight: .semibold
      ),
      crosshairTime: textAttributes(
        crosshairTime.dictionary("text"), fallback: blackColor(), size: 10.5, weight: .semibold
      ),
      tooltipHeader: textAttributes(
        tooltip.dictionary("headerText"), fallback: config.tooltip_text, size: 11, weight: .medium
      ),
      tooltipLabel: textAttributes(
        tooltip.dictionary("labelText"), fallback: config.tooltip_text, size: 11, weight: .medium
      ),
      tooltipValue: tooltipValue,
      tooltipUp: tooltipUp,
      tooltipDown: tooltipDown,
      extremaConnector: uiColor(colorFromHex(extrema.stringOrNil("connectorColor"), fallback: config.axis_text)),
      extremaBackground: uiColor(colorFromHex(extrema.stringOrNil("backgroundColor"), fallback: config.background)),
      crosshairPriceBackground: uiColor(colorFromHex(
        crosshairPrice.stringOrNil("backgroundColor"), fallback: config.crosshair
      )),
      crosshairTimeBackground: uiColor(colorFromHex(
        crosshairTime.stringOrNil("backgroundColor"), fallback: config.crosshair
      )),
      tooltipBackground: colorFromHex(tooltip.stringOrNil("backgroundColor"), fallback: config.tooltip_background),
      currentPriceBorder: border(currentLabel.dictionary("border"), fallbackRadius: 4),
      crosshairPriceBorder: border(crosshairPrice.dictionary("border"), fallbackRadius: 4),
      crosshairTimeBorder: border(crosshairTime.dictionary("border"), fallbackRadius: 4),
      tooltipBorder: border(tooltip.dictionary("border"), fallbackRadius: 8)
    )
  }

  private static func blackColor() -> NativeColor {
    var color = NativeColor(); color.r = 0; color.g = 0; color.b = 0; color.a = 1
    return color
  }

  private static func textAttributes(
    _ value: JSONDictionary,
    fallback: NativeColor,
    size: CGFloat,
    weight: UIFont.Weight
  ) -> [NSAttributedString.Key: Any] {
    let fontSize = value.number("fontSize")?.doubleValue ?? size
    let family = value.string("fontFamily")
    let selectedWeight: UIFont.Weight
    switch value.string("fontWeight") {
    case "regular": selectedWeight = .regular
    case "medium": selectedWeight = .medium
    case "semibold": selectedWeight = .semibold
    case "bold": selectedWeight = .bold
    default: selectedWeight = weight
    }
    let font = (!family.isEmpty ? UIFont(name: family, size: fontSize) : nil)
      ?? UIFont.monospacedDigitSystemFont(ofSize: fontSize, weight: selectedWeight)
    return [
      .font: font,
      .foregroundColor: uiColor(colorFromHex(value.stringOrNil("color"), fallback: fallback))
    ]
  }

  private static func border(_ value: JSONDictionary, fallbackRadius: CGFloat) -> BorderStyle {
    var transparent = NativeColor(); transparent.r = 0; transparent.g = 0
    transparent.b = 0; transparent.a = 0
    return BorderStyle(
      color: uiColor(colorFromHex(value.stringOrNil("color"), fallback: transparent)),
      width: value.number("width")?.doubleValue ?? 0,
      radius: value.number("radius")?.doubleValue ?? fallbackRadius
    )
  }
}
