// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

private final class ValueFormatter {
  let cacheID: UInt16
  let numberFormatter: NumberFormatter
  let currencySymbol: String
  let compact: Bool
  let significant: Bool
  let significantDigits: Int

  init(
    cacheID: UInt16,
    numberFormatter: NumberFormatter,
    currencySymbol: String,
    compact: Bool,
    significant: Bool,
    significantDigits: Int
  ) {
    self.cacheID = cacheID
    self.numberFormatter = numberFormatter
    self.currencySymbol = currencySymbol
    self.compact = compact
    self.significant = significant
    self.significantDigits = significantDigits
  }
}

struct ChartValueFormatterToken {
  fileprivate let formatterID: UInt16
}

struct ChartVolumeFormatterToken {
  fileprivate let formatterID: UInt16?
}

private struct FormattedValueKey: Hashable {
  let formatterID: UInt16
  let valueBits: UInt64
}

private struct FormattedTimeKey: Hashable {
  let formatterID: UInt16
  let milliseconds: Int64
}

private struct BoundedStringCache<Key: Hashable> {
  private let capacity: Int
  private var values: [Key: String]
  private var evictionSlots: [Key?]
  private var nextEvictionIndex = 0

  init(capacity: Int) {
    precondition(capacity > 0)
    self.capacity = capacity
    var values: [Key: String] = [:]
    values.reserveCapacity(capacity)
    self.values = values
    evictionSlots = Array(repeating: nil, count: capacity)
  }

  func value(for key: Key) -> String? {
    values[key]
  }

  mutating func insert(_ value: String, for key: Key) {
    if values.updateValue(value, forKey: key) != nil { return }
    if let evictedKey = evictionSlots[nextEvictionIndex] {
      values.removeValue(forKey: evictedKey)
    }
    evictionSlots[nextEvictionIndex] = key
    nextEvictionIndex = (nextEvictionIndex + 1) % capacity
  }

  mutating func removeAll() {
    values.removeAll(keepingCapacity: true)
    for index in evictionSlots.indices { evictionSlots[index] = nil }
    nextEvictionIndex = 0
  }
}

final class ChartFormatters {
  private var valueFormatterIndices: [String: UInt16] = [:]
  private var valueFormatters: [ValueFormatter] = []
  private var percentageFormatter = NumberFormatter()
  private var volumeFormatter = NumberFormatter()
  private var axisDateFormatters: [DateFormatter] = []
  private var crosshairTimeFormatter = DateFormatter()
  private var tooltipHeaderFormatter = DateFormatter()

  private var formattedValueCache = BoundedStringCache<FormattedValueKey>(capacity: 512)
  private var formattedTimeCache = BoundedStringCache<FormattedTimeKey>(capacity: 512)
  private var formattedPercentageCache = BoundedStringCache<UInt64>(capacity: 256)
  private var formattedVolumeCache = BoundedStringCache<FormattedValueKey>(capacity: 256)

  func configure(_ configuration: ResolvedChartConfiguration) {
    let config = configuration.native
    let formatters = configuration.presentation.dictionary("formatters")
    let price = formatters.dictionary("price")
    valueFormatterIndices.removeAll(keepingCapacity: true)
    valueFormatters.removeAll(keepingCapacity: true)
    registerValueFormatter(role: "yAxis", json: price.dictionary("yAxis"), fallback: config)
    registerValueFormatter(
      role: "priceExtremes", json: price.dictionary("priceExtremes"), fallback: config)
    registerValueFormatter(
      role: "currentPrice", json: price.dictionary("currentPrice"), fallback: config)
    registerValueFormatter(
      role: "crosshairPrice", json: price.dictionary("crosshairPrice"), fallback: config)
    registerValueFormatter(role: "tooltip", json: price.dictionary("tooltip"), fallback: config)
    for pane in configuration.presentation.array("panes").compactMap({ $0 as? JSONDictionary }) {
      let scale = pane.dictionary("priceScale")
      let scaleId = scale.string("priceScaleId")
      guard !scaleId.isEmpty else { continue }
      registerValueFormatter(
        role: "scale:\(scaleId)", json: scale.dictionary("valueFormat"), fallback: config)
    }

    let axisFormatter = valueFormatters[0]
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
    formattedValueCache.removeAll()
    formattedTimeCache.removeAll()
    formattedPercentageCache.removeAll()
    formattedVolumeCache.removeAll()
  }

  func formatValue(_ value: Double, role: String) -> String {
    formatValue(value, using: valueFormatterToken(for: role))
  }

  func valueFormatterToken(for role: String) -> ChartValueFormatterToken {
    ChartValueFormatterToken(formatterID: valueFormatterIndices[role] ?? 0)
  }

  func valueFormatterToken(scaleId: String) -> ChartValueFormatterToken {
    valueFormatterToken(for: "scale:\(scaleId)")
  }

  func formatValue(_ value: Double, using token: ChartValueFormatterToken) -> String {
    let formatter = valueFormatters[Int(token.formatterID)]
    let cacheKey = FormattedValueKey(formatterID: formatter.cacheID, valueBits: value.bitPattern)
    if let cached = formattedValueCache.value(for: cacheKey) { return cached }
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
    formattedValueCache.insert(result, for: cacheKey)
    return result
  }

  func formatPercentage(_ value: Double, valid: Bool) -> String {
    guard valid else { return "—" }
    let key = value.bitPattern
    if let cached = formattedPercentageCache.value(for: key) { return cached }
    let number = NSNumber(value: value)
    let result = (percentageFormatter.string(from: number) ?? String(format: "%.2f", value)) + "%"
    formattedPercentageCache.insert(result, for: key)
    return result
  }

  func formatVolume(_ value: Double, scaleId: String = "main") -> String {
    formatVolume(value, using: volumeFormatterToken(scaleId: scaleId))
  }

  func volumeFormatterToken(scaleId: String) -> ChartVolumeFormatterToken {
    ChartVolumeFormatterToken(formatterID: valueFormatterIndices["scale:\(scaleId)"])
  }

  func formatVolume(_ value: Double, using token: ChartVolumeFormatterToken) -> String {
    let formatterID = token.formatterID
    let cacheID = formatterID ?? UInt16.max
    let key = FormattedValueKey(formatterID: cacheID, valueBits: value.bitPattern)
    if let cached = formattedVolumeCache.value(for: key) { return cached }
    let compact = compactValue(value, enabled: true)
    let formatter = formatterID.map { valueFormatters[Int($0)].numberFormatter } ?? volumeFormatter
    let number = formatter.string(from: NSNumber(value: compact.value))
      ?? String(format: "%g", compact.value)
    let result = number + compact.suffix
    formattedVolumeCache.insert(result, for: key)
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
    let formatter: DateFormatter
    let formatterID: UInt16
    if full {
      formatter = tooltip ? tooltipHeaderFormatter : crosshairTimeFormatter
      formatterID = UInt16(axisDateFormatters.count + (tooltip ? 1 : 0))
    } else {
      let formatterIndex = min(max(index, 0), axisDateFormatters.count - 1)
      formatterID = UInt16(formatterIndex)
      formatter = axisDateFormatters[formatterIndex]
    }
    let key = FormattedTimeKey(formatterID: formatterID, milliseconds: milliseconds)
    if let cached = formattedTimeCache.value(for: key) { return cached }
    let date = Date(timeIntervalSince1970: timestamp / 1_000)
    let result = formatter.string(from: date)
    formattedTimeCache.insert(result, for: key)
    return result
  }

  private func registerValueFormatter(
    role: String, json: JSONDictionary, fallback: NativeChartConfig
  ) {
    let index = valueFormatters.count
    precondition(index < Int(UInt16.max))
    let formatterID = UInt16(index)
    valueFormatterIndices[role] = formatterID
    valueFormatters.append(makeValueFormatter(json, fallback: fallback, cacheID: formatterID))
  }

  private func makeValueFormatter(
    _ json: JSONDictionary,
    fallback: NativeChartConfig,
    cacheID: UInt16
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
      cacheID: cacheID,
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
