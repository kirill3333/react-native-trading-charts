// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import CxxStdlib
import Foundation
import TradingChartsCxx

typealias NativeColor = trading_charts.Color
typealias NativeCandle = trading_charts.Candle
typealias NativeAxisTick = trading_charts.AxisTick
typealias NativePaneSnapshot = trading_charts.PaneSnapshot
typealias NativeIndicatorLegend = trading_charts.IndicatorLegend
typealias NativePriceExtremum = trading_charts.PriceExtremum
typealias NativePriceLine = trading_charts.PriceLine
typealias NativePriceLineSnapshot = trading_charts.PriceLineSnapshot
typealias NativeChartConfig = trading_charts.ChartConfig
typealias NativePaneConfig = trading_charts.PaneConfig
typealias NativeSeriesConfig = trading_charts.SeriesConfig
typealias NativeUpdateStatus = trading_charts.UpdateStatus
typealias NativePaneVector = trading_charts.swift_interop.PaneVector
typealias NativeTradingCalendarConfig = trading_charts.TradingCalendarConfig
typealias NativeSessionVector = trading_charts.swift_interop.SessionVector
typealias NativeDateVector = trading_charts.swift_interop.DateVector
typealias NativeOverrideVector = trading_charts.swift_interop.OverrideVector
typealias NativeCalendarOverride = trading_charts.TradingCalendarOverrideConfig
typealias NativeTransitionVector = trading_charts.swift_interop.TransitionVector
typealias NativeTradingSession = trading_charts.TradingSessionConfig
typealias NativeCivilDate = trading_charts.CivilDate
typealias NativeTimeZoneTransition = trading_charts.TimeZoneTransition

struct PriceLineValue {
  let id: String
  let price: Double
  let label: String
  let color: String
}

func nativeString(_ value: String) -> std.string { std.string(value) }

func appendNativePane(_ vector: inout NativePaneVector, _ value: NativePaneConfig) {
  trading_charts.swift_interop.AppendPane(&vector, value)
}

func appendNativeSession(_ vector: inout NativeSessionVector, _ value: NativeTradingSession) {
  trading_charts.swift_interop.AppendSession(&vector, value)
}

func appendNativeDate(_ vector: inout NativeDateVector, _ value: NativeCivilDate) {
  trading_charts.swift_interop.AppendDate(&vector, value)
}

func appendNativeOverride(_ vector: inout NativeOverrideVector, _ value: NativeCalendarOverride) {
  trading_charts.swift_interop.AppendOverride(&vector, value)
}

func appendNativeTransition(
  _ vector: inout NativeTransitionVector,
  _ value: NativeTimeZoneTransition
) {
  trading_charts.swift_interop.AppendTransition(&vector, value)
}

struct ChartRenderFrame {
  fileprivate let handle: trading_charts.swift_interop.RenderSnapshotHandle

  var revision: UInt64 { handle.Revision() }
  var contentRevision: UInt64 { handle.ContentRevision() }
  var visibleXMin: Double { handle.VisibleXMin() }
  var visibleXMax: Double { handle.VisibleXMax() }
  var horizontalScale: Double { handle.HorizontalScale() }
  var firstVisibleIndex: Int { Int(handle.FirstVisibleIndex()) }
  var lastVisibleIndex: Int { Int(handle.LastVisibleIndex()) }
  var totalCandleCount: Int { Int(handle.TotalCandleCount()) }
  var visibleYMin: Double { handle.VisibleYMin() }
  var visibleYMax: Double { handle.VisibleYMax() }
  var yAxisScale: Double { handle.YAxisScale() }
  var currentPrice: Double { handle.CurrentPrice() }
  var crosshairPrice: Double { handle.CrosshairPrice() }
  var selectedChange: Double { handle.SelectedChange() }
  var selectedChangePercent: Double { handle.SelectedChangePercent() }
  var selectedAmplitudePercent: Double { handle.SelectedAmplitudePercent() }
  var width: Float { handle.Width() }
  var height: Float { handle.Height() }
  var currentPriceY: Float { handle.CurrentPriceY() }
  var crosshairX: Float { handle.CrosshairX() }
  var crosshairY: Float { handle.CrosshairY() }
  var plot: trading_charts.Rect { handle.Plot() }
  var currentPriceColor: NativeColor { handle.CurrentPriceColor() }
  var currentPriceLabelColor: NativeColor { handle.CurrentPriceLabelColor() }
  var hasVisibleCandles: Bool { handle.HasVisibleCandles() }
  var currentPriceVisible: Bool { handle.CurrentPriceVisible() }
  var crosshairVisible: Bool { handle.CrosshairVisible() }
  var selectedPercentagesValid: Bool { handle.SelectedPercentagesValid() }
  var activePaneIndex: Int { Int(handle.ActivePaneIndex()) }
  var selectedCandle: NativeCandle { handle.SelectedCandle() }
  var visibleMaximum: NativePriceExtremum { handle.VisibleMaximum() }
  var visibleMinimum: NativePriceExtremum { handle.VisibleMinimum() }

  var contentVertexCount: Int { Int(handle.ContentVerticesCount()) }
  var overlayVertexCount: Int { Int(handle.OverlayVerticesCount()) }
  var xTickCount: Int { Int(handle.XTickCount()) }
  var yTickCount: Int { Int(handle.YTickCount()) }
  var paneYTickCount: Int { Int(handle.PaneYTickCount()) }
  var paneCount: Int { Int(handle.PaneCount()) }
  var indicatorLegendCount: Int { Int(handle.IndicatorLegendCount()) }
  var priceLineCount: Int { Int(handle.PriceLineCount()) }

  func xTick(at index: Int) -> NativeAxisTick { handle.XTickAt(index) }
  func yTick(at index: Int) -> NativeAxisTick { handle.YTickAt(index) }
  func paneYTick(at index: Int) -> NativeAxisTick { handle.PaneYTickAt(index) }
  func pane(at index: Int) -> NativePaneSnapshot { handle.PaneAt(index) }
  func indicatorLegend(at index: Int) -> NativeIndicatorLegend {
    handle.IndicatorLegendAt(index)
  }
  func indicatorLegendValue(legendIndex: Int, valueIndex: Int) -> trading_charts.IndicatorLegendValue {
    handle.IndicatorLegendValueAt(legendIndex, valueIndex)
  }
  func priceLine(at index: Int) -> NativePriceLineSnapshot { handle.PriceLineAt(index) }

  func withContentVertices<Result>(
    _ body: (UnsafeBufferPointer<Float>) throws -> Result
  ) rethrows -> Result {
    try withExtendedLifetime(handle) {
      let pointer = trading_charts.swift_interop.ContentVerticesData(handle)
      return try body(UnsafeBufferPointer(start: pointer, count: contentVertexCount))
    }
  }

  func withOverlayVertices<Result>(
    _ body: (UnsafeBufferPointer<Float>) throws -> Result
  ) rethrows -> Result {
    try withExtendedLifetime(handle) {
      let pointer = trading_charts.swift_interop.OverlayVerticesData(handle)
      return try body(UnsafeBufferPointer(start: pointer, count: overlayVertexCount))
    }
  }
}

final class ChartEngineClient {
  private var handle = trading_charts.swift_interop.ChartEngineHandle()

  func setConfig(_ config: NativeChartConfig) {
    handle.SetConfig(config)
  }

  func setPanes(
    _ panes: NativePaneVector,
    resizable: Bool
  ) {
    handle.SetPanes(panes, resizable)
  }

  @discardableResult
  func addSeries(_ config: NativeSeriesConfig) -> NativeUpdateStatus {
    handle.AddSeries(config)
  }

  @discardableResult
  func removeSeries(_ seriesId: String) -> Bool {
    handle.RemoveSeries(std.string(seriesId))
  }

  @discardableResult
  func setSeriesData(
    _ numbers: [NSNumber],
    seriesId: String,
    histogram: Bool,
    prepend: Bool,
    update: Bool
  ) -> NativeUpdateStatus {
    withDoubles(numbers) { pointer, count in
      if update {
        return handle.UpdateSeriesData(std.string(seriesId), pointer, count, histogram)
      }
      if prepend {
        return handle.PrependSeriesData(std.string(seriesId), pointer, count, histogram)
      }
      return handle.SetSeriesData(std.string(seriesId), pointer, count, histogram)
    }
  }

  @discardableResult
  func setPaneHeight(_ paneId: String, weight: Double) -> Bool {
    handle.SetPaneHeight(std.string(paneId), weight)
  }

  @discardableResult
  func setPriceLine(id: String, price: Double, label: String, colorHex: String) -> Bool {
    var line = NativePriceLine()
    line.id = nativeString(id)
    line.price = price
    line.label = nativeString(label)
    line.color_hex = nativeString(colorHex)
    line.color = colorFromHex(colorHex, fallback: NativeColor())
    return handle.SetPriceLine(line)
  }

  @discardableResult
  func removePriceLine(_ id: String) -> Bool { handle.RemovePriceLine(nativeString(id)) }

  @discardableResult
  func clearPriceLines() -> Bool { handle.ClearPriceLines() }

  func priceLines() -> [PriceLineValue] {
    let count = Int(handle.PriceLineCount())
    return (0..<count).map { index in
      let line = handle.PriceLineAt(index)
      return PriceLineValue(
        id: String(line.id),
        price: line.price,
        label: String(line.label),
        color: String(line.color_hex)
      )
    }
  }

  @discardableResult
  func resizePaneSeparator(_ index: Int, delta: Float) -> Bool {
    handle.ResizePaneSeparator(index, delta)
  }

  func separator(at y: Float, hitSlop: Float) -> Int? {
    let index = handle.SeparatorAt(y, hitSlop)
    return index >= 0 ? Int(index) : nil
  }

  func setSize(width: Float, height: Float) {
    handle.SetSize(width, height)
  }

  @discardableResult
  func setHistory(_ values: [NSNumber]) -> NativeUpdateStatus {
    withDoubles(values) { handle.SetHistory($0, $1) }
  }

  @discardableResult
  func prependHistory(_ values: [NSNumber]) -> NativeUpdateStatus {
    withDoubles(values) { handle.PrependHistory($0, $1) }
  }

  @discardableResult
  func updateCandle(_ values: [NSNumber]) -> NativeUpdateStatus {
    withDoubles(values) { handle.UpdateCandle($0, $1) }
  }

  @discardableResult
  func updateTrade(_ values: [NSNumber]) -> NativeUpdateStatus {
    withDoubles(values) { handle.UpdateTrade($0, $1) }
  }

  @discardableResult
  func updateTrades(_ values: [NSNumber]) -> NativeUpdateStatus {
    withDoubles(values) { handle.UpdateTrades($0, $1) }
  }

  func clear() { handle.Clear() }
  func pan(_ delta: Float) -> Bool { handle.Pan(delta) }
  func zoom(_ scale: Double, focusX: Float) -> Bool { handle.Zoom(scale, focusX) }
  func zoomAtRightEdge(_ scale: Double) { handle.ZoomAtRightEdge(scale) }
  func scaleY(_ delta: Float) -> Bool { handle.ScaleY(delta) }
  func scaleY(_ delta: Float, at y: Float) -> Bool { handle.ScaleYAt(delta, y) }
  func fitContent() { handle.FitContent() }
  func setCrosshair(active: Bool, x: Float, y: Float) {
    handle.SetCrosshair(active, x, y)
  }

  func yAxisValue(at y: Float) -> (paneId: String, priceScaleId: String, price: Double)? {
    let result = handle.YAxisValueAt(y)
    guard result.valid else { return nil }
    return (
      String(result.value.pane_id),
      String(result.value.price_scale_id),
      result.value.price
    )
  }

  func snapshot() -> ChartRenderFrame {
    ChartRenderFrame(handle: trading_charts.swift_interop.Snapshot(&handle))
  }

  func candleData() -> [NSNumber] {
    let count = Int(handle.CandleCount())
    var result: [NSNumber] = []
    result.reserveCapacity(count * 6)
    for index in 0..<count {
      let candle = handle.CandleAt(index)
      result.append(NSNumber(value: candle.timestamp))
      result.append(NSNumber(value: candle.open))
      result.append(NSNumber(value: candle.high))
      result.append(NSNumber(value: candle.low))
      result.append(NSNumber(value: candle.close))
      result.append(NSNumber(value: candle.volume))
    }
    return result
  }

  private func withDoubles<Result>(
    _ numbers: [NSNumber],
    _ body: (UnsafePointer<Double>?, Int) -> Result
  ) -> Result {
    let values = numbers.map(\.doubleValue)
    return values.withUnsafeBufferPointer { body($0.baseAddress, $0.count) }
  }
}

func logUpdateStatus(_ status: NativeUpdateStatus, operation: String) {
  switch status {
  case .ignoredOldTimestamp:
    NSLog("[TradingCharts] %@ ignored an out-of-order timestamp", operation)
  case .invalidInput:
    NSLog("[TradingCharts] %@ received invalid data", operation)
  case .ignoredOutsideSession:
    NSLog("[TradingCharts] %@ ignored a trade outside the configured session", operation)
  default:
    break
  }
}
