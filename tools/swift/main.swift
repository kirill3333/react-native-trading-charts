// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation
import XCTest

private final class TestBuffer {
  let capacity: Int
  var value: UInt64 = 0

  init(capacity: Int) {
    self.capacity = capacity
  }
}

final class BufferOwnershipTests: XCTestCase {
  func testBusyBuffersAreImmutableAndBounded() throws {
    var allocations = 0
    let pool = ChartVertexBufferPool<TestBuffer> {
      allocations += 1
      return TestBuffer(capacity: $0)
    }
    let slots = try (1...3).map { revision in
      try XCTUnwrap(pool.acquire(revision: UInt64(revision), byteCount: 24) {
        $0.value = UInt64(revision)
        return true
      })
    }
    XCTAssertNil(pool.acquire(revision: 4, byteCount: 10_000) { _ in
      XCTFail("An occupied buffer must never be written")
      return true
    })
    XCTAssertEqual(allocations, 3)
    XCTAssertEqual(slots.map { $0.buffer?.value }, [1, 2, 3])
    pool.release(slots[1])
    let next = try XCTUnwrap(pool.acquire(revision: 4, byteCount: 24) {
      $0.value = 4
      return true
    })
    XCTAssertTrue(next === slots[1])
    XCTAssertEqual(slots[0].buffer?.value, 1)
    XCTAssertEqual(slots[2].buffer?.value, 3)
    XCTAssertEqual(allocations, 3)
    pool.release(slots[0])
    pool.release(next)
    pool.release(slots[2])
  }

  func testRevisionIsSharedUntilEveryReaderCompletes() throws {
    let pool = ChartVertexBufferPool<TestBuffer> { TestBuffer(capacity: $0) }
    var uploads = 0
    let first = try XCTUnwrap(pool.acquire(revision: 10, byteCount: 24) {
      uploads += 1
      $0.value = 10
      return true
    })
    let second = try XCTUnwrap(pool.acquire(revision: 10, byteCount: 24) { _ in
      uploads += 1
      return true
    })
    XCTAssertTrue(first === second)
    let others = try (11...12).map { revision in
      try XCTUnwrap(pool.acquire(revision: UInt64(revision), byteCount: 24) { _ in true })
    }
    pool.release(first)
    XCTAssertNil(pool.acquire(revision: 13, byteCount: 24) { _ in true })
    XCTAssertEqual(second.buffer?.value, 10)
    pool.release(second)
    let repeated = try XCTUnwrap(pool.acquire(revision: 10, byteCount: 24) { _ in
      uploads += 1
      return true
    })
    XCTAssertEqual(uploads, 1, "A forced redraw must reuse the cached revision")
    pool.release(repeated)
    let replacement = try XCTUnwrap(pool.acquire(revision: 13, byteCount: 24) { _ in true })
    XCTAssertTrue(replacement === first)
    pool.release(replacement)
    others.forEach { pool.release($0) }
  }

  func testCrosshairFramesUploadContentOnce() throws {
    let content = ChartVertexBufferPool<TestBuffer> { TestBuffer(capacity: $0) }
    let overlay = ChartVertexBufferPool<TestBuffer> { TestBuffer(capacity: $0) }
    var contentUploads = 0
    var overlayUploads = 0
    let commands = try (1...3).map { revision in
      let contentSlot = try XCTUnwrap(content.acquire(revision: 1, byteCount: 24) { _ in
        contentUploads += 1
        return true
      })
      let overlaySlot = try XCTUnwrap(overlay.acquire(revision: UInt64(revision), byteCount: 24) {
        overlayUploads += 1
        $0.value = UInt64(revision)
        return true
      })
      return (contentSlot, overlaySlot)
    }
    XCTAssertEqual(contentUploads, 1)
    XCTAssertEqual(overlayUploads, 3)
    XCTAssertEqual(commands.map { $0.1.buffer?.value }, [1, 2, 3])
    // Completion order is deliberately different from submission order.
    for index in [1, 2, 0] {
      content.release(commands[index].0)
      overlay.release(commands[index].1)
    }
    XCTAssertEqual(commands[0].0.readers, 0)
  }

  func testEmptyGeometryAndGrowOnlyCapacity() throws {
    var allocations = 0
    let pool = ChartVertexBufferPool<TestBuffer> {
      allocations += 1
      return TestBuffer(capacity: $0)
    }
    let empty = try XCTUnwrap(pool.acquire(revision: 0, byteCount: 0) { _ in
      XCTFail("Empty geometry must not upload or allocate")
      return false
    })
    XCTAssertEqual(empty.revision, 0)
    XCTAssertNil(empty.buffer)
    XCTAssertEqual(allocations, 0)
    pool.release(empty)
    let small = try XCTUnwrap(pool.acquire(revision: 1, byteCount: 24) { _ in true })
    let firstBuffer = small.buffer
    let firstCapacity = small.capacity
    pool.release(small)
    let smaller = try XCTUnwrap(pool.acquire(revision: 2, byteCount: 12) { _ in true })
    XCTAssertTrue(smaller.buffer === firstBuffer)
    pool.release(smaller)
    let large = try XCTUnwrap(pool.acquire(revision: 3, byteCount: firstCapacity + 1) { _ in true })
    XCTAssertGreaterThan(large.capacity, firstCapacity)
    XCTAssertEqual(large.capacity, large.buffer?.capacity)
    XCTAssertEqual(allocations, 2)
    let grownCapacity = large.capacity
    pool.release(large)
    let cleared = try XCTUnwrap(pool.acquire(revision: 4, byteCount: 0) { _ in false })
    XCTAssertEqual(cleared.capacity, grownCapacity)
    pool.release(cleared)
  }

  func testAllocationAndUploadFailuresDoNotPublishRevisionOrLeakSlot() throws {
    var failAllocation = false
    let pool = ChartVertexBufferPool<TestBuffer> {
      failAllocation ? nil : TestBuffer(capacity: $0)
    }
    let initial = try XCTUnwrap(pool.acquire(revision: 1, byteCount: 24) {
      $0.value = 1
      return true
    })
    pool.release(initial)
    let oldBuffer = initial.buffer
    let capacity = initial.capacity
    failAllocation = true
    XCTAssertNil(pool.acquire(revision: 2, byteCount: capacity + 1) { _ in true })
    XCTAssertTrue(initial.buffer === oldBuffer)
    XCTAssertEqual(initial.capacity, capacity)
    XCTAssertEqual(initial.revision, 1)
    XCTAssertEqual(initial.readers, 0)
    XCTAssertNil(pool.acquire(revision: 3, byteCount: 24) {
      $0.value = 3
      return false
    })
    XCTAssertNil(initial.revision, "A failed upload may have overwritten the old contents")
    XCTAssertEqual(initial.readers, 0)
    let recovered = try XCTUnwrap(pool.acquire(revision: 1, byteCount: 24) {
      $0.value = 1
      return true
    })
    XCTAssertEqual(recovered.buffer?.value, 1)
    pool.release(recovered)
  }
}

final class FrameSchedulingTests: XCTestCase {
  func testCompletionSchedulesLatestDeferredFrameOnce() {
    let state = ChartFrameFlightState()
    var latestRevision: UInt64 = 0
    var scheduled = false
    var wakeups = 0
    state.onNeedsFrame = {
      scheduled = true
      wakeups += 1
    }
    for revision in 1...3 {
      state.submit(revision: UInt64(revision))
      XCTAssertTrue(state.beginFrame())
    }
    for revision in 4...10 {
      latestRevision = UInt64(revision)
      state.submit(revision: latestRevision)
      XCTAssertFalse(state.beginFrame())
    }
    XCTAssertEqual(state.inFlightCount, 3)
    XCTAssertEqual(wakeups, 0)
    state.finishFrame()
    state.finishFrame()
    XCTAssertTrue(scheduled)
    XCTAssertEqual(wakeups, 1)
    // Run the scheduled frame without another external data or gesture event.
    XCTAssertEqual(latestRevision, 10)
    XCTAssertTrue(state.beginFrame())
    state.finishFrame()
    state.finishFrame()
    XCTAssertEqual(state.inFlightCount, 0)
    XCTAssertEqual(wakeups, 1, "An idle chart must not schedule more frames")
  }

  func testFailedPreparationReleasesReservationsWithoutRetryLoop() throws {
    let state = ChartFrameFlightState()
    let content = ChartVertexBufferPool<TestBuffer> { TestBuffer(capacity: $0) }
    let overlay = ChartVertexBufferPool<TestBuffer> { _ in nil }
    var wakeups = 0
    state.onNeedsFrame = { wakeups += 1 }
    for revision in 1...5 {
      XCTAssertTrue(state.beginFrame())
      let slot = try XCTUnwrap(content.acquire(revision: UInt64(revision), byteCount: 24) { _ in true })
      XCTAssertNil(overlay.acquire(revision: UInt64(revision), byteCount: 24) { _ in true })
      content.release(slot)
      state.finishFrame()
    }
    // A failed encoder also returns a permit without marking work as deferred.
    XCTAssertTrue(state.beginFrame())
    state.finishFrame()
    XCTAssertEqual(state.inFlightCount, 0)
    XCTAssertEqual(wakeups, 0)
  }

  func testDrawableRetryIsBoundedAndResetsOnNewRevisionOrResume() {
    let state = ChartFrameFlightState()
    var wakeups = 0
    state.onNeedsFrame = { wakeups += 1 }
    state.submit(revision: 1)
    for _ in 0..<3 {
      XCTAssertTrue(state.beginFrame())
      state.retryDrawable()
      state.finishFrame()
      state.submit(revision: 1)
    }
    XCTAssertEqual(wakeups, 1)
    state.submit(revision: 2)
    state.retryDrawable()
    XCTAssertEqual(wakeups, 2)
    state.resetDrawableRetry()
    state.retryDrawable()
    XCTAssertEqual(wakeups, 3)
  }

  func testCompletionAfterDetachReleasesOwnershipWithoutKeepingHostAlive() throws {
    final class Host {
      var active = true
      var wakeups = 0
      func request() { if active { wakeups += 1 } }
    }
    let state = ChartFrameFlightState()
    let pool = ChartVertexBufferPool<TestBuffer> { TestBuffer(capacity: $0) }
    var host: Host? = Host()
    let isHostReleased = { [weak host] in host == nil }
    state.onNeedsFrame = { [weak host] in host?.request() }
    let slots = try (1...3).map { revision in
      XCTAssertTrue(state.beginFrame())
      return try XCTUnwrap(pool.acquire(revision: UInt64(revision), byteCount: 24) { _ in true })
    }
    XCTAssertFalse(state.beginFrame())
    host?.active = false
    pool.release(slots[0])
    state.finishFrame()
    XCTAssertEqual(host?.wakeups, 0)
    host = nil
    XCTAssertTrue(isHostReleased())
    for slot in slots.dropFirst() {
      pool.release(slot)
      state.finishFrame()
    }
    XCTAssertEqual(state.inFlightCount, 0)
    XCTAssertTrue(slots.allSatisfy { $0.readers == 0 })
  }
}

final class PriceScaleChangeTests: XCTestCase {
  func testCoalescesEachScaleAndEmitsLegacyOnlyForMain() {
    var changes = ChartPriceScaleChanges()
    let input = [
      ChartPriceScaleChange(paneId: "volume", priceScaleId: "v", scale: 0.9, isMainPane: false),
      ChartPriceScaleChange(paneId: "main", priceScaleId: "m", scale: 1.1, isMainPane: true),
      ChartPriceScaleChange(paneId: "volume", priceScaleId: "v", scale: 0.8, isMainPane: false),
      ChartPriceScaleChange(paneId: "main", priceScaleId: "m", scale: 1.2, isMainPane: true)
    ]
    for change in input {
      changes.record(ChartScaleYResult(stateChanged: true, priceScaleChange: change))
    }
    var main: [Double] = []
    var emitted: [ChartPriceScaleChange] = []
    changes.emit(mainScale: { main.append($0) }, priceScale: { emitted.append($0) })
    XCTAssertEqual(main, [1.2])
    XCTAssertEqual(emitted.map { $0.paneId }, ["volume", "main"])
    XCTAssertEqual(emitted.map { $0.priceScaleId }, ["v", "m"])
    XCTAssertEqual(emitted.map { $0.scale }, [0.8, 1.2])
    changes.emit(mainScale: { _ in XCTFail("Already drained") },
                 priceScale: { _ in XCTFail("Already drained") })
  }

  func testOverlayOnlyAndUnchangedResultsEmitNothing() {
    var changes = ChartPriceScaleChanges()
    changes.record(ChartScaleYResult(stateChanged: true, priceScaleChange: nil))
    changes.record(ChartScaleYResult(stateChanged: false, priceScaleChange: nil))
    changes.emit(mainScale: { _ in XCTFail("No scale mutation") },
                 priceScale: { _ in XCTFail("No scale mutation") })
    changes.record(ChartScaleYResult(stateChanged: true, priceScaleChange:
      ChartPriceScaleChange(paneId: "volume", priceScaleId: "v", scale: 0.9, isMainPane: false)))
    changes.emit(mainScale: { _ in XCTFail("Secondary pane") }, priceScale: {
      XCTAssertEqual($0.scale, 0.9)
    })
  }

  func testClearDiscardsPendingChangesAndAllowsNewEvents() {
    var changes = ChartPriceScaleChanges()
    let change = ChartPriceScaleChange(
      paneId: "main", priceScaleId: "main", scale: 0.9, isMainPane: true)
    changes.record(ChartScaleYResult(stateChanged: true, priceScaleChange: change))
    changes.clear()
    changes.emit(mainScale: { _ in XCTFail("Cleared") }, priceScale: { _ in XCTFail("Cleared") })
    changes.record(ChartScaleYResult(stateChanged: true, priceScaleChange: change))
    var count = 0
    changes.emit(mainScale: { XCTAssertEqual($0, 0.9) }, priceScale: { _ in count += 1 })
    XCTAssertEqual(count, 1)
  }
}

let suite = XCTestSuite(name: "Metal buffer ownership and scheduling")
suite.addTest(BufferOwnershipTests.defaultTestSuite)
suite.addTest(FrameSchedulingTests.defaultTestSuite)
suite.addTest(PriceScaleChangeTests.defaultTestSuite)
suite.run()
guard let result = suite.testRun, result.executionCount == 12 else {
  fatalError("Expected all twelve regression tests to run")
}
exit(result.hasSucceeded ? 0 : 1)
