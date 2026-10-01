import Foundation
import XCTest

final class ExamplePerformanceTests: XCTestCase {
  private func thread(_ id: String = "1", name: String = "JS", cpu: Double? = 0) -> PerformanceThread {
    PerformanceThread(id: id, name: name, isMainThread: false, isJSThread: true, cpuSeconds: cpu)
  }

  private func window() -> PerformanceMeasurements {
    PerformanceMeasurements(chartId: "chart", names: ["JS"], includeMain: true, interval: 1)
  }

  func testCPUUsesElapsedTimeAndStableIDs() throws {
    let measurement = window()
    XCTAssertNil(measurement.sample(at: 10, threads: [thread(cpu: 5)]))
    let sample = try XCTUnwrap(measurement.sample(at: 12, threads: [thread(cpu: 5.5)]))
    let rows = try XCTUnwrap(sample["threads"] as? [[String: Any]])
    XCTAssertEqual(rows[0]["cpuPercent"] as? Double, 25)
    XCTAssertEqual(sample["intervalMs"] as? Double, 2000)
    let replacement = try XCTUnwrap(measurement.sample(at: 13, threads: [thread("2", cpu: 20)]))
    let replacedRows = try XCTUnwrap(replacement["threads"] as? [[String: Any]])
    XCTAssertTrue(replacedRows[0]["cpuPercent"] is NSNull)
  }

  func testMissingAndDuplicateThreadNames() throws {
    let measurement = window()
    _ = measurement.sample(at: 1, threads: [thread("1"), thread("2")])
    let sample = try XCTUnwrap(measurement.sample(at: 2, threads: [thread("1", cpu: 0.1), thread("2", cpu: nil)]))
    let rows = try XCTUnwrap(sample["threads"] as? [[String: Any]])
    XCTAssertEqual(rows.count, 2)
    XCTAssertEqual(rows[0]["cpuPercent"] as? Double, 10)
    XCTAssertTrue(rows[1]["cpuPercent"] is NSNull)
    let missing = try XCTUnwrap(measurement.sample(at: 3, threads: []))
    XCTAssertEqual(missing["missingThreadNames"] as? [String], ["JS"])
  }

  func testFramesConnectionAndReset() throws {
    let measurement = window()
    measurement.setConnected(true)
    _ = measurement.sample(at: 10, threads: [])
    measurement.recordFrame(at: 0)
    measurement.recordFrame(at: .nan)
    measurement.recordFrame(at: 9)
    measurement.recordFrame(at: 10.1)
    measurement.recordFrame(at: 10.4)
    let sample = try XCTUnwrap(measurement.sample(at: 11, threads: []))
    XCTAssertEqual(sample["metalFPS"] as? Double, 2)
    XCTAssertEqual(sample["presentedFrames"] as? Int, 2)
    measurement.recordFrame(at: 10.9) // Presentation callback delivered after the previous sample.
    XCTAssertEqual(measurement.sample(at: 12, threads: [])?["metalFPS"] as? Double, 1)
    measurement.setConnected(false)
    XCTAssertTrue(measurement.sample(at: 13, threads: [])?["metalFPS"] is NSNull)
    measurement.reset()
    measurement.recordFrame(at: 13.1)
    XCTAssertNil(measurement.sample(at: 100, threads: []))
    measurement.setConnected(true)
    XCTAssertTrue(measurement.sample(at: 101, threads: [])?["metalFPS"] is NSNull)
    XCTAssertEqual(measurement.sample(at: 102, threads: [])?["metalFPS"] as? Double, 0)
  }

  func testUIFPSUsesElapsedTimeAndResetsBaseline() throws {
    let measurement = window()
    let generation = UUID()
    func frames(_ count: Int) -> PerformanceDisplaySample {
      PerformanceDisplaySample(generation: generation, count: count)
    }
    XCTAssertNil(measurement.sample(at: 10, threads: [], uiFrames: frames(100)))
    let sample = try XCTUnwrap(measurement.sample(at: 12, threads: [], uiFrames: frames(220)))
    XCTAssertEqual(sample["uiFPS"] as? Double, 60)
    // A stalled main thread contributes no callbacks even while native sampling continues.
    XCTAssertEqual(measurement.sample(at: 13, threads: [], uiFrames: frames(220))?["uiFPS"] as? Double, 0)
    measurement.reset()
    XCTAssertNil(measurement.sample(at: 100, threads: [], uiFrames: nil))
    XCTAssertTrue(measurement.sample(at: 101, threads: [], uiFrames: frames(20))?["uiFPS"] is NSNull)
    XCTAssertEqual(measurement.sample(at: 102, threads: [], uiFrames: frames(140))?["uiFPS"] as? Double, 120)
    let restarted = PerformanceDisplaySample(generation: UUID(), count: 200)
    XCTAssertTrue(measurement.sample(at: 103, threads: [], uiFrames: restarted)?["uiFPS"] is NSNull)
  }

  func testDeliveryIsBoundedAndRejectsStaleAcknowledgements() {
    let delivery = PerformanceDelivery()
    XCTAssertEqual(delivery.offer(["timestamp": 1])?["sequence"] as? Int, 1)
    for value in 2...1000 { XCTAssertNil(delivery.offer(["timestamp": value])) }
    XCTAssertNil(delivery.acknowledge(0))
    let latest = delivery.acknowledge(1)
    XCTAssertEqual(latest?["timestamp"] as? Int, 1000)
    XCTAssertEqual(latest?["sequence"] as? Int, 2)
    XCTAssertNil(delivery.acknowledge(1))
    XCTAssertNil(delivery.offer(["timestamp": 1001]))
    delivery.discardPending()
    XCTAssertNil(delivery.acknowledge(2))
    XCTAssertEqual(delivery.offer(["timestamp": 2000])?["sequence"] as? Int, 3)
  }

  func testPresentationCallbacksStopWithObserverAndOwner() throws {
    let bridge = ChartPresentationDiagnostics.shared
    var frames: [Double] = []
    var connected: [Bool] = []
    let token = bridge.observe("test-chart", frame: { frames.append($0) }, connection: { connected.append($0) })
    XCTAssertEqual(connected, [false])
    bridge.connect(owner: "test-owner", chartId: "test-chart")
    XCTAssertEqual(connected, [false, true])
    let handler = try XCTUnwrap(bridge.presentationHandler(owner: "test-owner"))
    handler(0)
    handler(1)
    XCTAssertEqual(frames, [1])
    bridge.connect(owner: "test-owner", chartId: nil)
    handler(2)
    XCTAssertEqual(frames, [1])
    bridge.connect(owner: "test-owner", chartId: "test-chart")
    handler(3)
    XCTAssertEqual(frames, [1])
    let newHandler = try XCTUnwrap(bridge.presentationHandler(owner: "test-owner"))
    newHandler(4)
    bridge.removeObserver(token)
    newHandler(5)
    XCTAssertEqual(frames, [1, 4])
    XCTAssertNil(bridge.presentationHandler(owner: "test-owner"))
    bridge.connect(owner: "test-owner", chartId: nil)
  }

  func testMachReaderFindsCallingThread() throws {
    let current = PerformanceThreadReader.currentThreadId()
    let threads = try XCTUnwrap(PerformanceThreadReader.read(mainThreadId: current))
    let calling = try XCTUnwrap(threads.first { $0.id == String(current) })
    XCTAssertTrue(calling.isMainThread)
    XCTAssertNotNil(calling.cpuSeconds)
  }
}
