// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

private final class ValueFormatter {
  let numberFormatter: NumberFormatter
  let currencySymbol: String
  let compact: Bool
  let significant: Bool
  let significantDigits: Int

  init(
    numberFormatter: NumberFormatter,
    currencySymbol: String,
    compact: Bool,
    significant: Bool,
    significantDigits: Int
  ) {
    self.numberFormatter = numberFormatter
    self.currencySymbol = currencySymbol
    self.compact = compact
    self.significant = significant
    self.significantDigits = significantDigits
  }
}

final class ChartFormatters {
  private var valueFormatters: [String: ValueFormatter] = [:]
  private var percentageFormatter = NumberFormatter()
  private var volumeFormatter = NumberFormatter()
  private var axisDateFormatters: [DateFormatter] = []
  private var crosshairTimeFormatter = DateFormatter()
  private var tooltipHeaderFormatter = DateFormatter()

  private let formattedValueCache = NSCache<NSString, NSString>()
  private let formattedTimeCache = NSCache<NSString, NSString>()
  private let formattedPercentageCache = NSCache<NSNumber, NSString>()
  private let formattedVolumeCache = NSCache<NSString, NSString>()

  init() {
    formattedValueCache.countLimit = 512
    formattedTimeCache.countLimit = 512
    formattedPercentageCache.countLimit = 256
    formattedVolumeCache.countLimit = 256
  }

  func configure(_ configuration: ResolvedChartConfiguration) {
    let config = configuration.native
    let formatters = configuration.presentation.dictionary("formatters")
    let price = formatters.dictionary("price")
    valueFormatters = [
      "yAxis": makeValueFormatter(price.dictionary("yAxis"), fallback: config),
      "priceExtremes": makeValueFormatter(price.dictionary("priceExtremes"), fallback: config),
      "currentPrice": makeValueFormatter(price.dictionary("currentPrice"), fallback: config),
      "crosshairPrice": makeValueFormatter(price.dictionary("crosshairPrice"), fallback: config),
      "tooltip": makeValueFormatter(price.dictionary("tooltip"), fallback: config),
    ]
    for pane in configuration.presentation.array("panes").compactMap({ $0 as? JSONDictionary }) {
      let scale = pane.dictionary("priceScale")
      let scaleId = scale.string("priceScaleId")
      guard !scaleId.isEmpty else { continue }
      valueFormatters["scale:\(scaleId)"] = makeValueFormatter(
        scale.dictionary("valueFormat"), fallback: config)
    }

    let axisFormatter = valueFormatters["yAxis"]!
    percentageFormatter = NumberFormatter()
    percentageFormatter.locale = axisFormatter.numberFormatter.locale
    percentageFormatter.numberStyle = .decimal
    percentageFormatter.usesGroupingSeparator = false
    percentageFormatter.minimumFractionDigits = 2
    percentageFormatter.maximumFractionDigits = 2
    volumeFormatter = NumberFormatter()
    volumeFormatter.locale = axisFormatter.numberFormatter.locale
    volumeFormatter.numberStyle = .decimal
    volumeFormatter.usesGroupingSeparator = axisFormatter.numberFormatter.usesGroupingSeparator
    volumeFormatter.minimumFractionDigits = 0
    volumeFormatter.maximumFractionDigits = 2

    let date = formatters.dictionary("date")
    let axisDate = date.dictionary("xAxis")
    let locale = axisDate.stringOrNil("locale") ?? "en-GB"
    let zone = axisDate.stringOrNil("timeZone") ?? "UTC"
    let keys = ["seconds", "time", "day", "month", "year"]
    let fallbacks = ["HH:mm:ss", "HH:mm", "d MMM", "MMM yyyy", "yyyy"]
    axisDateFormatters = zip(keys, fallbacks).map {
      makeDateFormatter(
        pattern: axisDate.stringOrNil($0.0), locale: locale,
        timeZone: zone, fallback: $0.1)
    }
    let crosshair = date.dictionary("crosshairTimeBadge")
    crosshairTimeFormatter = makeDateFormatter(
      pattern: crosshair.stringOrNil("pattern"),
      locale: crosshair.stringOrNil("locale") ?? locale,
      timeZone: crosshair.stringOrNil("timeZone") ?? zone,
      fallback: "d MMM yyyy HH:mm:ss"
    )
    let tooltip = date.dictionary("tooltipHeader")
    tooltipHeaderFormatter = makeDateFormatter(
      pattern: tooltip.stringOrNil("pattern"),
      locale: tooltip.stringOrNil("locale") ?? locale,
      timeZone: tooltip.stringOrNil("timeZone") ?? zone,
      fallback: "d MMM yyyy HH:mm:ss"
    )
    formattedValueCache.removeAllObjects()
    formattedTimeCache.removeAllObjects()
    formattedPercentageCache.removeAllObjects()
    formattedVolumeCache.removeAllObjects()
  }

  func formatValue(_ value: Double, role: String) -> String {
    let cacheKey = "\(role)\u{1f}\(NSNumber(value: value).stringValue)" as NSString
    if let cached = formattedValueCache.object(forKey: cacheKey) { return cached as String }
    let formatter = valueFormatters[role] ?? valueFormatters["yAxis"]!
    let result: String
    if formatter.significant {
      let rounded = roundToSignificant(value, digits: formatter.significantDigits)
      let number = cryptoZeroCount(rounded, formatter: formatter)
        ?? formatter.numberFormatter.string(from: NSNumber(value: rounded))
        ?? String(format: "%g", rounded)
      result = formatter.currencySymbol + number
    } else {
      let compact = compactValue(value, enabled: formatter.compact)
      let number = formatter.numberFormatter.string(from: NSNumber(value: compact.value))
        ?? String(format: "%g", compact.value)
      result = formatter.currencySymbol + number + compact.suffix
    }
    formattedValueCache.setObject(result as NSString, forKey: cacheKey)
    return result
  }

  func formatPercentage(_ value: Double, valid: Bool) -> String {
    guard valid else { return "—" }
    let key = NSNumber(value: value)
    if let cached = formattedPercentageCache.object(forKey: key) { return cached as String }
    let result = (percentageFormatter.string(from: key) ?? String(format: "%.2f", value)) + "%"
    formattedPercentageCache.setObject(result as NSString, forKey: key)
    return result
  }

  func formatVolume(_ value: Double, scaleId: String = "main") -> String {
    let key = "\(scaleId)\u{1f}\(NSNumber(value: value).stringValue)" as NSString
    if let cached = formattedVolumeCache.object(forKey: key) { return cached as String }
    let compact = compactValue(value, enabled: true)
    let formatter = valueFormatters["scale:\(scaleId)"]?.numberFormatter ?? volumeFormatter
    let number = formatter.string(from: NSNumber(value: compact.value))
      ?? String(format: "%g", compact.value)
    let result = number + compact.suffix
    formattedVolumeCache.setObject(result as NSString, forKey: key)
    return result
  }

  func timeFormatIndex(for frame: ChartRenderFrame, showSeconds: Bool) -> Int {
    let span = frame.visibleXMax - frame.visibleXMin
    if span <= 5 * 60 * 1_000 || (showSeconds && span <= 2 * 60 * 60 * 1_000) { return 0 }
    if span <= 2 * 24 * 60 * 60 * 1_000 { return 1 }
    if span <= 180 * 24 * 60 * 60 * 1_000 { return 2 }
    if span <= 2 * 365 * 24 * 60 * 60 * 1_000 { return 3 }
    return 4
  }

  func formatTime(_ timestamp: Double, index: Int, full: Bool, tooltip: Bool) -> String {
    let milliseconds = Int64(timestamp.rounded())
    let key = "\(milliseconds)\u{1f}\(index)\u{1f}\(full)\u{1f}\(tooltip)" as NSString
    if let cached = formattedTimeCache.object(forKey: key) { return cached as String }
    let date = Date(timeIntervalSince1970: timestamp / 1_000)
    let formatter = full
      ? (tooltip ? tooltipHeaderFormatter : crosshairTimeFormatter)
      : axisDateFormatters[min(max(index, 0), axisDateFormatters.count - 1)]
    let result = formatter.string(from: date)
    formattedTimeCache.setObject(result as NSString, forKey: key)
    return result
  }

  private func makeValueFormatter(
    _ json: JSONDictionary,
    fallback: NativeChartConfig
  ) -> ValueFormatter {
    let locale = json.stringOrNil("locale") ?? String(fallback.y_locale)
    let compact = json.stringOrNil("type") != nil
      ? json.string("type") == "compact" : fallback.compact_values
    let significant = json.string("type") == "significant"
    let precision = json.number("precision")?.intValue ?? Int(fallback.precision)
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: locale)
    formatter.numberStyle = .decimal
    formatter.usesGroupingSeparator = json.number("useGrouping")?.boolValue ?? fallback.use_grouping
    formatter.minimumFractionDigits = compact || significant ? 0 : precision
    formatter.maximumFractionDigits = significant ? 12 : precision
    return ValueFormatter(
      numberFormatter: formatter,
      currencySymbol: json.stringOrNil("currencySymbol") ?? String(fallback.currency_symbol),
      compact: compact,
      significant: significant,
      significantDigits: json.number("significantDigits")?.intValue ?? 3
    )
  }

  private func makeDateFormatter(
    pattern: String?, locale: String, timeZone: String, fallback: String
  ) -> DateFormatter {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: locale)
    formatter.timeZone = TimeZone(identifier: timeZone) ?? .current
    formatter.dateFormat = pattern?.isEmpty == false ? pattern : fallback
    return formatter
  }

  private func compactValue(_ value: Double, enabled: Bool) -> (value: Double, suffix: String) {
    guard enabled else { return (value, "") }
    switch abs(value) {
    case 1e12...: return (value / 1e12, "T")
    case 1e9...: return (value / 1e9, "B")
    case 1e6...: return (value / 1e6, "M")
    case 1e3...: return (value / 1e3, "K")
    default: return (value, "")
    }
  }

  private func roundToSignificant(_ value: Double, digits: Int) -> Double {
    let magnitude = abs(value)
    guard magnitude != 0, magnitude.isFinite else { return value }
    var exponent = floor(log10(magnitude))
    let multiplier = pow(10, Double(digits - 1))
    var normalized = magnitude / pow(10, exponent)
    normalized = (normalized * multiplier).rounded() / multiplier
    if normalized >= 10 { normalized = 1; exponent += 1 }
    let rounded = normalized * pow(10, exponent)
    return value < 0 ? -rounded : rounded
  }

  private func cryptoZeroCount(_ value: Double, formatter: ValueFormatter) -> String? {
    let magnitude = abs(value)
    guard magnitude != 0, magnitude.isFinite else { return nil }
    let exponent = Int(floor(log10(magnitude)))
    let zeroCount = -exponent - 1
    guard zeroCount >= 1 else { return nil }
    let multiplier = pow(10, Double(formatter.significantDigits - 1))
    let normalized = magnitude / pow(10, Double(exponent))
    var significant = String(Int64((normalized * multiplier).rounded()))
    while significant.count > 1, significant.last == "0" { significant.removeLast() }
    let subscripts = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"]
    let subscriptCount = String(zeroCount).compactMap { Int(String($0)) }.map { subscripts[$0] }.joined()
    return (value < 0 ? "-" : "") + "0" + (formatter.numberFormatter.decimalSeparator ?? ".")
      + "0" + subscriptCount + significant
  }
}
