// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

/// Holds only a submitted frame. Merely preparing a newer frame cannot change hit-testing.
final class ChartMarkerPressState<Frame> {
  var enabled = false
  private var frame: Frame?
  private let hit: (Frame, CGPoint) -> String?

  init(hit: @escaping (Frame, CGPoint) -> String?) { self.hit = hit }
  func didSubmit(_ frame: Frame) { self.frame = frame }
  func clear() { frame = nil }

  func press(at point: CGPoint, emit: (String) -> Void) -> Bool {
    guard enabled, let frame, let json = hit(frame, point) else { return false }
    emit(json)
    return true
  }
}
