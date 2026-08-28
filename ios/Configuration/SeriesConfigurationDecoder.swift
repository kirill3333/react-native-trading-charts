// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

enum SeriesConfigurationDecoder {
  static func decode(
    json: String,
    declarative: Bool,
    chartConfig: NativeChartConfig,
    defaults: SeriesAppearanceDefaults
  ) -> NativeSeriesConfig? {
    guard
      let data = json.data(using: .utf8),
      let value = try? JSONSerialization.jsonObject(with: data),
      let item = value as? JSONDictionary
    else { return nil }
    return decode(
      item: item,
      declarative: declarative,
      chartConfig: chartConfig,
      defaults: defaults
    )
  }

  static func decode(
    item: JSONDictionary,
    declarative: Bool,
    chartConfig: NativeChartConfig,
    defaults: SeriesAppearanceDefaults
  ) -> NativeSeriesConfig {
    var config = NativeSeriesConfig()
    let type = item.string("type")
    config.series_id = nativeString(item.string("seriesId"))
    config.pane_id = nativeString(item.string("paneId"))
    config.price_scale_id = nativeString(item.string("priceScaleId"))
    config.visible = item.number("visible")?.boolValue ?? true
    config.declarative = declarative
    switch type {
    case "bar": config.type = .bar
    case "hollowCandlestick": config.type = .hollowCandlestick
    case "histogram": config.type = .histogram
    case "line", "macd": config.type = .line
    case "area": config.type = .area
    default: config.type = .candlestick
    }

    let sourceValue = item["source"]
    let source = sourceValue as? JSONDictionary
    switch source?.string("type") {
    case "ohlcvVolume":
      config.source = .ohlcvVolume
      config.source_series_id = nativeString(source?.stringOrNil("seriesId") ?? "main")
    case "ohlcvRsi":
      config.source = .ohlcvRsi
      config.source_series_id = nativeString(source?.stringOrNil("seriesId") ?? "main")
      config.rsi_period = UInt32(source?.number("period")?.uintValue ?? 14)
      let levels = item.dictionary("levels")
      config.rsi_oversold = levels.number("oversold")?.doubleValue ?? 30
      config.rsi_overbought = levels.number("overbought")?.doubleValue ?? 70
    case "ohlcvMacd":
      config.source = .ohlcvMacd
      config.source_series_id = nativeString(source?.stringOrNil("seriesId") ?? "main")
      config.macd_fast_period = UInt32(source?.number("fastPeriod")?.uintValue ?? 12)
      config.macd_slow_period = UInt32(source?.number("slowPeriod")?.uintValue ?? 26)
      config.macd_signal_period = UInt32(source?.number("signalPeriod")?.uintValue ?? 9)
    case "ohlcvSma", "ohlcvEma":
      config.source = source?.string("type") == "ohlcvSma" ? .ohlcvSma : .ohlcvEma
      config.source_series_id = nativeString(source?.string("seriesId") ?? "")
      let period = source?.number("period")?.uint64Value ?? 0
      config.moving_average_period = period >= 1 && period <= UInt32.max ? UInt32(period) : 0
    default:
      config.source = .data
    }

    let appearance = item.dictionary("appearance")
    config.color = colorFromHex(appearance.stringOrNil("color"), fallback: chartConfig.axis_text)
    config.up = colorFromHex(appearance.stringOrNil("upColor"), fallback: chartConfig.up)
    config.down = colorFromHex(appearance.stringOrNil("downColor"), fallback: chartConfig.down)
    var defaultLevel = config.color
    defaultLevel.a *= 0.5
    var defaultBand = config.color
    defaultBand.a *= 20 / 255
    config.rsi_text_color_set = appearance.stringOrNil("textColor") != nil
    config.rsi_text_color = colorFromHex(appearance.stringOrNil("textColor"), fallback: config.color)
    config.rsi_level_line = colorFromHex(appearance.stringOrNil("levelLineColor"), fallback: defaultLevel)
    config.rsi_band = colorFromHex(appearance.stringOrNil("bandColor"), fallback: defaultBand)

    if config.type == .line || config.type == .area {
      let area = config.type == .area
      let valueSource = (sourceValue as? String) ?? source?.stringOrNil("valueSource") ?? "close"
      switch valueSource {
      case "open": config.line_source = .open
      case "high": config.line_source = .high
      case "low": config.line_source = .low
      default: config.line_source = .close
      }
      config.line_width = appearance.number("width")?.floatValue
        ?? (area ? defaults.areaWidth : defaults.lineWidth)
      config.color = colorFromHex(
        appearance.stringOrNil("color"),
        fallback: area ? defaults.areaColor : defaults.lineColor
      )
      let gradient = appearance.dictionaryOrNil("gradient")
      config.line_gradient_enabled = gradient != nil
      config.line_dashed = appearance.stringOrNil("style") != nil
        ? appearance.string("style") == "dashed"
        : (area ? defaults.areaDashed : defaults.lineDashed)
      config.line_gradient_top = colorFromHex(gradient?.stringOrNil("topColor"), fallback: config.color)
      config.line_gradient_bottom = colorFromHex(gradient?.stringOrNil("bottomColor"), fallback: config.color)
      if area {
        let fill = appearance.dictionary("fill")
        config.area_fill_top = colorFromHex(fill.stringOrNil("topColor"), fallback: defaults.areaFillTop)
        config.area_fill_bottom = colorFromHex(fill.stringOrNil("bottomColor"), fallback: defaults.areaFillBottom)
      }
      config.line_gap_threshold_ms = item.number("gapThresholdMs")?.doubleValue ?? 0
    }

    if config.source == .ohlcvMacd {
      let macdLine = appearance.dictionary("macdLine")
      let signalLine = appearance.dictionary("signalLine")
      let histogram = appearance.dictionary("histogram")
      config.line_width = macdLine.number("width")?.floatValue ?? defaults.lineWidth
      config.color = colorFromHex(macdLine.stringOrNil("color"), fallback: defaults.lineColor)
      config.line_dashed = macdLine.stringOrNil("style") != nil
        ? macdLine.string("style") == "dashed" : defaults.lineDashed
      let macdGradient = macdLine.dictionaryOrNil("gradient")
      config.line_gradient_enabled = macdGradient != nil
      config.line_gradient_top = colorFromHex(macdGradient?.stringOrNil("topColor"), fallback: config.color)
      config.line_gradient_bottom = colorFromHex(macdGradient?.stringOrNil("bottomColor"), fallback: config.color)
      config.macd_signal_line_width = signalLine.number("width")?.floatValue ?? defaults.lineWidth
      config.macd_signal_color = colorFromHex(signalLine.stringOrNil("color"), fallback: chartConfig.axis_text)
      config.macd_signal_line_dashed = signalLine.stringOrNil("style") != nil
        ? signalLine.string("style") == "dashed" : defaults.lineDashed
      let signalGradient = signalLine.dictionaryOrNil("gradient")
      config.macd_signal_gradient_enabled = signalGradient != nil
      config.macd_signal_gradient_top = colorFromHex(
        signalGradient?.stringOrNil("topColor"),
        fallback: config.macd_signal_color
      )
      config.macd_signal_gradient_bottom = colorFromHex(
        signalGradient?.stringOrNil("bottomColor"),
        fallback: config.macd_signal_color
      )
      var positiveFaded = chartConfig.up
      positiveFaded.a *= 0.5
      var negativeFaded = chartConfig.down
      negativeFaded.a *= 0.5
      config.macd_positive_increasing = colorFromHex(
        histogram.stringOrNil("positiveIncreasingColor"), fallback: chartConfig.up)
      config.macd_positive_decreasing = colorFromHex(
        histogram.stringOrNil("positiveDecreasingColor"), fallback: positiveFaded)
      config.macd_negative_increasing = colorFromHex(
        histogram.stringOrNil("negativeIncreasingColor"), fallback: negativeFaded)
      config.macd_negative_decreasing = colorFromHex(
        histogram.stringOrNil("negativeDecreasingColor"), fallback: chartConfig.down)
      config.macd_zero_line = colorFromHex(
        appearance.stringOrNil("zeroLineColor"), fallback: chartConfig.grid)
      config.macd_text_color_set = appearance.stringOrNil("textColor") != nil
      config.macd_text_color = colorFromHex(
        appearance.stringOrNil("textColor"), fallback: chartConfig.axis_text)
    }
    return config
  }
}
