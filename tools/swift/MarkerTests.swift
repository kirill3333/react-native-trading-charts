// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT
import Foundation
import XCTest

private final class MarkerTarget: NSObject, TradingChartsCommandTarget {
  var commands: [String] = []
  func setMarkerJson(_ json: String, replace: Bool) { commands.append("\(replace):\(json)") }
  func removeMarker(_ id: String) { commands.append("remove:\(id)") }
  func clearMarkers() { commands.append("clear") }
  func applyHistoryData(_ data: [NSNumber]) {}
  func prependHistoryData(_ data: [NSNumber]) {}
  func applyCandleData(_ data: [NSNumber]) {}
  func applyTradeData(_ data: [NSNumber]) {}
  func applyTradesData(_ data: [NSNumber]) {}
  func addSeriesJson(_ json: String) {}
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

final class MarkerRegistryTests: XCTestCase {
  func testUpdatesBeforeMountKeepOriginalStackOrder() {
    let registry = TradingChartsRegistry()
    registry.setMarker(#"{"id":"a","text":"A"}"#, chartId: "test", replace: false)
    registry.setMarker(#"{"id":"b","text":"B"}"#, chartId: "test", replace: false)
    registry.setMarker(#"{"id":"a","text":"NEW"}"#, chartId: "test", replace: false)
    let target = MarkerTarget()
    registry.registerView(target, chartId: "test")
    XCTAssertEqual(target.commands, [#"false:{"id":"a","text":"NEW"}"#, #"false:{"id":"b","text":"B"}"#])
  }

  func testReplacementClearsMarkerBacklogAndHistoryPreservesIt() {
    let registry = TradingChartsRegistry()
    registry.setMarker(#"{"id":"a"}"#, chartId: "test", replace: false)
    registry.removeMarker("a", chartId: "test")
    registry.setMarker("[]", chartId: "test", replace: true)
    registry.setHistory([], chartId: "test")
    let target = MarkerTarget()
    registry.registerView(target, chartId: "test")
    XCTAssertEqual(target.commands, ["true:[]"])
  }

  func testRemoveAndReaddAreNotCoalescedAcrossRemoval() {
    let registry = TradingChartsRegistry()
    let marker = #"{"id":"a"}"#
    registry.setMarker(marker, chartId: "test", replace: false)
    registry.removeMarker("a", chartId: "test")
    registry.setMarker(marker, chartId: "test", replace: false)
    let target = MarkerTarget()
    registry.registerView(target, chartId: "test")
    XCTAssertEqual(target.commands, ["false:\(marker)", "remove:a", "false:\(marker)"])
  }
}

final class MarkerPressTests: XCTestCase {
  func testDisabledAndMissedPressesAreNotConsumed() {
    let state = ChartMarkerPressState<String> { frame, point in point.x > 0 ? frame : nil }
    state.didSubmit("marker")
    XCTAssertFalse(state.press(at: CGPoint(x: 1, y: 1)) { _ in XCTFail("disabled") })
    state.enabled = true
    XCTAssertFalse(state.press(at: .zero) { _ in XCTFail("miss") })
    var values: [String] = []
    XCTAssertTrue(state.press(at: CGPoint(x: 1, y: 1)) { values.append($0) })
    XCTAssertEqual(values, ["marker"])
  }

  func testOnlySubmittedFrameReplacesPayload() {
    let state = ChartMarkerPressState<String> { frame, _ in frame }
    state.enabled = true
    state.didSubmit("old metadata")
    var value = ""
    XCTAssertTrue(state.press(at: .zero) { value = $0 })
    XCTAssertEqual(value, "old metadata")
    state.didSubmit("new metadata")
    XCTAssertTrue(state.press(at: .zero) { value = $0 })
    XCTAssertEqual(value, "new metadata")
  }

  func testClearingReleasesFrameAndPreventsStalePress() {
    final class Frame {}
    let state = ChartMarkerPressState<Frame> { _, _ in "hit" }
    state.enabled = true
    weak var reference: Frame?
    do {
      let frame = Frame()
      reference = frame
      state.didSubmit(frame)
    }
    XCTAssertNotNil(reference)
    state.clear()
    XCTAssertNil(reference)
    XCTAssertFalse(state.press(at: .zero) { _ in XCTFail("cleared") })
  }
}
