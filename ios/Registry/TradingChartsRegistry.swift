// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

@objc public protocol TradingChartsCommandTarget: AnyObject {
  func applyHistoryData(_ data: [NSNumber])
  func prependHistoryData(_ data: [NSNumber])
  func applyCandleData(_ data: [NSNumber])
  func applyTradeData(_ data: [NSNumber])
  func applyTradesData(_ data: [NSNumber])
  func addSeriesJson(_ json: String)
  func setSeriesData(
    _ data: [NSNumber],
    seriesId: String,
    dataType: String,
    prepend: Bool,
    update: Bool
  )
  func removeSeries(_ seriesId: String)
  func setPaneHeight(_ paneId: String, weight: Double)
  func setPriceLine(_ id: String, price: Double, label: String, color: String)
  func removePriceLine(_ id: String)
  func clearPriceLines()
  func priceLinesJson() -> String
  func zoomByScale(_ scale: Double)
  func fitChartContent()
  func clearChartData()
  func candleData() -> [NSNumber]
}

private enum PendingCommand {
  case history([NSNumber])
  case prependHistory([NSNumber])
  case candle([NSNumber])
  case trade([NSNumber])
  case trades([NSNumber])
  case addSeries(String)
  case seriesData([NSNumber], seriesId: String, dataType: String, prepend: Bool, update: Bool)
  case removeSeries(String)
  case paneHeight(String, Double)
  case setPriceLine(String, Double, String, String)
  case removePriceLine(String)
  case clearPriceLines
  case zoom(Double)
  case fitContent

  var name: String {
    switch self {
    case .history: return "history"
    case .prependHistory: return "prependHistory"
    case .candle: return "candle"
    case .trade: return "trade"
    case .trades: return "trades"
    case .addSeries: return "addSeries"
    case .seriesData: return "seriesData"
    case .removeSeries: return "removeSeries"
    case .paneHeight: return "paneHeight"
    case .setPriceLine: return "setPriceLine"
    case .removePriceLine: return "removePriceLine"
    case .clearPriceLines: return "clearPriceLines"
    case .zoom: return "zoom"
    case .fitContent: return "fitContent"
    }
  }

  var isStreaming: Bool {
    switch self {
    case .candle, .trade, .trades: return true
    default: return false
    }
  }

  func replay(on target: TradingChartsCommandTarget) {
    switch self {
    case .history(let data): target.applyHistoryData(data)
    case .prependHistory(let data): target.prependHistoryData(data)
    case .candle(let data): target.applyCandleData(data)
    case .trade(let data): target.applyTradeData(data)
    case .trades(let data): target.applyTradesData(data)
    case .addSeries(let json): target.addSeriesJson(json)
    case .seriesData(let data, let seriesId, let dataType, let prepend, let update):
      target.setSeriesData(
        data,
        seriesId: seriesId,
        dataType: dataType,
        prepend: prepend,
        update: update
      )
    case .removeSeries(let seriesId): target.removeSeries(seriesId)
    case .paneHeight(let paneId, let weight): target.setPaneHeight(paneId, weight: weight)
    case .setPriceLine(let id, let price, let label, let color):
      target.setPriceLine(id, price: price, label: label, color: color)
    case .removePriceLine(let id): target.removePriceLine(id)
    case .clearPriceLines: target.clearPriceLines()
    case .zoom(let scale): target.zoomByScale(scale)
    case .fitContent: target.fitChartContent()
    }
  }
}

private final class RegistryEntry {
  weak var view: TradingChartsCommandTarget?
  var pending: [PendingCommand] = []
}

@objc(TradingChartsRegistry)
public final class TradingChartsRegistry: NSObject {
  @objc(shared) public static let shared = TradingChartsRegistry()
  private static let maxPendingCommands = 256
  private var entries: [String: RegistryEntry] = [:]

  @objc(registerView:chartId:)
  public func registerView(_ view: TradingChartsCommandTarget, chartId: String) {
    guard !chartId.isEmpty else { return }
    onMain { [self] in
      let entry = entry(for: chartId, create: true)!
      if let current = entry.view, current !== view {
        NSLog(
          "[TradingCharts] duplicate chartId '%@'; the newest Fabric view will receive updates",
          chartId
        )
      }
      entry.view = view
      let commands = entry.pending
      entry.pending.removeAll(keepingCapacity: true)
      commands.forEach { $0.replay(on: view) }
    }
  }

  @objc(unregisterView:chartId:)
  public func unregisterView(_ view: TradingChartsCommandTarget, chartId: String) {
    guard !chartId.isEmpty else { return }
    onMain { [self] in
      guard let entry = entry(for: chartId, create: false) else { return }
      if let current = entry.view, current === view { entry.view = nil }
      removeEmptyEntry(chartId, entry: entry)
    }
  }

  @objc(setHistory:chartId:)
  public func setHistory(_ data: [NSNumber], chartId: String) {
    enqueueData(.history(data), chartId: chartId, replacingHistory: true)
  }

  @objc(prependHistory:chartId:)
  public func prependHistory(_ data: [NSNumber], chartId: String) {
    enqueueData(.prependHistory(data), chartId: chartId)
  }

  @objc(updateCandle:chartId:)
  public func updateCandle(_ data: [NSNumber], chartId: String) {
    enqueueData(.candle(data), chartId: chartId)
  }

  @objc(updateTrade:chartId:)
  public func updateTrade(_ data: [NSNumber], chartId: String) {
    enqueueData(.trade(data), chartId: chartId)
  }

  @objc(updateTrades:chartId:)
  public func updateTrades(_ data: [NSNumber], chartId: String) {
    enqueueData(.trades(data), chartId: chartId)
  }

  @objc(addSeries:chartId:)
  public func addSeries(_ json: String, chartId: String) {
    enqueue(.addSeries(json), chartId: chartId)
  }

  @objc(setSeriesData:chartId:seriesId:dataType:prepend:update:)
  public func setSeriesData(
    _ data: [NSNumber],
    chartId: String,
    seriesId: String,
    dataType: String,
    prepend: Bool,
    update: Bool
  ) {
    guard !chartId.isEmpty, !seriesId.isEmpty else { return }
    onMain { [self] in
      let entry = entry(for: chartId, create: true)!
      let command = PendingCommand.seriesData(
        data,
        seriesId: seriesId,
        dataType: dataType,
        prepend: prepend,
        update: update
      )
      if let view = entry.view {
        command.replay(on: view)
        return
      }
      if !prepend, !update {
        entry.pending.removeAll {
          if case .seriesData(_, let pendingId, _, _, _) = $0 { return pendingId == seriesId }
          return false
        }
      }
      append(command, to: entry, chartId: chartId)
    }
  }

  @objc(removeSeries:chartId:)
  public func removeSeries(_ seriesId: String, chartId: String) {
    guard !seriesId.isEmpty else { return }
    enqueue(.removeSeries(seriesId), chartId: chartId)
  }

  @objc(setPaneHeight:weight:chartId:)
  public func setPaneHeight(_ paneId: String, weight: Double, chartId: String) {
    guard !chartId.isEmpty, !paneId.isEmpty else { return }
    onMain { [self] in
      let entry = entry(for: chartId, create: true)!
      let command = PendingCommand.paneHeight(paneId, weight)
      if let view = entry.view {
        command.replay(on: view)
        return
      }
      entry.pending.removeAll {
        if case .paneHeight(let pendingId, _) = $0 { return pendingId == paneId }
        return false
      }
      append(command, to: entry, chartId: chartId)
    }
  }

  @objc(setPriceLine:price:label:color:chartId:)
  public func setPriceLine(
    _ id: String,
    price: Double,
    label: String,
    color: String,
    chartId: String
  ) {
    coalescePriceLine(
      .setPriceLine(id, price, label, color),
      id: id,
      chartId: chartId
    )
  }

  @objc(removePriceLine:chartId:)
  public func removePriceLine(_ id: String, chartId: String) {
    coalescePriceLine(.removePriceLine(id), id: id, chartId: chartId)
  }

  @objc(clearPriceLinesForChart:)
  public func clearPriceLines(forChart chartId: String) {
    guard !chartId.isEmpty else { return }
    onMain { [self] in
      let entry = entry(for: chartId, create: true)!
      if let view = entry.view {
        view.clearPriceLines()
        return
      }
      entry.pending.removeAll { command in
        switch command {
        case .setPriceLine, .removePriceLine, .clearPriceLines: return true
        default: return false
        }
      }
      append(.clearPriceLines, to: entry, chartId: chartId)
    }
  }

  @objc(getPriceLinesForChart:success:failure:)
  public func getPriceLines(
    forChart chartId: String,
    success: @escaping (String) -> Void,
    failure: @escaping () -> Void
  ) {
    onMain { [self] in
      if let view = entry(for: chartId, create: false)?.view {
        success(view.priceLinesJson())
      } else {
        failure()
      }
    }
  }

  @objc(getCandlesForChart:success:failure:)
  public func getCandles(
    forChart chartId: String,
    success: @escaping ([NSNumber]) -> Void,
    failure: @escaping () -> Void
  ) {
    onMain { [self] in
      if let view = entry(for: chartId, create: false)?.view { success(view.candleData()) } else { failure() }
    }
  }

  @objc(zoomChart:scale:)
  public func zoomChart(_ chartId: String, scale: Double) {
    enqueue(.zoom(scale), chartId: chartId)
  }

  @objc(fitContentForChart:)
  public func fitContent(forChart chartId: String) {
    guard !chartId.isEmpty else { return }
    onMain { [self] in
      let entry = entry(for: chartId, create: true)!
      if let view = entry.view {
        view.fitChartContent()
        return
      }
      entry.pending.removeAll { if case .fitContent = $0 { return true }; return false }
      append(.fitContent, to: entry, chartId: chartId)
    }
  }

  @objc(clearChart:)
  public func clearChart(_ chartId: String) {
    guard !chartId.isEmpty else { return }
    onMain { [self] in
      guard let entry = entry(for: chartId, create: false) else { return }
      entry.pending.removeAll {
        switch $0 {
        case .history, .prependHistory, .candle, .trade, .trades, .seriesData: return true
        default: return false
        }
      }
      entry.view?.clearChartData()
      removeEmptyEntry(chartId, entry: entry)
    }
  }

  private func enqueueData(
    _ command: PendingCommand,
    chartId: String,
    replacingHistory: Bool = false
  ) {
    guard !chartId.isEmpty else { return }
    onMain { [self] in
      let entry = entry(for: chartId, create: true)!
      if let view = entry.view {
        command.replay(on: view)
        return
      }
      if replacingHistory {
        entry.pending.removeAll {
          switch $0 {
          case .history, .prependHistory, .candle, .trade, .trades: return true
          default: return false
          }
        }
      }
      append(command, to: entry, chartId: chartId)
    }
  }

  private func enqueue(_ command: PendingCommand, chartId: String) {
    guard !chartId.isEmpty else { return }
    onMain { [self] in
      let entry = entry(for: chartId, create: true)!
      if let view = entry.view { command.replay(on: view) } else { append(command, to: entry, chartId: chartId) }
    }
  }

  private func coalescePriceLine(_ command: PendingCommand, id: String, chartId: String) {
    guard !chartId.isEmpty, !id.isEmpty else { return }
    onMain { [self] in
      let entry = entry(for: chartId, create: true)!
      if let view = entry.view {
        command.replay(on: view)
        return
      }
      entry.pending.removeAll { pending in
        switch pending {
        case .setPriceLine(let pendingId, _, _, _), .removePriceLine(let pendingId):
          return pendingId == id
        default:
          return false
        }
      }
      append(command, to: entry, chartId: chartId)
    }
  }

  private func append(_ command: PendingCommand, to entry: RegistryEntry, chartId: String) {
    entry.pending.append(command)
    while entry.pending.count > Self.maxPendingCommands {
      let index = entry.pending.firstIndex(where: \.isStreaming) ?? 0
      let dropped = entry.pending.remove(at: index)
      NSLog(
        "[TradingCharts] pending command limit reached for '%@'; dropping %@",
        chartId,
        dropped.name
      )
    }
  }

  private func entry(for chartId: String, create: Bool) -> RegistryEntry? {
    if let entry = entries[chartId] { return entry }
    guard create else { return nil }
    let entry = RegistryEntry()
    entries[chartId] = entry
    return entry
  }

  private func removeEmptyEntry(_ chartId: String, entry: RegistryEntry) {
    if entry.view == nil, entry.pending.isEmpty { entries.removeValue(forKey: chartId) }
  }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
  }
}
