// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

@objc public protocol ChartHostViewDelegate: AnyObject {
  func chartHostView(
    _ host: ChartHostView,
    visibleXMin: Double,
    visibleXMax: Double,
    firstVisibleIndex: Int,
    lastVisibleIndex: Int,
    totalCandleCount: Int,
    isAtStart: Bool,
    isAtEnd: Bool
  )
  func chartHostView(
    _ host: ChartHostView,
    selectedCandleActive active: Bool,
    timestamp: Double,
    open: Double,
    high: Double,
    low: Double,
    close: Double,
    volume: Double,
    seriesValuesJson: String
  )
  func chartHostView(_ host: ChartHostView, horizontalScale: Double)
  func chartHostView(_ host: ChartHostView, yAxisScale: Double)
  func chartHostView(
    _ host: ChartHostView,
    paneId: String,
    priceScaleId: String,
    priceScale: Double
  )
  func chartHostView(
    _ host: ChartHostView,
    firstPaneId: String,
    firstHeightWeight: Double,
    secondPaneId: String,
    secondHeightWeight: Double,
    resizeFinished: Bool
  )
  func chartHostView(
    _ host: ChartHostView,
    yAxisPressX x: Double,
    y: Double,
    price: Double,
    paneId: String,
    priceScaleId: String
  )
}

final class ChartEventCoordinator {
  private var lastVisibleRange: (Int, Int, Int)?
  private var lastSelection: NativeCandle?
  private var lastSelectionActive = false
  private var lastSelectionContentRevision: UInt64?
  private var lastSeriesValuesJson = "[]"
  var pendingHorizontalScale = false
  var pendingYAxisScale = false
  var pendingPaneResize: (separator: Int, finished: Bool)?

  func reset() {
    lastVisibleRange = nil
    lastSelection = nil
    lastSelectionActive = false
    lastSelectionContentRevision = nil
    lastSeriesValuesJson = "[]"
    pendingHorizontalScale = false
    pendingYAxisScale = false
    pendingPaneResize = nil
  }

  func emit(frame: ChartRenderFrame, host: ChartHostView, delegate: ChartHostViewDelegate?) {
    if frame.hasVisibleCandles {
      let range = (frame.firstVisibleIndex, frame.lastVisibleIndex, frame.totalCandleCount)
      if lastVisibleRange == nil || lastVisibleRange!.0 != range.0
        || lastVisibleRange!.1 != range.1 || lastVisibleRange!.2 != range.2 {
        lastVisibleRange = range
        delegate?.chartHostView(
          host,
          visibleXMin: frame.visibleXMin,
          visibleXMax: frame.visibleXMax,
          firstVisibleIndex: range.0,
          lastVisibleIndex: range.1,
          totalCandleCount: range.2,
          isAtStart: range.0 == 0,
          isAtEnd: range.1 + 1 == range.2
        )
      }
    }

    let selected = frame.selectedCandle
    if frame.crosshairVisible {
      let candleChanged = !lastSelectionActive || lastSelection.map({ !Self.equal($0, selected) }) ?? true
      let contentChanged = lastSelectionContentRevision != frame.contentRevision
      if candleChanged || contentChanged {
        let seriesValuesJson = Self.seriesValuesJson(frame)
        lastSelectionContentRevision = frame.contentRevision
        if candleChanged || seriesValuesJson != lastSeriesValuesJson {
          lastSelectionActive = true
          lastSelection = selected
          lastSeriesValuesJson = seriesValuesJson
          emitSelection(
            selected,
            active: true,
            seriesValuesJson: seriesValuesJson,
            host: host,
            delegate: delegate
          )
        }
      }
    } else if lastSelectionActive {
      lastSelectionActive = false
      lastSelection = nil
      lastSelectionContentRevision = nil
      lastSeriesValuesJson = "[]"
      emitSelection(
        NativeCandle(), active: false, seriesValuesJson: "[]", host: host, delegate: delegate
      )
    }

    if pendingHorizontalScale {
      pendingHorizontalScale = false
      delegate?.chartHostView(host, horizontalScale: frame.horizontalScale)
    }
    if pendingYAxisScale {
      pendingYAxisScale = false
      delegate?.chartHostView(host, yAxisScale: frame.yAxisScale)
      if frame.paneCount > 0 {
        let pane = frame.pane(at: min(frame.activePaneIndex, frame.paneCount - 1))
        delegate?.chartHostView(
          host,
          paneId: String(pane.pane_id),
          priceScaleId: String(pane.price_scale_id),
          priceScale: pane.y_axis_scale
        )
      }
    }
    if let pendingPaneResize {
      self.pendingPaneResize = nil
      if pendingPaneResize.separator >= 0, pendingPaneResize.separator + 1 < frame.paneCount {
        let first = frame.pane(at: pendingPaneResize.separator)
        let second = frame.pane(at: pendingPaneResize.separator + 1)
        delegate?.chartHostView(
          host,
          firstPaneId: String(first.pane_id),
          firstHeightWeight: first.height_weight,
          secondPaneId: String(second.pane_id),
          secondHeightWeight: second.height_weight,
          resizeFinished: pendingPaneResize.finished
        )
      }
    }
  }

  private func emitSelection(
    _ candle: NativeCandle,
    active: Bool,
    seriesValuesJson: String,
    host: ChartHostView,
    delegate: ChartHostViewDelegate?
  ) {
    delegate?.chartHostView(
      host,
      selectedCandleActive: active,
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      seriesValuesJson: seriesValuesJson
    )
  }

  private static func seriesValuesJson(_ frame: ChartRenderFrame) -> String {
    let values: [[String: Any]] = (0..<frame.crosshairSeriesValueCount).map { index in
      let value = frame.crosshairSeriesValue(at: index)
      var result: [String: Any] = [
        "seriesId": String(value.series_id),
        "paneId": String(value.pane_id),
        "priceScaleId": String(value.price_scale_id)
      ]
      switch value.kind {
      case .ohlc:
        result["kind"] = "ohlc"
        result["seriesType"] = seriesTypeName(value.series_type)
        result["candle"] = value.has_value ? candleJson(value.candle) : NSNull()
      case .macd:
        result["kind"] = "macd"
        result["seriesType"] = "macd"
        result["sourceType"] = "ohlcvMacd"
        result["macd"] = value.has_macd ? value.macd : NSNull()
        result["signal"] = value.has_signal ? value.signal : NSNull()
        result["histogram"] = value.has_histogram ? value.histogram : NSNull()
      default:
        result["kind"] = "scalar"
        result["seriesType"] = seriesTypeName(value.series_type)
        result["sourceType"] = sourceTypeName(value.source_type)
        result["value"] = value.has_value ? value.value : NSNull()
      }
      return result
    }
    guard
      let data = try? JSONSerialization.data(withJSONObject: values, options: [.sortedKeys]),
      let json = String(data: data, encoding: .utf8)
    else { return "[]" }
    return json
  }

  private static func candleJson(_ candle: NativeCandle) -> [String: Double] {
    [
      "timestamp": candle.timestamp,
      "open": candle.open,
      "high": candle.high,
      "low": candle.low,
      "close": candle.close,
      "volume": candle.volume
    ]
  }

  private static func seriesTypeName(_ type: NativeSeriesType) -> String {
    switch type {
    case .candlestick: return "candlestick"
    case .hollowCandlestick: return "hollowCandlestick"
    case .bar: return "bar"
    case .histogram: return "histogram"
    case .area: return "area"
    default: return "line"
    }
  }

  private static func sourceTypeName(_ source: NativeSeriesSource) -> String {
    switch source {
    case .ohlcvVolume: return "ohlcvVolume"
    case .ohlcvRsi: return "ohlcvRsi"
    case .ohlcvSma: return "ohlcvSma"
    case .ohlcvEma: return "ohlcvEma"
    case .ohlcvMacd: return "ohlcvMacd"
    default: return "data"
    }
  }

  private static func equal(_ lhs: NativeCandle, _ rhs: NativeCandle) -> Bool {
    lhs.timestamp == rhs.timestamp && lhs.open == rhs.open && lhs.high == rhs.high
      && lhs.low == rhs.low && lhs.close == rhs.close && lhs.volume == rhs.volume
  }
}
