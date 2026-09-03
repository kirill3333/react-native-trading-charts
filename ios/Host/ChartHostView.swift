// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import MetalKit
import UIKit
import os

@objc(TCChartHostView)
public final class ChartHostView: UIView {
  @objc public weak var delegate: ChartHostViewDelegate?

  private let engine = ChartEngineClient()
  private let metalView: MTKView
  private let renderer: ChartMetalRenderer
  private let overlay = ChartOverlayView(frame: .zero)
  private let scheduler = ChartFrameScheduler()
  private let momentum = ChartMomentumController()
  private let realTimeScroll = ChartRealTimeScrollController()
  private let events = ChartEventCoordinator()
  private var interaction: ChartInteractionController!
  private var configuration: ResolvedChartConfiguration?
  private var declarativeSeriesIds = Set<String>()
  private var lastDrawnRevision: UInt64 = 0
  private var forceNextDraw = true

  public override init(frame: CGRect) {
    let metalView = MTKView(frame: frame, device: MTLCreateSystemDefaultDevice())
    self.metalView = metalView
    self.renderer = ChartMetalRenderer(view: metalView)
    super.init(frame: frame)

    metalView.colorPixelFormat = .bgra8Unorm
    metalView.framebufferOnly = true
    metalView.isPaused = true
    metalView.enableSetNeedsDisplay = true
    metalView.delegate = renderer
    addSubview(metalView)
    addSubview(overlay)

    scheduler.onFrame = { [weak self] displayLink in
      self?.renderFrame(displayLink)
    }
    interaction = ChartInteractionController(
      view: self,
      engine: engine,
      momentum: momentum,
      events: events,
      requestFrame: { [weak self] in self?.requestFrame() },
      onYAxisPress: { [weak self] point, paneId, priceScaleId, price in
        guard let self else { return }
        self.delegate?.chartHostView(
          self,
          yAxisPressX: point.x,
          y: point.y,
          price: price,
          paneId: paneId,
          priceScaleId: priceScaleId
        )
      }
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationWillResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
  }

  @available(*, unavailable)
  public required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    scheduler.invalidate()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    metalView.frame = bounds
    overlay.frame = bounds
    engine.setSize(width: Float(bounds.width), height: Float(bounds.height))
    requestFrame()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    interaction.cancelInteraction()
    scheduler.suspend()
    guard window != nil else {
      realTimeScroll.stop()
      return
    }
    scheduler.resume()
    forceNextDraw = true
    requestFrame()
  }

  public override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    momentum.stop()
    realTimeScroll.stop()
    super.touchesBegan(touches, with: event)
  }

  @objc(applyConfigJson:)
  public func applyConfigJson(_ json: String) {
    guard let next = ChartConfigurationDecoder.decode(json) else { return }
    realTimeScroll.stop()
    configuration = next
    overlay.apply(configuration: next)
    engine.setConfig(next.native)
    engine.setPanes(next.panes, resizable: next.panesResizable)
    interaction.apply(config: next.native, panesResizable: next.panesResizable)

    let requestedIds = Set(next.additionalSeries.compactMap { item -> String? in
      let id = item.string("seriesId")
      return id.isEmpty ? nil : id
    })
    for id in declarativeSeriesIds.subtracting(requestedIds) {
      _ = engine.removeSeries(id)
    }
    var acceptedIds = Set<String>()
    for item in next.additionalSeries {
      let series = SeriesConfigurationDecoder.decode(
        item: item,
        declarative: true,
        chartConfig: next.native,
        defaults: next.appearances
      )
      let status = engine.addSeries(series)
      logUpdateStatus(status, operation: "additionalSeries")
      if status == .applied {
        let id = item.string("seriesId")
        if !id.isEmpty { acceptedIds.insert(id) }
      }
    }
    declarativeSeriesIds = acceptedIds
    requestFrame()
  }

  @objc(applyHistory:)
  public func applyHistory(_ data: [NSNumber]) {
    realTimeScroll.stop()
    interaction.resetCrosshair()
    events.pendingHorizontalScale = false
    events.pendingYAxisScale = false
    apply(engine.setHistory(data), operation: "setHistory")
  }

  @objc(prependHistory:)
  public func prependHistory(_ data: [NSNumber]) {
    interaction.resetCrosshair()
    apply(engine.prependHistory(data), operation: "prependHistory")
  }

  @objc(applyCandle:)
  public func applyCandle(_ data: [NSNumber]) {
    apply(engine.updateCandle(data), operation: "updateCandle")
  }

  @objc(applyTrade:)
  public func applyTrade(_ data: [NSNumber]) {
    apply(engine.updateTrade(data), operation: "updateTrade")
  }

  @objc(applyTrades:)
  public func applyTrades(_ data: [NSNumber]) {
    apply(engine.updateTrades(data), operation: "updateTrades")
  }

  @objc(addSeriesJson:)
  public func addSeriesJson(_ json: String) {
    guard let configuration,
      let series = SeriesConfigurationDecoder.decode(
        json: json,
        declarative: false,
        chartConfig: configuration.native,
        defaults: configuration.appearances
      )
    else { return }
    apply(engine.addSeries(series), operation: "addSeries")
  }

  @objc(setSeriesData:seriesId:dataType:prepend:update:)
  public func setSeriesData(
    _ data: [NSNumber],
    seriesId: String,
    dataType: String,
    prepend: Bool,
    update: Bool
  ) {
    apply(
      engine.setSeriesData(
        data,
        seriesId: seriesId,
        histogram: dataType == "histogram",
        prepend: prepend,
        update: update
      ),
      operation: "seriesData"
    )
  }

  @objc(removeSeries:)
  public func removeSeries(_ seriesId: String) {
    if engine.removeSeries(seriesId) {
      declarativeSeriesIds.remove(seriesId)
      requestFrame()
    }
  }

  @objc(setPaneHeight:weight:)
  public func setPaneHeight(_ paneId: String, weight: Double) {
    if engine.setPaneHeight(paneId, weight: weight) { requestFrame() }
  }

  @objc(setYAxisPressEnabled:)
  public func setYAxisPressEnabled(_ enabled: Bool) {
    interaction.setYAxisPressEnabled(enabled)
  }

  @objc(setPriceLine:price:label:color:)
  public func setPriceLine(_ id: String, price: Double, label: String, color: String) {
    if engine.setPriceLine(id: id, price: price, label: label, colorHex: color) {
      requestFrame()
    }
  }

  @objc(removePriceLine:)
  public func removePriceLine(_ id: String) {
    if engine.removePriceLine(id) { requestFrame() }
  }

  @objc public func clearPriceLines() {
    if engine.clearPriceLines() { requestFrame() }
  }

  @objc public func priceLinesJson() -> String {
    let values: [[String: Any]] = engine.priceLines().map {
      ["id": $0.id, "price": $0.price, "label": $0.label, "color": $0.color]
    }
    guard let data = try? JSONSerialization.data(withJSONObject: values) else { return "[]" }
    return String(data: data, encoding: .utf8) ?? "[]"
  }

  @objc(zoomByScale:)
  public func zoomByScale(_ scale: Double) {
    realTimeScroll.stop()
    interaction.cancelInteraction()
    interaction.resetCrosshair()
    events.pendingHorizontalScale = false
    engine.zoomAtRightEdge(scale)
    requestFrame()
  }

  @objc public func scrollToRealTime() {
    interaction.cancelInteraction()
    interaction.resetCrosshair()
    events.pendingHorizontalScale = false
    engine.setCrosshair(active: false, x: 0, y: 0)
    realTimeScroll.start()
    requestFrame()
  }

  @objc public func fitContent() {
    realTimeScroll.stop()
    interaction.cancelInteraction()
    interaction.resetCrosshair()
    events.pendingHorizontalScale = false
    events.pendingYAxisScale = false
    engine.fitContent()
    requestFrame()
  }

  @objc public func clearData() {
    realTimeScroll.stop()
    interaction.cancelInteraction()
    interaction.resetCrosshair()
    engine.clear()
    events.reset()
    requestFrame()
  }

  @objc public func candleData() -> [NSNumber] {
    engine.candleData()
  }

  private func apply(_ status: NativeUpdateStatus, operation: String) {
    logUpdateStatus(status, operation: operation)
    if status == .applied { requestFrame() }
  }

  private func requestFrame() {
    guard window != nil, UIApplication.shared.applicationState == .active else { return }
    scheduler.request()
  }

  private func renderFrame(_ displayLink: CADisplayLink) {
    guard window != nil, UIApplication.shared.applicationState == .active else { return }
    let frameId = OSSignpostID(log: ChartPerformance.log)
    os_signpost(
      .begin,
      log: ChartPerformance.log,
      name: "Display Link Frame",
      signpostID: frameId,
      "decelerating=%{public}d",
      momentum.isActive
    )
    if momentum.isActive {
      _ = momentum.step(displayLink: displayLink) { [engine] delta in engine.pan(delta) }
    }
    if realTimeScroll.isActive {
      _ = realTimeScroll.step(timestamp: displayLink.timestamp) { [engine] progress in
        engine.scrollToRealTime(progress)
      }
    }

    let snapshotId = OSSignpostID(log: ChartPerformance.log)
    os_signpost(.begin, log: ChartPerformance.log, name: "ChartEngine Snapshot", signpostID: snapshotId)
    let frame = engine.snapshot()
    os_signpost(
      .end,
      log: ChartPerformance.log,
      name: "ChartEngine Snapshot",
      signpostID: snapshotId,
      "revision=%{public}llu vertices=%{public}lu",
      frame.revision,
      (frame.contentVertexCount + frame.overlayVertexCount) / 6
    )
    renderer.submit(frame, background: configuration?.native.background ?? NativeColor())
    overlay.apply(frame: frame)
    if forceNextDraw || frame.revision != lastDrawnRevision {
      metalView.draw()
      lastDrawnRevision = frame.revision
      forceNextDraw = false
    }
    events.emit(frame: frame, host: self, delegate: delegate)
    if momentum.isActive || realTimeScroll.isActive { requestFrame() }
    os_signpost(
      .end,
      log: ChartPerformance.log,
      name: "Display Link Frame",
      signpostID: frameId,
      "revision=%{public}llu",
      frame.revision
    )
  }

  @objc private func applicationDidBecomeActive() {
    interaction.cancelInteraction()
    scheduler.suspend()
    scheduler.resume()
    forceNextDraw = true
    requestFrame()
  }

  @objc private func applicationWillResignActive() {
    interaction.cancelInteraction()
    realTimeScroll.stop()
    scheduler.suspend()
  }
}
