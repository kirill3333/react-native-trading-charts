import Foundation
import QuartzCore
import UIKit

@objc protocol PerformancePresentationSource: AnyObject {
  func observe(
    _ chartId: String, frame: @escaping (Double) -> Void, connection: @escaping (Bool) -> Void
  ) -> String
  func removeObserver(_ token: String)
}

@objc final class ExamplePerformanceService: NSObject {
  private final class Subscription {
    let measurements: PerformanceMeasurements
    let delivery = PerformanceDelivery()
    var observer: String?
    var generation = UUID()

    init(chartId: String, names: [String], includeMain: Bool, interval: Double) {
      measurements = PerformanceMeasurements(
        chartId: chartId, names: names, includeMain: includeMain, interval: interval
      )
    }
  }

  private let queue = DispatchQueue(label: "example.performance.sampler", qos: .utility)
  private let displayFrames = PerformanceDisplayFrames()
  private let presentationSource: PerformancePresentationSource
  private let emit: ([String: Any]) -> Void
  private let mainThreadId: UInt64
  private var subscriptions: [String: Subscription] = [:]
  private var timer: DispatchSourceTimer?
  private var lifecycle: [NSObjectProtocol] = []
  private var active: Bool
  private var invalidated = false

  @objc init(presentationSource: PerformancePresentationSource, emit: @escaping ([String: Any]) -> Void) {
    precondition(Thread.isMainThread)
    self.presentationSource = presentationSource
    self.emit = emit
    mainThreadId = PerformanceThreadReader.currentThreadId()
    active = UIApplication.shared.applicationState == .active
    super.init()
    let center = NotificationCenter.default
    lifecycle = [
      center.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { [weak self] _ in
        self?.changeActivity(true)
      },
      center.addObserver(
        forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
      ) { [weak self] _ in
        self?.changeActivity(false)
      }
    ]
  }

  @objc func getThreads(_ completion: @escaping ([[String: Any]]?) -> Void) {
    queue.async { [weak self] in
      guard let self, !self.invalidated else { completion(nil); return }
      completion(PerformanceThreadReader.read(mainThreadId: self.mainThreadId)?.map(\.metadata))
    }
  }

  @objc func start(
    _ identifier: String, chartId: String, names: [String], includeMain: Bool, intervalMs: Double
  ) {
    queue.async { [weak self] in
      guard let self, !self.invalidated, !identifier.isEmpty, !chartId.isEmpty,
        intervalMs.isFinite, intervalMs >= 250
      else { return }
      self.remove(identifier)
      let subscription = Subscription(
        chartId: chartId, names: names, includeMain: includeMain, interval: intervalMs / 1000
      )
      self.subscriptions[identifier] = subscription
      if self.active { self.activate(subscription, identifier: identifier) }
      self.schedule()
    }
  }

  @objc func stop(_ identifier: String) {
    queue.async { [weak self] in
      guard let self else { return }
      self.remove(identifier)
      self.schedule()
    }
  }

  @objc func acknowledge(_ identifier: String, sequence: Double) {
    queue.async { [weak self] in
      guard let self, !self.invalidated, sequence.isFinite, sequence >= 0, sequence < Double(Int.max),
        let subscription = self.subscriptions[identifier]
      else { return }
      if let sample = subscription.delivery.acknowledge(Int(sequence)), self.active {
        self.emit(sample)
      }
    }
  }

  @objc func invalidate() {
    queue.async { [self] in
      guard !invalidated else { return }
      invalidated = true
      for observer in lifecycle { NotificationCenter.default.removeObserver(observer) }
      lifecycle.removeAll()
      timer?.cancel()
      timer = nil
      displayFrames.setRunning(false)
      for identifier in Array(subscriptions.keys) { remove(identifier) }
    }
  }

  private func remove(_ identifier: String) {
    guard let subscription = subscriptions.removeValue(forKey: identifier) else { return }
    deactivate(subscription)
  }

  private func deactivate(_ subscription: Subscription) {
    subscription.generation = UUID()
    if let observer = subscription.observer { presentationSource.removeObserver(observer) }
    subscription.observer = nil
    subscription.measurements.reset()
    subscription.delivery.discardPending()
  }

  private func activate(_ subscription: Subscription, identifier: String) {
    let generation = subscription.generation
    subscription.observer = presentationSource.observe(
      subscription.measurements.chartId,
      frame: { [weak self] time in
        self?.queue.async { [weak self] in
          guard let current = self?.subscriptions[identifier], current.generation == generation else { return }
          current.measurements.recordFrame(at: time)
        }
      },
      connection: { [weak self] connected in
        self?.queue.async { [weak self] in
          guard let self, let current = self.subscriptions[identifier], current.generation == generation else { return }
          current.measurements.setConnected(connected)
          // Connection starts a fresh window so partial attachment time isn't reported as FPS.
          current.measurements.reset()
          _ = current.measurements.sample(
            at: CACurrentMediaTime(), threads: PerformanceThreadReader.read(mainThreadId: self.mainThreadId) ?? [],
            uiFrames: self.displayFrames.snapshot
          )
          self.schedule()
        }
      }
    )
  }

  private func changeActivity(_ value: Bool) {
    queue.async { [weak self] in
      guard let self, !self.invalidated, self.active != value else { return }
      self.active = value
      for (identifier, subscription) in self.subscriptions {
        self.deactivate(subscription)
        if value { self.activate(subscription, identifier: identifier) }
      }
      self.schedule()
    }
  }

  private func schedule() {
    timer?.cancel()
    timer = nil
    let running = active && !invalidated && !subscriptions.isEmpty
    displayFrames.setRunning(running)
    guard running else { return }
    let now = CACurrentMediaTime()
    let delay = subscriptions.values.map { subscription in
      let measurement = subscription.measurements
      return max(0.001, (measurement.startTime ?? now) + measurement.interval - now)
    }.min() ?? 1
    let source = DispatchSource.makeTimerSource(queue: queue)
    source.schedule(deadline: .now() + delay, leeway: .milliseconds(10))
    source.setEventHandler { [weak self] in self?.tick() }
    timer = source
    source.resume()
  }

  private func tick() {
    guard active, !invalidated, !subscriptions.isEmpty else { return }
    let threads = PerformanceThreadReader.read(mainThreadId: mainThreadId) ?? []
    let uiFrames = displayFrames.snapshot
    let time = CACurrentMediaTime()
    for (identifier, subscription) in subscriptions {
      guard var sample = subscription.measurements.sample(
        at: time, threads: threads, uiFrames: uiFrames
      ) else { continue }
      sample["subscriptionId"] = identifier
      if let event = subscription.delivery.offer(sample) { emit(event) }
    }
    schedule()
  }
}

/// Main-run-loop callbacks, not compositor presentations. No per-frame dispatch or JS events.
private final class PerformanceDisplayFrames: NSObject {
  private let lock = NSLock()
  private var total: PerformanceDisplaySample?
  // Requests arrive only from the serial sampler queue.
  private var requestedRunning = false
  // Accessed only on the main queue. The service invalidates the link on teardown.
  private var displayLink: CADisplayLink?

  var snapshot: PerformanceDisplaySample? {
    lock.lock()
    defer { lock.unlock() }
    return total
  }

  func setRunning(_ running: Bool) {
    guard requestedRunning != running else { return }
    requestedRunning = running
    DispatchQueue.main.async { [self] in
      if running {
        guard displayLink == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(frame(_:)))
        let maximum = Float(UIScreen.main.maximumFramesPerSecond)
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: maximum, preferred: maximum)
        displayLink = link
        lock.lock()
        total = PerformanceDisplaySample(generation: UUID(), count: 0)
        lock.unlock()
        link.add(to: .main, forMode: .common)
      } else {
        displayLink?.invalidate()
        displayLink = nil
        lock.lock()
        total = nil
        lock.unlock()
      }
    }
  }

  @objc private func frame(_ link: CADisplayLink) {
    guard link === displayLink else { return }
    lock.lock()
    total?.count += 1
    lock.unlock()
  }
}
