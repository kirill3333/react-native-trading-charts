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
    volume: Double
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
}

final class ChartEventCoordinator {
  private var lastVisibleRange: (Int, Int, Int)?
  private var lastSelection: NativeCandle?
  private var lastSelectionActive = false
  var pendingHorizontalScale = false
  var pendingYAxisScale = false
  var pendingPaneResize: (separator: Int, finished: Bool)?

  func reset() {
    lastVisibleRange = nil
    lastSelection = nil
    lastSelectionActive = false
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
      if !lastSelectionActive || lastSelection.map({ !Self.equal($0, selected) }) ?? true {
        lastSelectionActive = true
        lastSelection = selected
        emitSelection(selected, active: true, host: host, delegate: delegate)
      }
    } else if lastSelectionActive {
      lastSelectionActive = false
      lastSelection = nil
      emitSelection(NativeCandle(), active: false, host: host, delegate: delegate)
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
      volume: candle.volume
    )
  }

  private static func equal(_ lhs: NativeCandle, _ rhs: NativeCandle) -> Bool {
    lhs.timestamp == rhs.timestamp && lhs.open == rhs.open && lhs.high == rhs.high
      && lhs.low == rhs.low && lhs.close == rhs.close && lhs.volume == rhs.volume
  }
}
