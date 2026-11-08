// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation
import XCTest

final class LegendRegistryTests: XCTestCase {
  func testLegendCommandReplaysAfterSeriesCreationWhenViewMounts() {
    let registry = TradingChartsRegistry()
    let target = LegendCommandRecorder()
    registry.addSeries("sma-options", chartId: "chart")
    registry.setSeriesLegendVisible("sma", visible: false, chartId: "chart")
    registry.registerView(target, chartId: "chart")
    registry.setSeriesLegendVisible("sma", visible: true, chartId: "chart")
    XCTAssertEqual(target.commands, ["sma-options", "sma=false", "sma=true"])
  }
}

private final class LegendCommandRecorder: NSObject, TradingChartsCommandTarget {
  var commands: [String] = []
  func addSeriesJson(_ json: String) { commands.append(json) }
  func setSeriesLegendVisible(_ seriesId: String, visible: Bool) {
    commands.append("\(seriesId)=\(visible)")
  }

  func applyHistoryData(_ data: [NSNumber]) {}
  func prependHistoryData(_ data: [NSNumber]) {}
  func applyCandleData(_ data: [NSNumber]) {}
  func applyTradeData(_ data: [NSNumber]) {}
  func applyTradesData(_ data: [NSNumber]) {}
  func setSeriesData(_ data: [NSNumber], seriesId: String, dataType: String, prepend: Bool, update: Bool) {}
  func removeSeries(_ seriesId: String) {}
  func setPaneHeight(_ paneId: String, weight: Double) {}
  func setPriceLine(_ id: String, price: Double, label: String, color: String) {}
  func removePriceLine(_ id: String) {}
  func clearPriceLines() {}
  func priceLinesJson() -> String { "[]" }
  func zoomByScale(_ scale: Double) {}
  func scrollChartToRealTime() {}
  func fitChartContent() {}
  func clearChartData() {}
  func candleData() -> [NSNumber] { [] }
}
