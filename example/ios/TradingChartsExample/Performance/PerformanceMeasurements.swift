import Foundation

struct PerformanceThread {
  let id: String
  let name: String
  let isMainThread: Bool
  let isJSThread: Bool
  let cpuSeconds: Double?

  var metadata: [String: Any] {
    ["id": id, "name": name, "isMainThread": isMainThread, "isJSThread": isJSThread]
  }
}

struct PerformanceDisplaySample {
  let generation: UUID
  var count: Int
}

/// One subscription's measurement window. Confined to the sampler queue.
final class PerformanceMeasurements {
  let chartId: String
  let names: Set<String>
  let includeMain: Bool
  let interval: Double
  private(set) var startTime: Double?
  private var baseline: [String: Double] = [:]
  private var observationStart: Double?
  private var uiFrameBaseline: PerformanceDisplaySample?
  private var frameCount = 0
  private var connectionChanged = false
  private(set) var connected = false

  init(chartId: String, names: [String], includeMain: Bool, interval: Double) {
    self.chartId = chartId
    self.names = Set(names)
    self.includeMain = includeMain
    self.interval = interval
  }

  func reset() {
    uiFrameBaseline = nil
    startTime = nil
    observationStart = nil
    baseline.removeAll(keepingCapacity: true)
    frameCount = 0
    connectionChanged = false
  }

  func setConnected(_ value: Bool) {
    if connected != value {
      connected = value
      connectionChanged = true
      frameCount = 0
    }
  }

  func recordFrame(at time: Double) {
    // Credit delayed presentation callbacks in the next delivery window, rather than losing frames.
    guard let observationStart, connected, time.isFinite, time > 0, time >= observationStart else { return }
    frameCount += 1
  }

  func sample(
    at time: Double, threads: [PerformanceThread], uiFrames: PerformanceDisplaySample? = nil
  ) -> [String: Any]? {
    let selected = threads.filter { (includeMain && $0.isMainThread) || names.contains($0.name) }
    guard let startTime else {
      begin(at: time, threads: selected, uiFrames: uiFrames)
      return nil
    }
    let elapsed = time - startTime
    guard elapsed >= interval else { return nil }
    let rows: [[String: Any]] = selected.map { thread in
      var row = thread.metadata
      if let previous = baseline[thread.id], let current = thread.cpuSeconds, current >= previous {
        row["cpuPercent"] = min(100, 100 * (current - previous) / elapsed)
      } else {
        row["cpuPercent"] = NSNull()
      }
      return row
    }
    let uiFPS: Any
    if let previous = uiFrameBaseline, let current = uiFrames,
      current.generation == previous.generation, current.count >= previous.count {
      uiFPS = Double(current.count - previous.count) / elapsed
    } else {
      uiFPS = NSNull()
    }
    let hasFrameWindow = connected && !connectionChanged
    let result: [String: Any] = [
      "uiFPS": uiFPS,
      "glFPS": NSNull(),
      "renderedFrames": NSNull(),
      "glThread": NSNull(),
      "timestamp": time,
      "intervalMs": elapsed * 1000,
      "threads": rows,
      "missingThreadNames": Array(names.subtracting(selected.map(\.name))).sorted(),
      "chartId": chartId,
      "presentedFrames": hasFrameWindow ? frameCount as Any : NSNull(),
      "metalFPS": hasFrameWindow ? Double(frameCount) / elapsed as Any : NSNull()
    ]
    begin(at: time, threads: selected, uiFrames: uiFrames)
    return result
  }

  private func begin(at time: Double, threads: [PerformanceThread], uiFrames: PerformanceDisplaySample?) {
    uiFrameBaseline = uiFrames
    startTime = time
    if observationStart == nil { observationStart = time }
    baseline = Dictionary(uniqueKeysWithValues: threads.compactMap { thread in
      thread.cpuSeconds.map { (thread.id, $0) }
    })
    frameCount = 0
    connectionChanged = false
  }
}

/// Backpressure: one event in JS plus one replaceable native sample.
final class PerformanceDelivery {
  private var sequence = 0
  private var outstanding: Int?
  private var latest: [String: Any]?

  func offer(_ sample: [String: Any]) -> [String: Any]? {
    guard outstanding == nil else {
      latest = sample
      return nil
    }
    sequence += 1
    outstanding = sequence
    var result = sample
    result["sequence"] = sequence
    return result
  }

  func acknowledge(_ value: Int) -> [String: Any]? {
    guard outstanding == value else { return nil }
    outstanding = nil
    guard let sample = latest else { return nil }
    latest = nil
    return offer(sample)
  }

  func discardPending() {
    latest = nil
  }
}
