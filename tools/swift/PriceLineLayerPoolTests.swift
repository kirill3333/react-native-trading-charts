// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import QuartzCore
import XCTest

final class PriceLineLayerPoolTests: XCTestCase {
  func testChurnReusesLayersAndKeepsSurvivingIDs() throws {
    let pool = PriceLineLayerPool<CALayer>()
    let container = CALayer()
    var shown: [String: CALayer] = [:]
    func show(_ ids: [String]) {
      shown.removeAll()
      pool.reconcile(ids, id: { $0 }, acquire: { recycled in
        let layer = recycled ?? CALayer()
        container.addSublayer(layer)
        return layer
      }, hide: { $0.isHidden = true }, apply: { id, layer in
        layer.isHidden = false
        shown[id] = layer
      })
    }

    show(["0", "fixed"])
    let fixed = try XCTUnwrap(shown["fixed"])
    let reused = try XCTUnwrap(shown["0"])
    for index in 1...1000 {
      let id = String(index)
      show([id, "fixed"])
      XCTAssertNil(shown[String(index - 1)])
      XCTAssertTrue(shown["fixed"] === fixed)
      XCTAssertTrue(shown[id] === reused)
      XCTAssertTrue(container.sublayers?.last === reused)
      XCTAssertFalse(reused.isHidden)
    }
    XCTAssertEqual(container.sublayers?.count, 2)
    show([])
    XCTAssertNil(shown["fixed"])
    XCTAssertTrue(fixed.isHidden && reused.isHidden)
    show(["again"])
    XCTAssertFalse(try XCTUnwrap(shown["again"]).isHidden)
    XCTAssertEqual(container.sublayers?.count, 2)
  }
}
