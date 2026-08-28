// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import QuartzCore
import UIKit

final class ChartFrameScheduler {
  private final class Target: NSObject {
    weak var owner: ChartFrameScheduler?

    @objc func tick(_ displayLink: CADisplayLink) {
      owner?.fire(displayLink)
    }
  }

  private let target = Target()
  private lazy var displayLink: CADisplayLink = {
    let link = CADisplayLink(target: target, selector: #selector(Target.tick(_:)))
    link.isPaused = true
    link.add(to: .main, forMode: .common)
    return link
  }()
  private var scheduled = false
  private var active = true
  var onFrame: ((CADisplayLink) -> Void)?

  init() {
    target.owner = self
    _ = displayLink
  }

  func request() {
    guard active, !scheduled else { return }
    scheduled = true
    displayLink.isPaused = false
  }

  func suspend() {
    active = false
    scheduled = false
    displayLink.isPaused = true
  }

  func resume() {
    active = true
  }

  func invalidate() {
    scheduled = false
    active = false
    displayLink.invalidate()
    target.owner = nil
  }

  private func fire(_ link: CADisplayLink) {
    link.isPaused = true
    scheduled = false
    guard active else { return }
    onFrame?(link)
  }
}
