// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

struct ChartPriceScaleChange {
  let paneId: String
  let priceScaleId: String
  let scale: Double
  let isMainPane: Bool
}

struct ChartScaleYResult {
  let stateChanged: Bool
  let priceScaleChange: ChartPriceScaleChange?
}

struct ChartPriceScaleChanges {
  private var changes: [ChartPriceScaleChange] = []

  mutating func record(_ result: ChartScaleYResult) {
    guard let change = result.priceScaleChange else { return }
    if let index = changes.firstIndex(where: {
      $0.paneId == change.paneId && $0.priceScaleId == change.priceScaleId
    }) {
      changes[index] = change
    } else {
      changes.append(change)
    }
  }

  mutating func clear() {
    changes.removeAll(keepingCapacity: true)
  }

  mutating func emit(
    mainScale: (Double) -> Void,
    priceScale: (ChartPriceScaleChange) -> Void
  ) {
    let pending = changes
    clear()
    for change in pending {
      if change.isMainPane { mainScale(change.scale) }
      priceScale(change)
    }
  }
}
