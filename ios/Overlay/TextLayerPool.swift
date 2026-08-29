// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import QuartzCore
import UIKit

final class ChartTextLayout: NSObject {
  let attributedString: NSAttributedString
  let size: CGSize

  init(text: String, attributes: [NSAttributedString.Key: Any]) {
    attributedString = NSAttributedString(string: text, attributes: attributes)
    let measured = attributedString.size()
    size = CGSize(width: ceil(measured.width), height: ceil(measured.height))
  }

  init(attributedString: NSAttributedString) {
    self.attributedString = NSAttributedString(attributedString: attributedString)
    let measured = self.attributedString.size()
    size = CGSize(width: ceil(measured.width), height: ceil(measured.height))
  }
}

final class ChartTextLayerItem {
  let layer = CATextLayer()
  var layout: ChartTextLayout?
  var appliedFrame: CGRect?

  init(parentLayer: CALayer) {
    layer.contentsScale = UIScreen.main.scale
    layer.isHidden = true
    layer.isWrapped = false
    layer.truncationMode = .none
    parentLayer.addSublayer(layer)
  }
}

final class BadgeLayerGroup {
  let backgroundLayer = CALayer()
  let textItem: ChartTextLayerItem
  var appliedStyleVersion = 0

  init(parentLayer: CALayer, cornerRadius: CGFloat) {
    backgroundLayer.cornerRadius = cornerRadius
    backgroundLayer.isHidden = true
    parentLayer.addSublayer(backgroundLayer)
    textItem = ChartTextLayerItem(parentLayer: parentLayer)
  }
}

final class PriceLineLayerGroup {
  let labelBackground = CALayer()
  let labelItem: ChartTextLayerItem
  let badge: BadgeLayerGroup

  init(labelParent: CALayer, badgeParent: CALayer) {
    labelBackground.isHidden = true
    labelParent.addSublayer(labelBackground)
    labelItem = ChartTextLayerItem(parentLayer: labelParent)
    badge = BadgeLayerGroup(parentLayer: badgeParent, cornerRadius: 0)
  }
}

struct OverlayUpdateMetrics {
  var textUpdates = 0
  var xTextUpdates = 0
  var yTextUpdates = 0
  var frameUpdates = 0
  var xFrameUpdates = 0
  var yFrameUpdates = 0
  var layoutCacheHits = 0
  var layoutCacheMisses = 0
  var layerReassignments = 0
}

struct TextPresentation {
  let layout: ChartTextLayout
  let frame: CGRect
}

final class TextLayerPool {
  private(set) var items: [ChartTextLayerItem] = []
  private let parentLayer: CALayer

  init(parentLayer: CALayer) {
    self.parentLayer = parentLayer
  }

  func item(at index: Int) -> ChartTextLayerItem {
    while items.count <= index {
      items.append(ChartTextLayerItem(parentLayer: parentLayer))
    }
    return items[index]
  }

  func hide(from index: Int) {
    guard index < items.count else { return }
    for item in items[index...] where !item.layer.isHidden {
      item.layer.isHidden = true
    }
  }

  @discardableResult
  func apply(
    layout: ChartTextLayout,
    to item: ChartTextLayerItem,
    frame: CGRect,
    metrics: inout OverlayUpdateMetrics
  ) -> Bool {
    let textChanged = item.layout !== layout
    if textChanged {
      if item.layout != nil { metrics.layerReassignments += 1 }
      item.layout = layout
      item.layer.string = layout.attributedString
      metrics.textUpdates += 1
    }
    if item.appliedFrame != frame {
      item.appliedFrame = frame
      item.layer.frame = frame
      metrics.frameUpdates += 1
    }
    if item.layer.isHidden { item.layer.isHidden = false }
    return textChanged
  }

  func reconcile(
    _ presentations: [TextPresentation],
    metrics: inout OverlayUpdateMetrics
  ) -> Int {
    var assignments = Array(repeating: -1, count: presentations.count)
    var used = Array(repeating: false, count: items.count)

    // Reserve all exact identities first. This preserves the optimized
    // [A, B, C] -> [D, A, B] behavior of the original overlay.
    for presentationIndex in presentations.indices {
      for poolIndex in items.indices
        where !used[poolIndex] && items[poolIndex].layout === presentations[presentationIndex].layout {
        assignments[presentationIndex] = poolIndex
        used[poolIndex] = true
        break
      }
    }
    for presentationIndex in presentations.indices where assignments[presentationIndex] < 0 {
      let poolIndex: Int
      if let free = used.firstIndex(of: false) {
        poolIndex = free
      } else {
        poolIndex = items.count
        items.append(ChartTextLayerItem(parentLayer: parentLayer))
        used.append(false)
      }
      assignments[presentationIndex] = poolIndex
      used[poolIndex] = true
    }

    var textUpdates = 0
    for presentationIndex in presentations.indices {
      let presentation = presentations[presentationIndex]
      if apply(
        layout: presentation.layout,
        to: items[assignments[presentationIndex]],
        frame: presentation.frame,
        metrics: &metrics
      ) {
        textUpdates += 1
      }
    }
    for index in items.indices where !used[index] && !items[index].layer.isHidden {
      items[index].layer.isHidden = true
    }
    return textUpdates
  }
}

struct BorderStyle {
  var color: UIColor
  var width: CGFloat
  var radius: CGFloat
}

func uiColor(_ color: NativeColor) -> UIColor {
  UIColor(
    red: CGFloat(color.r),
    green: CGFloat(color.g),
    blue: CGFloat(color.b),
    alpha: CGFloat(color.a)
  )
}

extension ChartOverlayView {
  func applyPriceLines(
    frame: ChartRenderFrame,
    configuration: ResolvedChartConfiguration,
    style: OverlayStyle,
    metrics: inout OverlayUpdateMetrics,
    visible: inout Int
  ) {
    var active = Set<String>()
    let scaleId = frame.paneCount > 0 ? String(frame.pane(at: 0).price_scale_id) : "main"
    let formatter = formatters.valueFormatterToken(scaleId: scaleId)
    for index in 0..<frame.priceLineCount {
      let priceLine = frame.priceLine(at: index)
      let id = String(priceLine.id)
      active.insert(id)
      let group = priceLineLayers[id]
        ?? PriceLineLayerGroup(labelParent: priceLineContainer, badgeParent: badgeContainer)
      priceLineLayers[id] = group
      let color = uiColor(priceLine.color)
      let label = String(priceLine.label)
      let labelAttributes = replacingColor(style.yAxis, color: color)
      let labelLayout = cachedLayout(
        label,
        attributes: labelAttributes,
        cache: priceLineLayoutCache,
        cacheSuffix: "label-\(colorKey(priceLine.color))",
        metrics: &metrics
      )
      let labelSize = CGSize(width: labelLayout.size.width + 8, height: labelLayout.size.height + 4)
      let labelX = configuration.native.y_axis_on_right
        ? CGFloat(frame.plot.right) - labelSize.width - 8
        : CGFloat(frame.plot.left) + 8
      let labelFrame = CGRect(
        x: max(CGFloat(frame.plot.left), labelX),
        y: CGFloat(priceLine.y) - labelSize.height / 2,
        width: min(CGFloat(frame.plot.right) - CGFloat(frame.plot.left), labelSize.width),
        height: labelSize.height
      )
      if group.labelBackground.frame != labelFrame {
        group.labelBackground.frame = labelFrame
        metrics.frameUpdates += 1
      }
      setBackgroundColor(uiColor(configuration.native.background).cgColor, on: group.labelBackground)
      setHidden(false, on: group.labelBackground)
      _ = xAxisPool.apply(
        layout: labelLayout,
        to: group.labelItem,
        frame: CGRect(
          x: labelFrame.midX - labelLayout.size.width / 2,
          y: labelFrame.midY - labelLayout.size.height / 2,
          width: labelLayout.size.width,
          height: labelLayout.size.height
        ),
        metrics: &metrics
      )

      let priceText = formatters.formatValue(priceLine.price, using: formatter)
      let badgeAttributes = replacingColor(
        style.currentPrice,
        color: contrastingTextColor(priceLine.color)
      )
      let badgeLayout = cachedLayout(
        priceText,
        attributes: badgeAttributes,
        cache: priceLineLayoutCache,
        cacheSuffix: "badge-\(colorKey(priceLine.color))",
        metrics: &metrics
      )
      let badgeWidth = min(CGFloat(configuration.native.y_axis_width), badgeLayout.size.width + 12)
      let badgeHeight = max(20, badgeLayout.size.height + 6)
      let badgeX = configuration.native.y_axis_on_right
        ? CGFloat(frame.plot.right)
        : max(0, CGFloat(frame.plot.left) - badgeWidth)
      applyBadgeFrames(
        group.badge,
        layout: badgeLayout,
        backgroundFrame: CGRect(
          x: badgeX,
          y: CGFloat(priceLine.y) - badgeHeight / 2,
          width: badgeWidth,
          height: badgeHeight
        ),
        color: color,
        border: BorderStyle(color: .clear, width: 0, radius: 0),
        metrics: &metrics
      )
      visible += 2
    }
    for (id, group) in priceLineLayers where !active.contains(id) {
      setHidden(true, on: group.labelBackground)
      setHidden(true, on: group.labelItem.layer)
      hideBadge(group.badge)
    }
  }

  private func colorKey(_ color: NativeColor) -> String {
    "\(color.r)-\(color.g)-\(color.b)-\(color.a)"
  }

  private func contrastingTextColor(_ color: NativeColor) -> UIColor {
    let luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b
    return luminance > 0.6 ? .black : .white
  }
}
