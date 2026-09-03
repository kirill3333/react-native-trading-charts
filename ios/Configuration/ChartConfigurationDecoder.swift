// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

typealias JSONDictionary = [String: Any]

struct SeriesAppearanceDefaults {
  var lineWidth: Float
  var lineColor: NativeColor
  var lineGradientTop: NativeColor
  var lineGradientBottom: NativeColor
  var lineGradientEnabled: Bool
  var lineDashed: Bool
  var areaWidth: Float
  var areaColor: NativeColor
  var areaGradientTop: NativeColor
  var areaGradientBottom: NativeColor
  var areaGradientEnabled: Bool
  var areaDashed: Bool
  var areaFillTop: NativeColor
  var areaFillBottom: NativeColor
}

struct ResolvedChartConfiguration {
  var native: NativeChartConfig
  var panes: NativePaneVector
  var panesResizable: Bool
  var presentation: JSONDictionary
  var appearances: SeriesAppearanceDefaults
  var additionalSeries: [JSONDictionary]
}

enum ChartConfigurationDecoder {
  static func decode(_ json: String) -> ResolvedChartConfiguration? {
    guard
      let data = json.data(using: .utf8),
      let root = try? JSONSerialization.jsonObject(with: data),
      let root = root as? JSONDictionary
    else { return nil }

    var config = NativeChartConfig()
    let theme = root.dictionary("theme")
    let appearance = root.dictionary("appearance")
    let gridAppearance = appearance.dictionary("grid")
    let candlesAppearance = appearance.dictionary("candles")
    let barsAppearance = appearance.dictionary("bars")
    let lineAppearance = appearance.dictionary("line")
    let areaAppearance = appearance.dictionary("area")
    let series = root.dictionary("series")
    let seriesType = series.string("type")
    let usesBars = seriesType == "bar"
    let usesLine = seriesType == "line"
    let usesArea = seriesType == "area"
    let usesHollowCandlesticks = seriesType == "hollowCandlestick"

    config.candle_radius = candlesAppearance.float("radius")
    let selectedSeriesAppearance = usesBars ? barsAppearance : candlesAppearance
    let currentAppearance = appearance.dictionary("currentPrice")
    let currentLineAppearance = currentAppearance.dictionary("line")
    let currentLabelAppearance = currentAppearance.dictionary("label")
    let crosshairAppearance = appearance.dictionary("crosshair")
    let crosshairLineAppearance = crosshairAppearance.dictionary("line")
    let tooltipAppearance = appearance.dictionary("tooltip")
    let xAxis = root.dictionary("xAxis")
    let yAxis = root.dictionary("yAxis")
    let format = yAxis.dictionary("valueFormat")
    let gestures = root.dictionary("gestures")
    let current = root.dictionary("currentPrice")
    let priceExtremes = root.dictionary("priceExtremes")
    let crosshair = root.dictionary("crosshair")
    let tooltipLabels = crosshair.dictionary("tooltipLabels")
    let resolution = root.dictionary("resolution")
    let tradeAggregation = root.dictionary("tradeAggregation")
    let bucketOrigin = tradeAggregation.dictionary("bucketOrigin")

    switch resolution.string("unit") {
    case "second": config.resolution.unit = .second
    case "minute": config.resolution.unit = .minute
    case "hour": config.resolution.unit = .hour
    case "day": config.resolution.unit = .day
    case "week": config.resolution.unit = .week
    case "month": config.resolution.unit = .month
    default: config.resolution.unit = .fixed
    }
    config.resolution.multiplier = UInt32(resolution.uint("multiplier"))
    config.resolution.fixed_duration_ms = config.resolution.unit == .fixed
      ? Int64(resolution.double("durationMs")) : 60_000

    switch bucketOrigin.string("type") {
    case "session": config.trade_aggregation.bucket_origin = .session
    case "timestamp": config.trade_aggregation.bucket_origin = .timestamp
    default: config.trade_aggregation.bucket_origin = .epoch
    }
    config.trade_aggregation.origin_timestamp_ms = Int64(bucketOrigin.double("timestamp"))
    config.trade_aggregation.outside_session =
      tradeAggregation.string("outsideSession") == "reject" ? .reject : .ignore
    config.trade_aggregation.candle_timestamp =
      tradeAggregation.string("candleTimestamp") == "tradingDateUtc"
      ? .tradingDateUtc : .bucketStart
    config.trade_aggregation.calendar = calendarConfig(tradeAggregation.dictionaryOrNil("calendar"))

    config.initial_visible_count = Int32(root.int("initialVisibleCount"))
    config.default_scale = root.number("defaultScale")?.doubleValue ?? 1
    config.default_y_scale = yAxis.number("defaultScale")?.doubleValue ?? 1
    config.background = colorFromHex(appearance.stringOrNil("backgroundColor"), fallback: config.background)
    config.grid = colorFromHex(gridAppearance.stringOrNil("color"), fallback: config.grid)
    config.axis_text = colorFromHex(theme.stringOrNil("axisTextColor"), fallback: config.axis_text)
    config.series_type = usesBars ? .bar
      : (usesHollowCandlesticks ? .hollowCandlestick
          : (usesLine ? .line : (usesArea ? .area : .candlestick)))
    config.bar_line_width = barsAppearance.number("lineWidth")?.floatValue ?? 1

    let lineWidth = lineAppearance.number("width")?.floatValue ?? 1.5
    let lineColor = colorFromHex(lineAppearance.stringOrNil("color"), fallback: config.up)
    let lineGradient = lineAppearance.dictionaryOrNil("gradient")
    let lineGradientEnabled = lineGradient != nil
    let lineDashed = lineAppearance.string("style") == "dashed"
    let lineGradientTop = colorFromHex(lineGradient?.stringOrNil("topColor"), fallback: lineColor)
    let lineGradientBottom = colorFromHex(lineGradient?.stringOrNil("bottomColor"), fallback: lineColor)

    let areaWidth = areaAppearance.number("width")?.floatValue ?? 1.5
    let areaColor = colorFromHex(areaAppearance.stringOrNil("color"), fallback: config.up)
    let areaGradient = areaAppearance.dictionaryOrNil("gradient")
    let areaGradientEnabled = areaGradient != nil
    let areaDashed = areaAppearance.string("style") == "dashed"
    let areaGradientTop = colorFromHex(areaGradient?.stringOrNil("topColor"), fallback: areaColor)
    let areaGradientBottom = colorFromHex(areaGradient?.stringOrNil("bottomColor"), fallback: areaColor)
    let areaFill = areaAppearance.dictionary("fill")
    let areaFillTop = colorFromHex(areaFill.stringOrNil("topColor"), fallback: config.area_fill_top)
    let areaFillBottom = colorFromHex(areaFill.stringOrNil("bottomColor"), fallback: config.area_fill_bottom)

    let defaults = SeriesAppearanceDefaults(
      lineWidth: lineWidth,
      lineColor: lineColor,
      lineGradientTop: lineGradientTop,
      lineGradientBottom: lineGradientBottom,
      lineGradientEnabled: lineGradientEnabled,
      lineDashed: lineDashed,
      areaWidth: areaWidth,
      areaColor: areaColor,
      areaGradientTop: areaGradientTop,
      areaGradientBottom: areaGradientBottom,
      areaGradientEnabled: areaGradientEnabled,
      areaDashed: areaDashed,
      areaFillTop: areaFillTop,
      areaFillBottom: areaFillBottom
    )

    config.line_width = usesArea ? areaWidth : lineWidth
    config.line = usesArea ? areaColor : lineColor
    config.line_gradient_enabled = usesArea ? areaGradientEnabled : lineGradientEnabled
    config.line_dashed = usesArea ? areaDashed : lineDashed
    config.line_gradient_top = usesArea ? areaGradientTop : lineGradientTop
    config.line_gradient_bottom = usesArea ? areaGradientBottom : lineGradientBottom
    config.area_fill_top = areaFillTop
    config.area_fill_bottom = areaFillBottom
    switch series.string("source") {
    case "open": config.line_source = .open
    case "high": config.line_source = .high
    case "low": config.line_source = .low
    default: config.line_source = .close
    }
    config.line_gap_threshold_ms = series.number("gapThresholdMs")?.doubleValue ?? 0
    config.up = colorFromHex(selectedSeriesAppearance.stringOrNil("upColor"), fallback: config.up)
    config.down = colorFromHex(selectedSeriesAppearance.stringOrNil("downColor"), fallback: config.down)
    config.crosshair = colorFromHex(crosshairLineAppearance.stringOrNil("color"), fallback: config.crosshair)
    config.tooltip_background = colorFromHex(
      tooltipAppearance.stringOrNil("backgroundColor"),
      fallback: config.tooltip_background
    )
    config.tooltip_text = colorFromHex(
      tooltipAppearance.dictionary("valueText").stringOrNil("color"),
      fallback: config.tooltip_text
    )
    config.grid_opacity = gridAppearance.number("opacity")?.floatValue ?? 0.75
    config.crosshair_opacity = crosshairLineAppearance.number("opacity")?.floatValue ?? 0.85
    config.current_price_line_up = colorFromHex(currentLineAppearance.stringOrNil("upColor"), fallback: config.up)
    config.current_price_line_down = colorFromHex(currentLineAppearance.stringOrNil("downColor"), fallback: config.down)
    config.current_price_label_up = colorFromHex(
      currentLabelAppearance.stringOrNil("upBackgroundColor"),
      fallback: config.up
    )
    config.current_price_label_down = colorFromHex(
      currentLabelAppearance.stringOrNil("downBackgroundColor"),
      fallback: config.down
    )

    config.show_x_axis = xAxis.bool("visible")
    config.x_axis_height = xAxis.float("height")
    config.x_locale = nativeString(xAxis.stringOrNil("locale") ?? "en-GB")
    config.x_time_zone = nativeString(xAxis.stringOrNil("timeZone") ?? "UTC")
    config.show_seconds = xAxis.bool("showSeconds")
    config.logical_spacing = xAxis.string("spacing") == "logical"
    config.show_y_axis = yAxis.bool("visible")
    config.y_axis_width = yAxis.float("width")
    let scaleMargins = yAxis.dictionary("scaleMargins")
    config.y_scale_margin_top = scaleMargins.double("top")
    config.y_scale_margin_bottom = scaleMargins.double("bottom")
    config.compact_values = format.string("type") == "compact"
    config.precision = Int32(format.int("precision"))
    config.min_move = format.number("minMove")?.doubleValue ?? 0.01
    config.y_locale = nativeString(format.stringOrNil("locale") ?? "en-GB")
    config.currency_symbol = nativeString(format.stringOrNil("currencySymbol") ?? "")
    config.use_grouping = format.number("useGrouping")?.boolValue ?? true
    config.allow_pan = gestures.bool("pan")
    config.allow_zoom = gestures.bool("zoom")
    config.allow_y_axis_scale = gestures.number("yAxisScale")?.boolValue ?? config.allow_zoom
    config.show_current_price = current.bool("visible")
    config.show_current_price_label = current.bool("showLabel")
    config.pin_current_price_to_edge = current.number("pinToEdge")?.boolValue ?? true
    config.show_price_extremes = priceExtremes.number("visible")?.boolValue ?? true
    config.crosshair_enabled = crosshair.bool("enabled")
    config.show_tooltip = crosshair.bool("showTooltip")
    config.tooltip_background_opacity = tooltipAppearance.number("backgroundOpacity")?.floatValue ?? 1
    config.crosshair_dashed = crosshair.string("lineStyle") == "dashed"
    config.tooltip_label_open = nativeString(tooltipLabels.stringOrNil("open") ?? "Open")
    config.tooltip_label_close = nativeString(tooltipLabels.stringOrNil("close") ?? "Close")
    config.tooltip_label_high = nativeString(tooltipLabels.stringOrNil("high") ?? "High")
    config.tooltip_label_low = nativeString(tooltipLabels.stringOrNil("low") ?? "Low")
    config.tooltip_label_amplitude = nativeString(tooltipLabels.stringOrNil("amplitude") ?? "Amplitude")
    config.tooltip_label_change_percent = nativeString(tooltipLabels.stringOrNil("changePercent") ?? "Change %")
    config.tooltip_label_change = nativeString(tooltipLabels.stringOrNil("change") ?? "Change")
    config.tooltip_label_volume = nativeString(tooltipLabels.stringOrNil("volume") ?? "Volume")

    var panes = NativePaneVector()
    let paneItems = root.array("panes").compactMap { $0 as? JSONDictionary }
    for item in paneItems {
      let scale = item.dictionary("priceScale")
      let margins = scale.dictionary("scaleMargins")
      let valueFormat = scale.dictionary("valueFormat")
      var pane = NativePaneConfig()
      pane.pane_id = nativeString(item.string("paneId"))
      pane.price_scale_id = nativeString(scale.string("priceScaleId"))
      pane.height_weight = item.double("heightWeight")
      pane.min_height = item.float("minHeight")
      pane.scale_visible = scale.bool("visible")
      pane.scale_margin_top = margins.double("top")
      pane.scale_margin_bottom = margins.double("bottom")
      pane.volume_format = valueFormat.string("type") == "volume"
      pane.precision = Int32(valueFormat.int("precision"))
      pane.min_move = valueFormat.number("minMove")?.doubleValue
        ?? (pane.volume_format ? 1 : config.min_move)
      appendNativePane(&panes, pane)
    }

    return ResolvedChartConfiguration(
      native: config,
      panes: panes,
      panesResizable: root.bool("panesResizable") && paneItems.count > 1,
      presentation: root,
      appearances: defaults,
      additionalSeries: root.array("additionalSeries").compactMap { $0 as? JSONDictionary }
    )
  }

  private static func calendarConfig(_ value: JSONDictionary?) -> NativeTradingCalendarConfig {
    var result = NativeTradingCalendarConfig()
    guard let value else { return result }
    result.configured = true
    let timeZoneName = value.stringOrNil("timeZone") ?? "UTC"
    result.time_zone = nativeString(timeZoneName)
    result.transitions = timeZoneTransitions(TimeZone(identifier: timeZoneName) ?? TimeZone(secondsFromGMT: 0)!)
    result.transition_range_start_ms = 0
    result.transition_range_end_ms = 4_133_980_800_000
    result.week_starts_on = value.string("weekStartsOn") == "sunday" ? 7 : 1

    var sessions = NativeSessionVector()
    for item in value.array("sessions").compactMap({ $0 as? JSONDictionary }) {
      var weekdayMask: UInt8 = 0
      for weekday in item.array("weekdays").compactMap({ ($0 as? NSNumber)?.intValue })
        where (1...7).contains(weekday) {
        weekdayMask |= UInt8(1 << (weekday - 1))
      }
      appendNativeSession(&sessions, sessionConfig(item, weekdayMask: weekdayMask))
    }
    result.sessions = sessions

    var holidays = NativeDateVector()
    for item in value.array("holidays").compactMap({ $0 as? String }) {
      appendNativeDate(&holidays, civilDate(item))
    }
    result.holidays = holidays

    var overrides = NativeOverrideVector()
    for item in value.array("overrides").compactMap({ $0 as? JSONDictionary }) {
      var nativeOverride = NativeCalendarOverride()
      nativeOverride.date = civilDate(item.string("date"))
      var overrideSessions = NativeSessionVector()
      for session in item.array("sessions").compactMap({ $0 as? JSONDictionary }) {
        appendNativeSession(&overrideSessions, sessionConfig(session, weekdayMask: 0))
      }
      nativeOverride.sessions = overrideSessions
      appendNativeOverride(&overrides, nativeOverride)
    }
    result.overrides = overrides
    return result
  }

  private static func timeZoneTransitions(
    _ timeZone: TimeZone
  ) -> NativeTransitionVector {
    TimeZoneTransitionCache.shared.transitions(for: timeZone)
  }

  private static func sessionConfig(
    _ value: JSONDictionary,
    weekdayMask: UInt8
  ) -> NativeTradingSession {
    var result = NativeTradingSession()
    result.weekday_mask = weekdayMask
    result.start_seconds = Int32(value.int("startSeconds"))
    result.end_seconds = Int32(value.int("endSeconds"))
    result.start_day_offset = Int32(value.int("startDayOffset"))
    result.end_day_offset = Int32(value.int("endDayOffset"))
    return result
  }

  private static func civilDate(_ value: String) -> NativeCivilDate {
    let components = value.split(separator: "-").compactMap { Int32($0) }
    var result = NativeCivilDate()
    if components.count == 3 {
      result.year = components[0]
      result.month = components[1]
      result.day = components[2]
    }
    return result
  }
}

private final class TimeZoneTransitionCache {
  static let shared = TimeZoneTransitionCache()
  private let lock = NSLock()
  private var values: [String: [(Int64, Int32)]] = [:]

  func transitions(for timeZone: TimeZone) -> NativeTransitionVector {
    lock.lock()
    let cached = values[timeZone.identifier]
    lock.unlock()
    let tuples = cached ?? buildTransitions(for: timeZone)
    if cached == nil {
      lock.lock()
      values[timeZone.identifier] = tuples
      lock.unlock()
    }
    var result = NativeTransitionVector()
    for (timestamp, offset) in tuples {
      var transition = NativeTimeZoneTransition()
      transition.at_utc_ms = timestamp
      transition.offset_seconds = offset
      appendNativeTransition(&result, transition)
    }
    return result
  }

  private func buildTransitions(for timeZone: TimeZone) -> [(Int64, Int32)] {
    let epoch = Date(timeIntervalSince1970: 0)
    let end = Date(timeIntervalSince1970: 4_133_980_800)
    var result: [(Int64, Int32)] = [
      (0, Int32(timeZone.secondsFromGMT(for: epoch)))
    ]
    var cursor = epoch.addingTimeInterval(-1)
    while let transition = timeZone.nextDaylightSavingTimeTransition(after: cursor), transition < end {
      let after = transition.addingTimeInterval(1)
      result.append((
        Int64((transition.timeIntervalSince1970 * 1_000).rounded()),
        Int32(timeZone.secondsFromGMT(for: after))
      ))
      cursor = after
    }
    return result
  }
}

func colorFromHex(_ value: String?, fallback: NativeColor) -> NativeColor {
  guard let value else { return fallback }
  let hex = value.replacingOccurrences(of: "#", with: "").uppercased()
  guard hex.count == 6 || hex.count == 8, let raw = UInt64(hex, radix: 16) else {
    return fallback
  }
  var result = NativeColor()
  if hex.count == 6 {
    result.r = Float((raw >> 16) & 0xff) / 255
    result.g = Float((raw >> 8) & 0xff) / 255
    result.b = Float(raw & 0xff) / 255
    result.a = 1
  } else {
    result.r = Float((raw >> 24) & 0xff) / 255
    result.g = Float((raw >> 16) & 0xff) / 255
    result.b = Float((raw >> 8) & 0xff) / 255
    result.a = Float(raw & 0xff) / 255
  }
  return result
}

extension Dictionary where Key == String, Value == Any {
  func dictionary(_ key: String) -> JSONDictionary { self[key] as? JSONDictionary ?? [:] }
  func dictionaryOrNil(_ key: String) -> JSONDictionary? { self[key] as? JSONDictionary }
  func array(_ key: String) -> [Any] { self[key] as? [Any] ?? [] }
  func number(_ key: String) -> NSNumber? { self[key] as? NSNumber }
  func stringOrNil(_ key: String) -> String? { self[key] as? String }
  func string(_ key: String) -> String { stringOrNil(key) ?? "" }
  func bool(_ key: String) -> Bool { number(key)?.boolValue ?? false }
  func int(_ key: String) -> Int { number(key)?.intValue ?? 0 }
  func uint(_ key: String) -> UInt { number(key)?.uintValue ?? 0 }
  func float(_ key: String) -> Float { number(key)?.floatValue ?? 0 }
  func double(_ key: String) -> Double { number(key)?.doubleValue ?? 0 }
}
