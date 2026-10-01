// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#if TRADING_CHARTS_EXAMPLE_DIAGNOSTICS
import Foundation

/// Example-only transport. No measurements or timers live in the library.
@objc(TCChartPresentationDiagnostics)
public final class ChartPresentationDiagnostics: NSObject {
  @objc public static let shared = ChartPresentationDiagnostics()

  private struct Observer {
    let chartId: String
    let frame: (Double) -> Void
    let connection: (Bool) -> Void
  }

  private let lock = NSLock()
  private var observers: [String: Observer] = [:]
  private var owners: [String: String] = [:]
  private var generations: [String: UUID] = [:]

  @objc public func observe(
    _ chartId: String,
    frame: @escaping (Double) -> Void,
    connection: @escaping (Bool) -> Void
  ) -> String {
    lock.lock()
    defer { lock.unlock() }
    let token = UUID().uuidString
    observers[token] = Observer(chartId: chartId, frame: frame, connection: connection)
    // Callbacks only enqueue work; their ordering is protected by this lock.
    connection(owners.values.contains(chartId))
    return token
  }

  @objc public func removeObserver(_ token: String) {
    lock.lock()
    defer { lock.unlock() }
    observers.removeValue(forKey: token)
  }

  func connect(owner: String, chartId: String?) {
    lock.lock()
    defer { lock.unlock() }
    let old = owners[owner]
    guard old != chartId else { return }
    owners[owner] = chartId
    generations[owner] = chartId == nil ? nil : UUID()
    for observer in observers.values where observer.chartId == old || observer.chartId == chartId {
      observer.connection(owners.values.contains(observer.chartId))
    }
  }

  func presentationHandler(owner: String) -> ((Double) -> Void)? {
    lock.lock()
    defer { lock.unlock() }
    guard let chartId = owners[owner], let generation = generations[owner] else { return nil }
    let tokens = observers.compactMap { $0.value.chartId == chartId ? $0.key : nil }
    guard !tokens.isEmpty else { return nil }
    return { [weak self] time in
      guard let self, time.isFinite, time > 0 else { return }
      self.lock.lock()
      defer { self.lock.unlock() }
      guard self.generations[owner] == generation else { return }
      for token in tokens { self.observers[token]?.frame(time) }
    }
  }
}
#endif
