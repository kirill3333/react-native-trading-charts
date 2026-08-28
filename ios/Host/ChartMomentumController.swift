// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import QuartzCore
import UIKit

final class ChartMomentumController {
  private static let pastEdgeWaitDuration: CFTimeInterval = 1.5

  private(set) var isActive = false
  private var horizontalVelocity: CGFloat = 0
  private var lastTimestamp: CFTimeInterval = 0
  private var pastEdgeWaitStartedAt: CFTimeInterval = 0

  func start(velocity: CGFloat, panAllowed: Bool) -> Bool {
    stop()
    guard panAllowed, abs(velocity) > 5 else { return false }
    horizontalVelocity = velocity
    isActive = true
    return true
  }

  func stop() {
    isActive = false
    horizontalVelocity = 0
    lastTimestamp = 0
    pastEdgeWaitStartedAt = 0
  }

  @discardableResult
  func step(displayLink: CADisplayLink, pan: (Float) -> Bool) -> Bool {
    guard isActive else { return false }
    let fallback = displayLink.duration > 0 ? displayLink.duration : 1.0 / 60.0
    let elapsed = lastTimestamp > 0 ? displayLink.timestamp - lastTimestamp : fallback
    let deltaTime = min(max(elapsed, 1.0 / 240.0), 1.0 / 30.0)
    lastTimestamp = displayLink.timestamp
    let moved = pan(Float(horizontalVelocity * deltaTime))
    if moved {
      pastEdgeWaitStartedAt = 0
    } else if horizontalVelocity > 0, pastEdgeWaitStartedAt <= 0 {
      pastEdgeWaitStartedAt = displayLink.timestamp
    }
    let waitingForPastData = !moved && horizontalVelocity > 0
      && displayLink.timestamp - pastEdgeWaitStartedAt < Self.pastEdgeWaitDuration
    horizontalVelocity *= pow(CGFloat(UIScrollView.DecelerationRate.normal.rawValue), deltaTime * 1_000)
    if (!moved && !waitingForPastData) || abs(horizontalVelocity) <= 5 {
      stop()
    }
    return moved
  }
}
