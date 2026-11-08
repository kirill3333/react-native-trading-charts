// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import UIKit

extension ChartOverlayView {
  private func legendTitle(_ legend: NativeIndicatorLegend) -> String {
    switch legend.kind {
    case .sma: return "SMA \(legend.period)"
    case .ema: return "EMA \(legend.period)"
    case .volume: return "VOL"
    case .williamsR: return "Williams %R \(legend.period)"
    case .kdj: return "KDJ \(legend.period) \(legend.fast_period) \(legend.slow_period)"
    case .boll:
      let multiplier = String(legend.std_dev_multiplier)
      let text = multiplier.hasSuffix(".0") ? String(multiplier.dropLast(2)) : multiplier
      return "BOLL (\(legend.period), \(text))"
    case .macd:
      let source: String
      switch legend.value_source {
      case .open: source = "OPEN"
      case .high: source = "HIGH"
      case .low: source = "LOW"
      default: source = "CLOSE"
      }
      return "MACD \(legend.fast_period) \(legend.slow_period) \(source) \(legend.signal_period)"
    default: return "RSI \(legend.period)"
    }
  }

  private func legendLayout(
    _ text: String, color: NativeColor?, style: OverlayStyle, metrics: inout OverlayUpdateMetrics
  ) -> ChartTextLayout {
    let suffix = color.map { "\($0.r),\($0.g),\($0.b),\($0.a)" } ?? "axis"
    let key = "\(suffix)\u{1f}\(text)" as NSString
    if let cached = indicatorLayoutCache.object(forKey: key) {
      metrics.layoutCacheHits += 1
      return cached
    }
    metrics.layoutCacheMisses += 1
    let attributes = color.map { replacingColor(style.yAxis, color: uiColor($0)) } ?? style.yAxis
    let layout = ChartTextLayout(text: text, attributes: attributes)
    indicatorLayoutCache.setObject(layout, forKey: key)
    return layout
  }

  func tooltipFrame(frame: ChartRenderFrame, size: CGSize) -> CGRect {
    let left = CGFloat(frame.plot.left) + 8
    let right = max(left, CGFloat(frame.plot.right) - size.width - 8)
    let preferLeft = frame.crosshairX > (frame.plot.left + frame.plot.right) / 2
    let top = CGFloat(frame.plot.top) + 8
    let bottom = frame.paneCount > 0 ? CGFloat(frame.pane(at: frame.paneCount - 1).plot.bottom) : CGFloat(frame.height)
    var best = CGRect(origin: CGPoint(x: preferLeft ? left : right, y: top), size: size)
    var leastOverlap = CGFloat.infinity
    // At each pane boundary try the side opposite the crosshair first.
    for row in -1..<legendBounds.count {
      if row >= 0 && legendBounds[row].isNull { continue }
      let y = row < 0 ? top : max(top, min(legendBounds[row].maxY + 4, bottom - size.height))
      for x in [preferLeft ? left : right, preferLeft ? right : left] {
        let candidate = CGRect(origin: CGPoint(x: x, y: y), size: size)
        let overlap = legendBounds.reduce(CGFloat.zero) { area, bounds in
          let intersection = candidate.intersection(bounds)
          return area + intersection.width * intersection.height
        }
        if overlap == 0 { return candidate }
        if overlap < leastOverlap { best = candidate; leastOverlap = overlap }
      }
    }
    return best
  }

  func applyLegends(frame: ChartRenderFrame, style: OverlayStyle, metrics: inout OverlayUpdateMetrics) {
    var nextY = (0..<frame.paneCount).map { CGFloat(frame.pane(at: $0).plot.top) + 5 }
    var nextLayer = 0
    legendBounds = Array(repeating: .null, count: frame.paneCount)
    for index in 0..<frame.indicatorLegendCount {
      let legend = frame.indicatorLegend(at: index)
      let paneIndex = Int(legend.pane_index)
      guard nextY.indices.contains(paneIndex) else { continue }
      let pane = frame.pane(at: paneIndex)
      let scaleId = String(pane.price_scale_id)
      let left = CGFloat(pane.plot.left) + 8
      let right = CGFloat(pane.plot.right) - 4
      var x = left
      var y = nextY[paneIndex]
      var rowHeight: CGFloat = 0

      // Each title or labeled value is one measured, indivisible text run.
      for part in 0...Int(legend.value_count) {
        let text: String
        let color: NativeColor?
        if part == 0 {
          text = legendTitle(legend)
          color = legend.text_color_set ? legend.text_color : nil
        } else {
          let value = frame.indicatorLegendValue(legendIndex: index, valueIndex: part - 1)
          var number = "—"
          if value.has_value {
            if legend.kind == .volume {
              number = value.value == 0 ? "0" : formatters.formatVolume(value.value, scaleId: scaleId)
            } else {
              number = formatters.formatValue(value.value, using: formatters.valueFormatterToken(scaleId: scaleId))
            }
          }
          switch legend.kind {
          case .boll: text = ["UP ", "MID ", "LOW "][part - 1] + number
          case .kdj: text = ["K ", "D ", "J "][part - 1] + number
          default: text = number
          }
          color = value.color
        }
        let layout = legendLayout(text, color: color, style: style, metrics: &metrics)
        if x > left && x + layout.size.width > right {
          x = left
          y += rowHeight + 2
          rowHeight = 0
        }
        rowHeight = max(rowHeight, layout.size.height)
        guard right > left, y + rowHeight <= CGFloat(pane.plot.bottom) else { break }
        let rect = CGRect(x: x, y: y, width: min(right - x, layout.size.width), height: layout.size.height)
        _ = legendPool.apply(layout: layout, to: legendPool.item(at: nextLayer), frame: rect, metrics: &metrics)
        legendBounds[paneIndex] = legendBounds[paneIndex].union(rect)
        nextLayer += 1
        x += layout.size.width + 5
      }
      nextY[paneIndex] = y + rowHeight + 2
    }
    legendPool.hide(from: nextLayer)
    visibleLegendLabels = nextLayer
  }
}
