// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

/// Main-thread-owned storage. A revision can have multiple GPU readers, but no CPU writer.
/// The generic resource keeps ownership tests independent of Metal and GPU timing.
final class ChartVertexBufferPool<Buffer> {
  final class Slot {
    fileprivate(set) var buffer: Buffer?
    fileprivate(set) var capacity = 0
    fileprivate(set) var revision: UInt64?
    fileprivate(set) var readers = 0
  }

  private let slots = (0..<ChartFrameFlightState.limit).map { _ in Slot() }
  private let allocate: (Int) -> Buffer?

  init(allocate: @escaping (Int) -> Buffer?) {
    self.allocate = allocate
  }

  func acquire(
    revision: UInt64,
    byteCount: Int,
    upload: (Buffer) -> Bool
  ) -> Slot? {
    precondition(Thread.isMainThread)
    precondition(byteCount >= 0)
    if let slot = slots.first(where: { $0.revision == revision }) {
      slot.readers += 1
      return slot
    }
    guard let slot = slots.first(where: { $0.readers == 0 }) else { return nil }
    if byteCount > slot.capacity {
      let capacity = byteCount + 4_096
      guard let buffer = allocate(capacity) else { return nil }
      slot.buffer = buffer
      slot.capacity = capacity
    }
    // Upload may overwrite an old revision even if it subsequently fails.
    slot.revision = nil
    if byteCount > 0 {
      guard let buffer = slot.buffer, upload(buffer) else { return nil }
    }
    slot.revision = revision
    slot.readers = 1
    return slot
  }

  func release(_ slot: Slot) {
    precondition(Thread.isMainThread)
    precondition(slots.contains { $0 === slot } && slot.readers > 0)
    slot.readers -= 1
  }
}

/// Bounds submitted work and wakes the on-demand scheduler after GPU backpressure.
final class ChartFrameFlightState {
  static let limit = 3

  private(set) var inFlightCount = 0
  private var waitingForCapacity = false
  private var requestedRevision: UInt64?
  private var canRetryDrawable = true
  var onNeedsFrame: (() -> Void)?

  func submit(revision: UInt64) {
    precondition(Thread.isMainThread)
    if requestedRevision != revision {
      requestedRevision = revision
      resetDrawableRetry()
    }
  }

  func resetDrawableRetry() {
    precondition(Thread.isMainThread)
    canRetryDrawable = true
  }

  func beginFrame() -> Bool {
    precondition(Thread.isMainThread)
    guard inFlightCount < Self.limit else {
      waitingForCapacity = true
      return false
    }
    waitingForCapacity = false
    inFlightCount += 1
    return true
  }

  func finishFrame() {
    precondition(Thread.isMainThread)
    precondition(inFlightCount > 0)
    inFlightCount -= 1
    if waitingForCapacity {
      waitingForCapacity = false
      onNeedsFrame?()
    }
  }

  func retryDrawable() {
    precondition(Thread.isMainThread)
    // One retry per revision/resume avoids an idle loop for a persistently unavailable surface.
    guard canRetryDrawable else { return }
    canRetryDrawable = false
    onNeedsFrame?()
  }
}
