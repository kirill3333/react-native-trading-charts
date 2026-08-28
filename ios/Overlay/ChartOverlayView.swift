// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import QuartzCore
import UIKit
import os

private struct OverlayStyle {
  var xAxis: [NSAttributedString.Key: Any]
  var yAxis: [NSAttributedString.Key: Any]
  var extrema: [NSAttributedString.Key: Any]
  var currentPrice: [NSAttributedString.Key: Any]
  var crosshairPrice: [NSAttributedString.Key: Any]
  var crosshairTime: [NSAttributedString.Key: Any]
  var tooltipHeader: [NSAttributedString.Key: Any]
  var tooltipLabel: [NSAttributedString.Key: Any]
  var tooltipValue: [NSAttributedString.Key: Any]
  var tooltipUp: [NSAttributedString.Key: Any]
  var tooltipDown: [NSAttributedString.Key: Any]
  var extremaConnector: UIColor
  var extremaBackground: UIColor
  var crosshairPriceBackground: UIColor
  var crosshairTimeBackground: UIColor
  var tooltipBackground: NativeColor
  var currentPriceBorder: BorderStyle
  var crosshairPriceBorder: BorderStyle
  var crosshairTimeBorder: BorderStyle
  var tooltipBorder: BorderStyle

  static func resolve(_ configuration: ResolvedChartConfiguration) -> OverlayStyle {
    let config = configuration.native
    let appearance = configuration.presentation.dictionary("appearance")
    let xAxis = appearance.dictionary("xAxis")
    let yAxis = appearance.dictionary("yAxis")
    let extrema = appearance.dictionary("priceExtremes")
    let currentLabel = appearance.dictionary("currentPrice").dictionary("label")
    let crosshair = appearance.dictionary("crosshair")
    let crosshairPrice = crosshair.dictionary("priceLabel")
    let crosshairTime = crosshair.dictionary("timeLabel")
    let tooltip = appearance.dictionary("tooltip")
    let tooltipValue = textAttributes(
      tooltip.dictionary("valueText"), fallback: config.tooltip_text,
      size: 11, weight: .medium)
    var tooltipUp = tooltipValue
    tooltipUp[.foregroundColor] = uiColor(colorFromHex(
      tooltip.stringOrNil("positiveValueColor"), fallback: config.up))
    var tooltipDown = tooltipValue
    tooltipDown[.foregroundColor] = uiColor(colorFromHex(
      tooltip.stringOrNil("negativeValueColor"), fallback: config.down))
    return OverlayStyle(
      xAxis: textAttributes(xAxis.dictionary("text"), fallback: config.axis_text, size: 10.5, weight: .regular),
      yAxis: textAttributes(yAxis.dictionary("text"), fallback: config.axis_text, size: 10.5, weight: .regular),
      extrema: textAttributes(extrema.dictionary("text"), fallback: config.axis_text, size: 10.5, weight: .regular),
      currentPrice: textAttributes(currentLabel.dictionary("text"), fallback: blackColor(), size: 11, weight: .semibold),
      crosshairPrice: textAttributes(crosshairPrice.dictionary("text"), fallback: blackColor(), size: 11, weight: .semibold),
      crosshairTime: textAttributes(crosshairTime.dictionary("text"), fallback: blackColor(), size: 10.5, weight: .semibold),
      tooltipHeader: textAttributes(tooltip.dictionary("headerText"), fallback: config.tooltip_text, size: 11, weight: .medium),
      tooltipLabel: textAttributes(tooltip.dictionary("labelText"), fallback: config.tooltip_text, size: 11, weight: .medium),
      tooltipValue: tooltipValue,
      tooltipUp: tooltipUp,
      tooltipDown: tooltipDown,
      extremaConnector: uiColor(colorFromHex(extrema.stringOrNil("connectorColor"), fallback: config.axis_text)),
      extremaBackground: uiColor(colorFromHex(extrema.stringOrNil("backgroundColor"), fallback: config.background)),
      crosshairPriceBackground: uiColor(colorFromHex(crosshairPrice.stringOrNil("backgroundColor"), fallback: config.crosshair)),
      crosshairTimeBackground: uiColor(colorFromHex(crosshairTime.stringOrNil("backgroundColor"), fallback: config.crosshair)),
      tooltipBackground: colorFromHex(tooltip.stringOrNil("backgroundColor"), fallback: config.tooltip_background),
      currentPriceBorder: border(currentLabel.dictionary("border"), fallbackRadius: 4),
      crosshairPriceBorder: border(crosshairPrice.dictionary("border"), fallbackRadius: 4),
      crosshairTimeBorder: border(crosshairTime.dictionary("border"), fallbackRadius: 4),
      tooltipBorder: border(tooltip.dictionary("border"), fallbackRadius: 8)
    )
  }

  private static func blackColor() -> NativeColor {
    var color = NativeColor(); color.r = 0; color.g = 0; color.b = 0; color.a = 1
    return color
  }

  private static func textAttributes(
    _ value: JSONDictionary,
    fallback: NativeColor,
    size: CGFloat,
    weight: UIFont.Weight
  ) -> [NSAttributedString.Key: Any] {
    let fontSize = value.number("fontSize")?.doubleValue ?? size
    let family = value.string("fontFamily")
    let selectedWeight: UIFont.Weight
    switch value.string("fontWeight") {
    case "regular": selectedWeight = .regular
    case "medium": selectedWeight = .medium
    case "semibold": selectedWeight = .semibold
    case "bold": selectedWeight = .bold
    default: selectedWeight = weight
    }
    let font = (!family.isEmpty ? UIFont(name: family, size: fontSize) : nil)
      ?? UIFont.monospacedDigitSystemFont(ofSize: fontSize, weight: selectedWeight)
    return [
      .font: font,
      .foregroundColor: uiColor(colorFromHex(value.stringOrNil("color"), fallback: fallback)),
    ]
  }

  private static func border(_ value: JSONDictionary, fallbackRadius: CGFloat) -> BorderStyle {
    var transparent = NativeColor(); transparent.r = 0; transparent.g = 0
    transparent.b = 0; transparent.a = 0
    return BorderStyle(
      color: uiColor(colorFromHex(value.stringOrNil("color"), fallback: transparent)),
      width: value.number("width")?.doubleValue ?? 0,
      radius: value.number("radius")?.doubleValue ?? fallbackRadius
    )
  }
}

final class ChartOverlayView: UIView {
  private let axisContainer = CALayer()
  private let badgeContainer = CALayer()
  private let tooltipContainer = CALayer()
  private let extremaContainer = CALayer()
  private lazy var xAxisPool = TextLayerPool(parentLayer: axisContainer)
  private var yAxisPools: [String: TextLayerPool] = [:]
  private lazy var extremaPool = TextLayerPool(parentLayer: extremaContainer)
  private lazy var tooltipLinePool = TextLayerPool(parentLayer: tooltipContainer)
  private lazy var tooltipValuePool = TextLayerPool(parentLayer: tooltipContainer)
  private lazy var legendPool = TextLayerPool(parentLayer: axisContainer)
  private lazy var currentPriceBadge = BadgeLayerGroup(parentLayer: badgeContainer, cornerRadius: 4)
  private lazy var crosshairPriceBadge = BadgeLayerGroup(parentLayer: badgeContainer, cornerRadius: 4)
  private lazy var crosshairTimeBadge = BadgeLayerGroup(parentLayer: badgeContainer, cornerRadius: 4)
  private let tooltipBackgroundLayer = CALayer()
  private var extremaConnectorLayers: [CALayer] = []
  private var extremaBackgroundLayers: [CALayer] = []

  private let formatters = ChartFormatters()
  private let xAxisLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let yAxisLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let extremaLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let indicatorLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let currentPriceLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let crosshairPriceLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let crosshairTimeLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let tooltipHeaderLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let tooltipLabelLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let tooltipValueLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let tooltipUpLayoutCache = NSCache<NSString, ChartTextLayout>()
  private let tooltipDownLayoutCache = NSCache<NSString, ChartTextLayout>()
  private var configuration: ResolvedChartConfiguration?
  private var style: OverlayStyle?
  private var presentationVersion = 0
  private var appliedTooltipStyleVersion = 0
  private var appliedRevision: UInt64 = 0
  private var appliedContentRevision: UInt64 = 0
  private var appliedSelectedCandle = NativeCandle()
  private var appliedCrosshairVisible = false
  private var hasAppliedRevision = false
  private var hasAppliedContentRevision = false
  private var hasAppliedSelection = false
  private var visibleStaticLabels = 0
  private var visibleSelectionLabels = 0
  private var visibleLegendLabels = 0
  private var tooltipFields = ["open", "close", "high", "low", "amplitude", "changePercent", "change", "volume"]
  private var showTooltipHeader = true

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    isOpaque = false
    isUserInteractionEnabled = false
    layer.masksToBounds = true
    tooltipContainer.zPosition = 100
    layer.addSublayer(axisContainer)
    layer.addSublayer(badgeContainer)
    layer.addSublayer(tooltipContainer)
    layer.addSublayer(extremaContainer)
    tooltipBackgroundLayer.cornerRadius = 8
    tooltipBackgroundLayer.isHidden = true
    tooltipContainer.addSublayer(tooltipBackgroundLayer)
    // Keep the aggregate limits equal to the previous shared caches while
    // separating styles so a text-only lookup remains correct.
    xAxisLayoutCache.countLimit = 128
    yAxisLayoutCache.countLimit = 256
    extremaLayoutCache.countLimit = 48
    indicatorLayoutCache.countLimit = 80
    currentPriceLayoutCache.countLimit = 64
    crosshairPriceLayoutCache.countLimit = 64
    crosshairTimeLayoutCache.countLimit = 128
    tooltipHeaderLayoutCache.countLimit = 48
    tooltipLabelLayoutCache.countLimit = 48
    tooltipValueLayoutCache.countLimit = 64
    tooltipUpLayoutCache.countLimit = 48
    tooltipDownLayoutCache.countLimit = 48
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin(); CATransaction.setDisableActions(true)
    if axisContainer.frame != bounds { axisContainer.frame = bounds }
    if badgeContainer.frame != bounds { badgeContainer.frame = bounds }
    if tooltipContainer.frame != bounds { tooltipContainer.frame = bounds }
    if extremaContainer.frame != bounds { extremaContainer.frame = bounds }
    CATransaction.commit()
  }

  func apply(configuration: ResolvedChartConfiguration) {
    self.configuration = configuration
    style = OverlayStyle.resolve(configuration)
    formatters.configure(configuration)
    let crosshair = configuration.presentation.dictionary("crosshair")
    if let fields = crosshair["tooltipFields"] as? [String] { tooltipFields = fields }
    else { tooltipFields = ["open", "close", "high", "low", "amplitude", "changePercent", "change", "volume"] }
    showTooltipHeader = crosshair.number("showTooltipHeader")?.boolValue ?? true
    presentationVersion += 1
    xAxisLayoutCache.removeAllObjects()
    yAxisLayoutCache.removeAllObjects()
    extremaLayoutCache.removeAllObjects()
    indicatorLayoutCache.removeAllObjects()
    currentPriceLayoutCache.removeAllObjects()
    crosshairPriceLayoutCache.removeAllObjects()
    crosshairTimeLayoutCache.removeAllObjects()
    tooltipHeaderLayoutCache.removeAllObjects()
    tooltipLabelLayoutCache.removeAllObjects()
    tooltipValueLayoutCache.removeAllObjects()
    tooltipUpLayoutCache.removeAllObjects()
    tooltipDownLayoutCache.removeAllObjects()
    hasAppliedContentRevision = false
    hasAppliedSelection = false
  }

  func apply(frame: ChartRenderFrame) {
    guard frame.width > 0, frame.height > 0, let configuration, let style else {
      CATransaction.begin(); CATransaction.setDisableActions(true)
      hideAllLayers(); CATransaction.commit()
      hasAppliedRevision = false
      hasAppliedContentRevision = false
      hasAppliedSelection = false
      return
    }
    let updateId = OSSignpostID(log: ChartPerformance.log)
    os_signpost(
      .begin, log: ChartPerformance.log, name: "Overlay Update Layers", signpostID: updateId,
      "revision=%{public}llu contentRevision=%{public}llu xTicks=%{public}lu yTicks=%{public}lu",
      frame.revision, frame.contentRevision, frame.xTickCount, frame.yTickCount)
    if hasAppliedRevision, appliedRevision == frame.revision {
      os_signpost(.end, log: ChartPerformance.log, name: "Overlay Update Layers", signpostID: updateId,
        "cached=1 visible=0 textUpdates=0 xTextUpdates=0 yTextUpdates=0 layoutCacheHits=0 layoutCacheMisses=0 layerReassignments=0 frameUpdates=0 staticUpdated=0 selectionUpdated=0 crosshairTextUpdates=0 selectionTextUpdates=0")
      return
    }

    let staticUpdated = !hasAppliedContentRevision || appliedContentRevision != frame.contentRevision
    let selectionUpdated = staticUpdated || !hasAppliedSelection
      || appliedCrosshairVisible != frame.crosshairVisible
      || (frame.crosshairVisible && !candlesEqual(appliedSelectedCandle, frame.selectedCandle))
    let timeIndex = formatters.timeFormatIndex(for: frame, showSeconds: configuration.native.show_seconds)
    var metrics = OverlayUpdateMetrics()
    CATransaction.begin(); CATransaction.setDisableActions(true)
    setHidden(false, on: badgeContainer)
    if staticUpdated {
      let staticId = OSSignpostID(log: ChartPerformance.log)
      let textUpdatesBefore = metrics.textUpdates
      let frameUpdatesBefore = metrics.frameUpdates
      let cacheHitsBefore = metrics.layoutCacheHits
      let cacheMissesBefore = metrics.layoutCacheMisses
      os_signpost(
        .begin, log: ChartPerformance.log, name: "Overlay Static Update", signpostID: staticId,
        "revision=%{public}llu contentRevision=%{public}llu",
        frame.revision, frame.contentRevision)
      applyStatic(frame: frame, configuration: configuration, style: style, timeIndex: timeIndex, metrics: &metrics)
      os_signpost(
        .end, log: ChartPerformance.log, name: "Overlay Static Update", signpostID: staticId,
        "visible=%{public}lu textUpdates=%{public}lu frameUpdates=%{public}lu layoutCacheHits=%{public}lu layoutCacheMisses=%{public}lu",
        visibleStaticLabels, metrics.textUpdates - textUpdatesBefore,
        metrics.frameUpdates - frameUpdatesBefore, metrics.layoutCacheHits - cacheHitsBefore,
        metrics.layoutCacheMisses - cacheMissesBefore)
      appliedContentRevision = frame.contentRevision
      hasAppliedContentRevision = true
    }
    if staticUpdated || selectionUpdated {
      applyLegends(frame: frame, style: style, metrics: &metrics)
    }
    let crosshairBefore = metrics.textUpdates
    applyCrosshairPrice(frame: frame, configuration: configuration, style: style, metrics: &metrics)
    let crosshairTextUpdates = metrics.textUpdates - crosshairBefore
    var selectionTextUpdates = 0
    if selectionUpdated {
      let before = metrics.textUpdates
      applySelection(frame: frame, configuration: configuration, style: style, timeIndex: timeIndex, metrics: &metrics)
      selectionTextUpdates = metrics.textUpdates - before
      appliedSelectedCandle = frame.selectedCandle
      appliedCrosshairVisible = frame.crosshairVisible
      hasAppliedSelection = true
    }
    let transactionId = OSSignpostID(log: ChartPerformance.log)
    os_signpost(.begin, log: ChartPerformance.log, name: "Overlay Transaction Commit", signpostID: transactionId,
      "revision=%{public}llu staticUpdated=%{public}d selectionUpdated=%{public}d",
      frame.revision, staticUpdated, selectionUpdated)
    CATransaction.commit()
    os_signpost(.end, log: ChartPerformance.log, name: "Overlay Transaction Commit", signpostID: transactionId,
      "textUpdates=%{public}lu frameUpdates=%{public}lu", metrics.textUpdates, metrics.frameUpdates)
    appliedRevision = frame.revision
    hasAppliedRevision = true
    let visible = visibleStaticLabels + visibleSelectionLabels + visibleLegendLabels + (frame.crosshairVisible ? 1 : 0)
    os_signpost(.end, log: ChartPerformance.log, name: "Overlay Update Layers", signpostID: updateId,
      "cached=0 visible=%{public}lu textUpdates=%{public}lu xTextUpdates=%{public}lu yTextUpdates=%{public}lu layoutCacheHits=%{public}lu layoutCacheMisses=%{public}lu layerReassignments=%{public}lu frameUpdates=%{public}lu staticUpdated=%{public}d selectionUpdated=%{public}d crosshairTextUpdates=%{public}lu selectionTextUpdates=%{public}lu",
      visible, metrics.textUpdates, metrics.xTextUpdates, metrics.yTextUpdates,
      metrics.layoutCacheHits, metrics.layoutCacheMisses, metrics.layerReassignments,
      metrics.frameUpdates, staticUpdated, selectionUpdated, crosshairTextUpdates, selectionTextUpdates)
  }

  private func applyStatic(
    frame: ChartRenderFrame, configuration: ResolvedChartConfiguration,
    style: OverlayStyle, timeIndex: Int, metrics: inout OverlayUpdateMetrics
  ) {
    setHidden(false, on: axisContainer)
    setHidden(false, on: extremaContainer)
    var visible = 0
    var xPresentations: [TextPresentation] = []
    if configuration.native.show_x_axis {
      var lastRight = -CGFloat.greatestFiniteMagnitude
      let xAxisTop = frame.paneCount > 0 ? CGFloat(frame.pane(at: frame.paneCount - 1).plot.bottom) : CGFloat(frame.plot.bottom)
      for index in 0..<frame.xTickCount {
        let tick = frame.xTick(at: index)
        let text = formatters.formatTime(tick.value, index: timeIndex, full: false, tooltip: false)
        let layout = cachedLayout(text, attributes: style.xAxis, cache: xAxisLayoutCache, metrics: &metrics)
        let x = max(2, min(CGFloat(frame.width) - layout.size.width - 2, CGFloat(tick.position) - layout.size.width / 2))
        if x < lastRight + 8 { continue }
        xPresentations.append(TextPresentation(layout: layout, frame: CGRect(x: x, y: xAxisTop + 5, width: layout.size.width, height: layout.size.height)))
        lastRight = x + layout.size.width
        visible += 1
      }
    }
    metrics.xTextUpdates += xAxisPool.reconcile(xPresentations, metrics: &metrics)

    var activeKeys = Set<String>()
    if configuration.native.show_y_axis {
      for paneIndex in 0..<frame.paneCount {
        let pane = frame.pane(at: paneIndex)
        guard pane.scale_visible else { continue }
        let paneId = String(pane.pane_id)
        let scaleId = String(pane.price_scale_id)
        let key = paneId + "\u{1f}" + scaleId
        activeKeys.insert(key)
        let pool = yAxisPools[key] ?? TextLayerPool(parentLayer: axisContainer)
        yAxisPools[key] = pool
        var presentations: [TextPresentation] = []
        for offset in 0..<Int(pane.y_tick_count) {
          let tick = frame.paneYTick(at: Int(pane.y_tick_offset) + offset)
          let text = pane.volume_format
            ? formatters.formatVolume(tick.value, scaleId: scaleId)
            : formatters.formatValue(tick.value, role: "scale:\(scaleId)")
          let layout = cachedLayout(text, attributes: style.yAxis, cache: yAxisLayoutCache, metrics: &metrics)
          let rawX = configuration.native.y_axis_on_right
            ? CGFloat(pane.plot.right) + 6
            : CGFloat(pane.plot.left) - layout.size.width - 6
          presentations.append(TextPresentation(layout: layout, frame: CGRect(
            x: max(2, rawX), y: CGFloat(tick.position) - layout.size.height / 2,
            width: layout.size.width, height: layout.size.height)))
          visible += 1
        }
        metrics.yTextUpdates += pool.reconcile(presentations, metrics: &metrics)
      }
    }
    for (key, pool) in yAxisPools where !activeKeys.contains(key) { pool.hide(from: 0) }
    applyExtrema(frame: frame, style: style, metrics: &metrics, visible: &visible)
    if frame.currentPriceVisible && configuration.native.show_current_price_label {
      let text = formatters.formatValue(frame.currentPrice, role: "currentPrice")
      setBadge(currentPriceBadge, text: text,
        y: max(10, min(max(10, CGFloat(frame.height) - 10), CGFloat(frame.currentPriceY))),
        color: uiColor(frame.currentPriceLabelColor), attributes: style.currentPrice,
        border: style.currentPriceBorder, cache: currentPriceLayoutCache,
        frame: frame, configuration: configuration, metrics: &metrics)
      visible += 1
    } else { hideBadge(currentPriceBadge) }
    visibleStaticLabels = visible
  }

  private func applyExtrema(
    frame: ChartRenderFrame, style: OverlayStyle,
    metrics: inout OverlayUpdateMetrics, visible: inout Int
  ) {
    var presentations: [TextPresentation] = []
    var connectorFrames: [CGRect] = []
    for extremum in [frame.visibleMaximum, frame.visibleMinimum] where extremum.visible {
      let text = formatters.formatValue(extremum.value, role: "priceExtremes")
      let layout = cachedLayout(text, attributes: style.extrema, cache: extremaLayoutCache, metrics: &metrics)
      let direction: CGFloat = extremum.label_on_right ? 1 : -1
      let lineEnd = max(CGFloat(frame.plot.left), min(CGFloat(frame.plot.right), CGFloat(extremum.x) + direction * 20))
      let rawX = extremum.label_on_right ? lineEnd + 4 : lineEnd - 4 - layout.size.width
      let x = max(CGFloat(frame.plot.left), min(max(CGFloat(frame.plot.left), CGFloat(frame.plot.right) - layout.size.width), rawX))
      let y = max(CGFloat(frame.plot.top), min(max(CGFloat(frame.plot.top), CGFloat(frame.plot.bottom) - layout.size.height), CGFloat(extremum.y) - layout.size.height / 2))
      presentations.append(TextPresentation(layout: layout, frame: CGRect(x: x, y: y, width: layout.size.width, height: layout.size.height)))
      connectorFrames.append(CGRect(x: min(CGFloat(extremum.x), lineEnd), y: CGFloat(extremum.y) - 0.5, width: abs(lineEnd - CGFloat(extremum.x)), height: 1))
      visible += 1
    }
    _ = extremaPool.reconcile(presentations, metrics: &metrics)
    while extremaConnectorLayers.count < presentations.count {
      let connector = CALayer(); connector.zPosition = 0; connector.isHidden = true
      extremaContainer.addSublayer(connector); extremaConnectorLayers.append(connector)
      let background = CALayer(); background.cornerRadius = 2; background.zPosition = 1; background.isHidden = true
      extremaContainer.addSublayer(background); extremaBackgroundLayers.append(background)
    }
    for index in presentations.indices {
      if extremaPool.items[index].layer.zPosition != 2 {
        extremaPool.items[index].layer.zPosition = 2
      }
      let connector = extremaConnectorLayers[index]
      if connector.frame != connectorFrames[index] { connector.frame = connectorFrames[index]; metrics.frameUpdates += 1 }
      setBackgroundColor(style.extremaConnector.cgColor, on: connector)
      setHidden(false, on: connector)
      let background = extremaBackgroundLayers[index]
      let backgroundFrame = presentations[index].frame.insetBy(dx: -2, dy: -1)
      if background.frame != backgroundFrame { background.frame = backgroundFrame; metrics.frameUpdates += 1 }
      setBackgroundColor(style.extremaBackground.cgColor, on: background)
      setHidden(false, on: background)
    }
    if presentations.count < extremaConnectorLayers.count {
      for index in presentations.count..<extremaConnectorLayers.count {
        setHidden(true, on: extremaConnectorLayers[index])
        setHidden(true, on: extremaBackgroundLayers[index])
      }
    }
  }

  private func applyLegends(frame: ChartRenderFrame, style: OverlayStyle, metrics: inout OverlayUpdateMetrics) {
    var rows = Array(repeating: 0, count: frame.paneCount)
    var next = 0
    for legendIndex in 0..<frame.indicatorLegendCount {
      let legend = frame.indicatorLegend(at: legendIndex)
      let paneIndex = Int(legend.pane_index)
      guard paneIndex < frame.paneCount else { continue }
      let pane = frame.pane(at: paneIndex)
      let scaleId = String(pane.price_scale_id)
      let title: String
      if legend.kind == .macd {
        let source = legend.value_source == .open ? "OPEN" : (legend.value_source == .high ? "HIGH" : (legend.value_source == .low ? "LOW" : "CLOSE"))
        title = "MACD \(legend.fast_period) \(legend.slow_period) \(source) \(legend.signal_period)"
      } else { title = "RSI \(legend.period)" }
      let attributed = NSMutableAttributedString(string: title, attributes: legend.text_color_set
        ? replacingColor(style.yAxis, color: uiColor(legend.text_color)) : style.yAxis)
      var cacheKey = "indicator\u{1f}\(paneIndex)\u{1f}\(legend.kind.rawValue)\u{1f}\(title)"
      for valueIndex in 0..<Int(legend.value_count) {
        let value = frame.indicatorLegendValue(legendIndex: legendIndex, valueIndex: valueIndex)
        let text = value.has_value ? formatters.formatValue(value.value, role: "scale:\(scaleId)") : "—"
        cacheKey += "\u{1f}\(text)\u{1f}\(value.color.r)\u{1f}\(value.color.g)\u{1f}\(value.color.b)\u{1f}\(value.color.a)"
        let color = legend.kind == .rsi && legend.text_color_set ? legend.text_color : value.color
        attributed.append(NSAttributedString(string: " " + text, attributes: replacingColor(style.yAxis, color: uiColor(color))))
      }
      let layout: ChartTextLayout
      if let cached = indicatorLayoutCache.object(forKey: cacheKey as NSString) {
        metrics.layoutCacheHits += 1; layout = cached
      } else {
        metrics.layoutCacheMisses += 1; layout = ChartTextLayout(attributedString: attributed)
        indicatorLayoutCache.setObject(layout, forKey: cacheKey as NSString)
      }
      let row = rows[paneIndex]; rows[paneIndex] += 1
      _ = legendPool.apply(layout: layout, to: legendPool.item(at: next), frame: CGRect(
        x: CGFloat(pane.plot.left) + 8, y: CGFloat(pane.plot.top) + 5 + CGFloat(row * 15),
        width: layout.size.width, height: layout.size.height), metrics: &metrics)
      next += 1
    }
    legendPool.hide(from: next)
    visibleLegendLabels = next
  }

  private func applyCrosshairPrice(
    frame: ChartRenderFrame, configuration: ResolvedChartConfiguration,
    style: OverlayStyle, metrics: inout OverlayUpdateMetrics
  ) {
    guard frame.crosshairVisible else { hideBadge(crosshairPriceBadge); return }
    let active = min(max(frame.activePaneIndex, 0), max(frame.paneCount - 1, 0))
    let pane = frame.paneCount > 0 ? frame.pane(at: active) : NativePaneSnapshot()
    let scaleId = frame.paneCount > 0 ? String(pane.price_scale_id) : "main"
    let text = pane.volume_format
      ? formatters.formatVolume(frame.crosshairPrice, scaleId: scaleId)
      : formatters.formatValue(frame.crosshairPrice, role: active == 0 ? "crosshairPrice" : "scale:\(scaleId)")
    setBadge(crosshairPriceBadge, text: text, y: CGFloat(frame.crosshairY),
      color: style.crosshairPriceBackground, attributes: style.crosshairPrice,
      border: style.crosshairPriceBorder, cache: crosshairPriceLayoutCache,
      frame: frame, configuration: configuration, metrics: &metrics)
  }

  private func applySelection(
    frame: ChartRenderFrame, configuration: ResolvedChartConfiguration,
    style: OverlayStyle, timeIndex: Int, metrics: inout OverlayUpdateMetrics
  ) {
    let selectionId = OSSignpostID(log: ChartPerformance.log)
    let frameUpdatesBefore = metrics.frameUpdates
    os_signpost(.begin, log: ChartPerformance.log, name: "Overlay Selection Update", signpostID: selectionId,
      "revision=%{public}llu contentRevision=%{public}llu crosshairVisible=%{public}d",
      frame.revision, frame.contentRevision, frame.crosshairVisible)
    guard frame.crosshairVisible else {
      hideBadge(crosshairTimeBadge); setHidden(true, on: tooltipContainer)
      visibleSelectionLabels = 0
      os_signpost(.end, log: ChartPerformance.log, name: "Overlay Selection Update", signpostID: selectionId,
        "visible=0 textUpdates=0 frameUpdates=%{public}lu tooltipRows=0", metrics.frameUpdates - frameUpdatesBefore)
      return
    }
    var visible = 1
    let time = formatters.formatTime(frame.selectedCandle.timestamp, index: timeIndex, full: true, tooltip: false)
    let timeLayout = cachedLayout(time, attributes: style.crosshairTime, cache: crosshairTimeLayoutCache, metrics: &metrics)
    let height = max(20, timeLayout.size.height + 6)
    let xAxisTop = frame.paneCount > 0 ? CGFloat(frame.pane(at: frame.paneCount - 1).plot.bottom) : CGFloat(frame.plot.bottom)
    let timeFrame = CGRect(
      x: max(CGFloat(frame.plot.left), min(CGFloat(frame.plot.right) - timeLayout.size.width - 12, CGFloat(frame.crosshairX) - timeLayout.size.width / 2 - 6)),
      y: xAxisTop, width: timeLayout.size.width + 12, height: height)
    applyBadgeFrames(crosshairTimeBadge, layout: timeLayout, backgroundFrame: timeFrame,
      color: style.crosshairTimeBackground, border: style.crosshairTimeBorder, metrics: &metrics)

    let showTooltip = configuration.native.show_tooltip && (showTooltipHeader || !tooltipFields.isEmpty)
    if showTooltip {
      let candle = frame.selectedCandle
      var labels: [String] = []; var values: [String] = []
      for field in tooltipFields {
        let value: String?
        switch field {
        case "open": value = formatters.formatValue(candle.open, role: "tooltip")
        case "close": value = formatters.formatValue(candle.close, role: "tooltip")
        case "high": value = formatters.formatValue(candle.high, role: "tooltip")
        case "low": value = formatters.formatValue(candle.low, role: "tooltip")
        case "amplitude": value = formatters.formatPercentage(frame.selectedAmplitudePercent, valid: frame.selectedPercentagesValid)
        case "changePercent": value = formatters.formatPercentage(frame.selectedChangePercent, valid: frame.selectedPercentagesValid)
        case "change": value = formatters.formatValue(frame.selectedChange, role: "tooltip")
        case "volume": value = formatters.formatVolume(candle.volume)
        default: value = nil
        }
        guard let value else { continue }
        labels.append(tooltipLabel(field, config: configuration.native)); values.append(value)
      }
      applyTooltip(frame: frame, style: style, timeIndex: timeIndex, labels: labels, values: values, metrics: &metrics)
      visible += values.count * 2 + (showTooltipHeader ? 1 : 0)
    } else { setHidden(true, on: tooltipContainer) }
    visibleSelectionLabels = visible
    os_signpost(.end, log: ChartPerformance.log, name: "Overlay Selection Update", signpostID: selectionId,
      "visible=%{public}lu textUpdates=%{public}lu frameUpdates=%{public}lu tooltipRows=%{public}lu",
      visible, metrics.textUpdates, metrics.frameUpdates - frameUpdatesBefore, showTooltip ? tooltipFields.count : 0)
  }

  private func applyTooltip(
    frame: ChartRenderFrame, style: OverlayStyle, timeIndex: Int,
    labels: [String], values: [String], metrics: inout OverlayUpdateMetrics
  ) {
    let labelText = labels.joined(separator: "\n")
    let valueText = values.joined(separator: "\n")
    let labelsLayout = cachedLayout(
      labelText, attributes: multilineAttributes(style.tooltipLabel),
      cache: tooltipLabelLayoutCache, metrics: &metrics)
    let direction = frame.selectedChange > 0 ? 1 : (frame.selectedChange < 0 ? -1 : 0)
    let valueAttributes = direction > 0 ? style.tooltipUp : (direction < 0 ? style.tooltipDown : style.tooltipValue)
    let valueCache = direction > 0
      ? tooltipUpLayoutCache : (direction < 0 ? tooltipDownLayoutCache : tooltipValueLayoutCache)
    let valuesLayout = cachedLayout(
      valueText, attributes: multilineAttributes(valueAttributes), cache: valueCache,
      metrics: &metrics)
    let headerText = formatters.formatTime(frame.selectedCandle.timestamp, index: timeIndex, full: true, tooltip: true)
    let headerLayout = cachedLayout(
      headerText, attributes: style.tooltipHeader, cache: tooltipHeaderLayoutCache,
      metrics: &metrics)
    let labelFont = style.tooltipLabel[.font] as! UIFont
    let valueFont = style.tooltipValue[.font] as! UIFont
    let rowHeight = max(labelFont.lineHeight, valueFont.lineHeight)
    let headerHeight = showTooltipHeader ? max(17, headerLayout.size.height) : 0
    let rowsWidth = labels.isEmpty ? 0 : labelsLayout.size.width + 12 + valuesLayout.size.width
    let width = max(showTooltipHeader ? headerLayout.size.width : 0, rowsWidth) + 20
    let rowsHeight = CGFloat(values.count) * rowHeight
    let height = headerHeight + rowsHeight + 18
    let midX = (CGFloat(frame.plot.left) + CGFloat(frame.plot.right)) / 2
    let x = CGFloat(frame.crosshairX) > midX ? CGFloat(frame.plot.left) + 8 : CGFloat(frame.plot.right) - width - 8
    let box = CGRect(x: x, y: CGFloat(frame.plot.top) + 8, width: width, height: height)
    if tooltipBackgroundLayer.frame != box { tooltipBackgroundLayer.frame = box; metrics.frameUpdates += 1 }
    var background = style.tooltipBackground
    background.a *= configuration!.native.tooltip_background_opacity
    setBackgroundColor(uiColor(background).cgColor, on: tooltipBackgroundLayer)
    if appliedTooltipStyleVersion != presentationVersion {
      appliedTooltipStyleVersion = presentationVersion
      tooltipBackgroundLayer.borderWidth = style.tooltipBorder.width
      tooltipBackgroundLayer.borderColor = style.tooltipBorder.color.cgColor
      tooltipBackgroundLayer.cornerRadius = style.tooltipBorder.radius
    }
    setHidden(false, on: tooltipContainer)
    setHidden(false, on: tooltipBackgroundLayer)
    var y = box.minY + 9; var lineIndex = 0
    if showTooltipHeader {
      _ = tooltipLinePool.apply(layout: headerLayout, to: tooltipLinePool.item(at: lineIndex), frame: CGRect(
        x: box.minX + 10, y: y, width: headerLayout.size.width, height: headerLayout.size.height), metrics: &metrics)
      lineIndex += 1; y += headerHeight
    }
    if !values.isEmpty {
      _ = tooltipLinePool.apply(layout: labelsLayout, to: tooltipLinePool.item(at: lineIndex), frame: CGRect(
        x: box.minX + 10, y: y, width: labelsLayout.size.width, height: rowsHeight), metrics: &metrics)
      _ = tooltipValuePool.apply(layout: valuesLayout, to: tooltipValuePool.item(at: 0), frame: CGRect(
        x: box.minX + 10 + labelsLayout.size.width + 12, y: y, width: valuesLayout.size.width, height: rowsHeight), metrics: &metrics)
      lineIndex += 1; tooltipValuePool.hide(from: 1)
    } else { tooltipValuePool.hide(from: 0) }
    tooltipLinePool.hide(from: lineIndex)
  }

  private func setBadge(
    _ badge: BadgeLayerGroup, text: String, y: CGFloat, color: UIColor,
    attributes: [NSAttributedString.Key: Any], border: BorderStyle,
    cache: NSCache<NSString, ChartTextLayout>,
    frame: ChartRenderFrame, configuration: ResolvedChartConfiguration,
    metrics: inout OverlayUpdateMetrics
  ) {
    let layout = cachedLayout(text, attributes: attributes, cache: cache, metrics: &metrics)
    let width = min(CGFloat(configuration.native.y_axis_width), layout.size.width + 12)
    let x = configuration.native.y_axis_on_right ? CGFloat(frame.plot.right) : max(0, CGFloat(frame.plot.left) - width)
    let height = max(20, layout.size.height + 6); let half = height / 2
    let clampedY = max(half, min(max(half, CGFloat(frame.height) - half), y))
    applyBadgeFrames(badge, layout: layout, backgroundFrame: CGRect(x: x, y: clampedY - half, width: width, height: height), color: color, border: border, metrics: &metrics)
  }

  private func applyBadgeFrames(
    _ badge: BadgeLayerGroup, layout: ChartTextLayout, backgroundFrame: CGRect,
    color: UIColor, border: BorderStyle, metrics: inout OverlayUpdateMetrics
  ) {
    if badge.backgroundLayer.frame != backgroundFrame { badge.backgroundLayer.frame = backgroundFrame; metrics.frameUpdates += 1 }
    setBackgroundColor(color.cgColor, on: badge.backgroundLayer)
    if badge.appliedStyleVersion != presentationVersion {
      badge.appliedStyleVersion = presentationVersion
      badge.backgroundLayer.borderWidth = border.width
      badge.backgroundLayer.borderColor = border.color.cgColor
      badge.backgroundLayer.cornerRadius = border.radius
    }
    setHidden(false, on: badge.backgroundLayer)
    let textFrame = CGRect(x: backgroundFrame.midX - layout.size.width / 2,
      y: backgroundFrame.minY + (backgroundFrame.height - layout.size.height) / 2,
      width: layout.size.width, height: layout.size.height)
    _ = xAxisPool.apply(layout: layout, to: badge.textItem, frame: textFrame, metrics: &metrics)
  }

  private func cachedLayout(
    _ text: String, attributes: [NSAttributedString.Key: Any],
    cache: NSCache<NSString, ChartTextLayout>, metrics: inout OverlayUpdateMetrics
  ) -> ChartTextLayout {
    // Each cache belongs to one resolved text style and is cleared whenever
    // presentation configuration changes, so the text itself is a complete key.
    let key = text as NSString
    if let value = cache.object(forKey: key) { metrics.layoutCacheHits += 1; return value }
    metrics.layoutCacheMisses += 1
    let value = ChartTextLayout(text: text, attributes: attributes)
    cache.setObject(value, forKey: key)
    return value
  }

  private func multilineAttributes(_ attributes: [NSAttributedString.Key: Any]) -> [NSAttributedString.Key: Any] {
    var result = attributes
    let font = attributes[.font] as! UIFont
    let paragraph = NSMutableParagraphStyle(); paragraph.lineSpacing = 0
    paragraph.minimumLineHeight = font.lineHeight; paragraph.maximumLineHeight = font.lineHeight
    result[.paragraphStyle] = paragraph
    return result
  }

  private func tooltipLabel(_ field: String, config: NativeChartConfig) -> String {
    switch field {
    case "open": return String(config.tooltip_label_open)
    case "close": return String(config.tooltip_label_close)
    case "high": return String(config.tooltip_label_high)
    case "low": return String(config.tooltip_label_low)
    case "amplitude": return String(config.tooltip_label_amplitude)
    case "changePercent": return String(config.tooltip_label_change_percent)
    case "change": return String(config.tooltip_label_change)
    case "volume": return String(config.tooltip_label_volume)
    default: return field
    }
  }

  private func replacingColor(
    _ attributes: [NSAttributedString.Key: Any], color: UIColor
  ) -> [NSAttributedString.Key: Any] {
    var result = attributes; result[.foregroundColor] = color; return result
  }

  private func hideBadge(_ badge: BadgeLayerGroup) {
    setHidden(true, on: badge.backgroundLayer)
    setHidden(true, on: badge.textItem.layer)
  }

  private func hideAllLayers() {
    setHidden(true, on: axisContainer)
    setHidden(true, on: badgeContainer)
    setHidden(true, on: tooltipContainer)
    setHidden(true, on: extremaContainer)
  }

  private func setHidden(_ hidden: Bool, on layer: CALayer) {
    if layer.isHidden != hidden { layer.isHidden = hidden }
  }

  private func setBackgroundColor(_ color: CGColor, on layer: CALayer) {
    if layer.backgroundColor == color { return }
    layer.backgroundColor = color
  }

  private func candlesEqual(_ lhs: NativeCandle, _ rhs: NativeCandle) -> Bool {
    lhs.timestamp == rhs.timestamp && lhs.open == rhs.open && lhs.high == rhs.high
      && lhs.low == rhs.low && lhs.close == rhs.close && lhs.volume == rhs.volume
  }
}
