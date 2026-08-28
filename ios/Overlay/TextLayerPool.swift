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
    self.attributedString = attributedString.copy() as! NSAttributedString
    let measured = self.attributedString.size()
    size = CGSize(width: ceil(measured.width), height: ceil(measured.height))
  }
}

final class ChartTextLayerItem {
  let layer = CATextLayer()
  var layout: ChartTextLayout?

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

struct OverlayUpdateMetrics {
  var textUpdates = 0
  var xTextUpdates = 0
  var yTextUpdates = 0
  var frameUpdates = 0
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
    if item.layer.frame != frame {
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
        where !used[poolIndex] && items[poolIndex].layout === presentations[presentationIndex].layout
      {
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
