// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import UIKit

final class ChartInteractionController: NSObject, UIGestureRecognizerDelegate {
  private weak var view: UIView?
  private let engine: ChartEngineClient
  private let momentum: ChartMomentumController
  private let events: ChartEventCoordinator
  private let requestFrame: () -> Void
  private let onYAxisPress: (CGPoint, String, String, Double) -> Void
  private var config = NativeChartConfig()
  private var panesResizable = false
  private var scalingYAxis = false
  private var suppressMomentum = false
  private var crosshairPinned = false
  private var crosshairGestureActive = false
  private var resizingSeparator: Int?
  private var yAxisPressEnabled = false

  init(
    view: UIView,
    engine: ChartEngineClient,
    momentum: ChartMomentumController,
    events: ChartEventCoordinator,
    requestFrame: @escaping () -> Void,
    onYAxisPress: @escaping (CGPoint, String, String, Double) -> Void
  ) {
    self.view = view
    self.engine = engine
    self.momentum = momentum
    self.events = events
    self.requestFrame = requestFrame
    self.onYAxisPress = onYAxisPress
    super.init()
    install(on: view)
  }

  func setYAxisPressEnabled(_ enabled: Bool) {
    yAxisPressEnabled = enabled
  }

  func apply(config: NativeChartConfig, panesResizable: Bool) {
    self.config = config
    self.panesResizable = panesResizable
  }

  func resetCrosshair() {
    crosshairPinned = false
    crosshairGestureActive = false
  }

  func cancelInteraction() {
    momentum.stop()
    scalingYAxis = false
    suppressMomentum = false
    resizingSeparator = nil
  }

  private func install(on view: UIView) {
    let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
    pan.maximumNumberOfTouches = 1
    pan.delegate = self
    view.addGestureRecognizer(pan)

    let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
    pinch.delegate = self
    view.addGestureRecognizer(pinch)

    let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
    longPress.minimumPressDuration = 0.28
    longPress.delegate = self
    view.addGestureRecognizer(longPress)

    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    tap.delegate = self
    view.addGestureRecognizer(tap)
  }

  @objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
    guard let view else { return }
    switch recognizer.state {
    case .began:
      momentum.stop()
      let point = recognizer.location(in: view)
      if panesResizable, let separator = engine.separator(at: Float(point.y), hitSlop: 12) {
        resizingSeparator = separator
        scalingYAxis = false
        suppressMomentum = true
        recognizer.setTranslation(.zero, in: view)
        return
      }
      if crosshairPinned {
        scalingYAxis = false
        suppressMomentum = true
        return
      }
      scalingYAxis = isPointInYAxis(point, bounds: view.bounds)
      suppressMomentum = scalingYAxis
      recognizer.setTranslation(.zero, in: view)
      if scalingYAxis, config.allow_y_axis_scale {
        _ = engine.scaleY(0)
        requestFrame()
      }
    case .changed:
      if let separator = resizingSeparator {
        let translation = recognizer.translation(in: view)
        recognizer.setTranslation(.zero, in: view)
        if engine.resizePaneSeparator(separator, delta: Float(translation.y)) {
          events.pendingPaneResize = (separator, false)
          requestFrame()
        }
        return
      }
      if crosshairPinned {
        let point = recognizer.location(in: view)
        engine.setCrosshair(active: true, x: Float(point.x), y: Float(point.y))
        requestFrame()
        return
      }
      let translation = recognizer.translation(in: view)
      recognizer.setTranslation(.zero, in: view)
      if scalingYAxis {
        let point = recognizer.location(in: view)
        if config.allow_y_axis_scale,
          engine.scaleY(Float(translation.y), at: Float(point.y)) {
          events.pendingYAxisScale = true
          requestFrame()
        }
      } else if config.allow_pan, engine.pan(Float(translation.x)) {
        requestFrame()
      }
    case .ended, .cancelled, .failed:
      if let separator = resizingSeparator {
        resizingSeparator = nil
        events.pendingPaneResize = (separator, true)
        requestFrame()
        suppressMomentum = false
        return
      }
      let shouldDecelerate = !crosshairPinned && recognizer.state == .ended
        && !scalingYAxis && !suppressMomentum && config.allow_pan
      let velocity = shouldDecelerate ? recognizer.velocity(in: view).x : 0
      scalingYAxis = false
      suppressMomentum = false
      if momentum.start(velocity: velocity, panAllowed: shouldDecelerate) {
        requestFrame()
      }
    default:
      break
    }
  }

  @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
    guard config.allow_zoom, let view else { return }
    switch recognizer.state {
    case .began:
      suppressMomentum = true
      momentum.stop()
      resetCrosshair()
      let focus = recognizer.location(in: view)
      engine.setCrosshair(active: false, x: Float(focus.x), y: Float(focus.y))
      requestFrame()
    case .ended, .cancelled, .failed:
      suppressMomentum = false
    case .changed:
      let focus = recognizer.location(in: view)
      if engine.zoom(Double(recognizer.scale), focusX: Float(focus.x)) {
        events.pendingHorizontalScale = true
        requestFrame()
      }
      recognizer.scale = 1
    default:
      break
    }
  }

  @objc private func handleLongPress(_ recognizer: UILongPressGestureRecognizer) {
    guard let view else { return }
    let point = recognizer.location(in: view)
    if recognizer.state == .began {
      if !config.crosshair_enabled || (!crosshairPinned && !isPointInPlot(point, bounds: view.bounds)) {
        crosshairGestureActive = false
        return
      }
      suppressMomentum = true
      momentum.stop()
      crosshairPinned = true
      crosshairGestureActive = true
    }
    guard crosshairGestureActive else { return }
    switch recognizer.state {
    case .began, .changed:
      engine.setCrosshair(active: true, x: Float(point.x), y: Float(point.y))
      requestFrame()
    case .ended, .cancelled, .failed:
      crosshairGestureActive = false
    default:
      break
    }
  }

  @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
    guard let view else { return }
    let point = recognizer.location(in: view)
    if yAxisPressEnabled, isPointInYAxis(point, bounds: view.bounds),
      let value = engine.yAxisValue(at: Float(point.y)) {
      onYAxisPress(point, value.paneId, value.priceScaleId, value.price)
      return
    }
    if !crosshairPinned && (!config.crosshair_enabled || !isPointInPlot(point, bounds: view.bounds)) {
      return
    }
    if crosshairPinned {
      resetCrosshair()
      engine.setCrosshair(active: false, x: Float(point.x), y: Float(point.y))
      requestFrame()
      return
    }
    suppressMomentum = true
    momentum.stop()
    crosshairPinned = true
    engine.setCrosshair(active: true, x: Float(point.x), y: Float(point.y))
    requestFrame()
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    gestureRecognizer is UIPinchGestureRecognizer || otherGestureRecognizer is UIPinchGestureRecognizer
  }

  private func isPointInYAxis(_ point: CGPoint, bounds: CGRect) -> Bool {
    guard config.show_y_axis else { return false }
    return point.x >= bounds.width - CGFloat(config.y_axis_width)
  }

  private func isPointInPlot(_ point: CGPoint, bounds: CGRect) -> Bool {
    let left: CGFloat = 0
    let right = bounds.width
      - (config.show_y_axis ? CGFloat(config.y_axis_width) : 0)
    let bottom = bounds.height - (config.show_x_axis ? CGFloat(config.x_axis_height) : 0)
    return point.x >= left && point.x <= right && point.y >= 8 && point.y <= bottom
  }
}
