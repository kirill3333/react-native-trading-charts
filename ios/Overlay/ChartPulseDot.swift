// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import UIKit

final class ChartPulseDot {
  let clip = CALayer()
  private let core = CALayer()
  private let halo = CALayer()
  private var radius: CGFloat = 4
  private var haloRadius: CGFloat = 14
  private var duration: CFTimeInterval = 1.2
  private var belowBaseColor: CGColor?
  private var color: CGColor?

  init() {
    clip.masksToBounds = true
    clip.isHidden = true
    for circle in [halo, core] {
      circle.bounds = CGRect(x: 0, y: 0, width: 8, height: 8)
      circle.cornerRadius = 4
      clip.addSublayer(circle)
    }
    halo.opacity = 0
  }

  func configure(_ configuration: ResolvedChartConfiguration) {
    let options = configuration.presentation.dictionary("appearance").dictionary("pulseDot")
    color = options.bool("enabled")
      ? uiColor(colorFromHex(options.stringOrNil("color"), fallback: configuration.appearances.lineColor)).cgColor
      : nil
    belowBaseColor = color == nil ? nil : options.stringOrNil("belowBaseColor").map {
      uiColor(colorFromHex($0, fallback: configuration.appearances.lineColor)).cgColor
    }
    let nextRadius = CGFloat(options.number("radius")?.doubleValue ?? 4)
    let nextHaloRadius = CGFloat(options.number("haloRadius")?.doubleValue ?? 14)
    let nextDuration = 1 / (options.number("frequency")?.doubleValue ?? (1 / 1.2))
    if color == nil || nextRadius != radius || nextHaloRadius != haloRadius || nextDuration != duration { hide() }
    radius = nextRadius
    haloRadius = nextHaloRadius
    duration = nextDuration
  }

  func hide() {
    guard !clip.isHidden else { return }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    defer { CATransaction.commit() }
    clip.isHidden = true
    halo.removeAnimation(forKey: "pulse")
  }

  func apply(_ frame: ChartRenderFrame) {
    let endpointColor = frame.lineEndpointBelowBase ? belowBaseColor : color
    guard let color = endpointColor, let point = frame.lineEndpoint else { hide(); return }
    let plot = frame.plot
    let rect = CGRect(x: CGFloat(plot.left), y: CGFloat(plot.top),
                      width: CGFloat(plot.right - plot.left), height: CGFloat(plot.bottom - plot.top))
    let center = CGPoint(x: point.x - rect.minX, y: point.y - rect.minY)
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    defer { CATransaction.commit() }
    if clip.frame != rect { clip.frame = rect }
    if core.position != center { core.position = center; halo.position = center }
    if core.backgroundColor != color { core.backgroundColor = color; halo.backgroundColor = color }
    guard clip.isHidden else { return }
    clip.isHidden = false
    let scale = CABasicAnimation(keyPath: "transform.scale")
    let coreScale = radius / core.cornerRadius
    let haloScale = haloRadius / halo.cornerRadius
    core.setAffineTransform(CGAffineTransform(scaleX: coreScale, y: coreScale))
    scale.fromValue = min(coreScale, haloScale)
    scale.toValue = haloScale
    let fade = CABasicAnimation(keyPath: "opacity")
    fade.fromValue = 0.25
    fade.toValue = 0
    let pulse = CAAnimationGroup()
    pulse.duration = duration
    scale.duration = pulse.duration
    fade.duration = pulse.duration
    pulse.animations = [scale, fade]
    pulse.repeatCount = .infinity
    halo.add(pulse, forKey: "pulse")
  }
}
