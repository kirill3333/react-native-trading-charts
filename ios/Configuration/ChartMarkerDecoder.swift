// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

struct ChartMarkerPayload {
  let id: String
  let text: String
  let variantId: Int
  let values: [Double]
  let descriptor: String
}

/// JSON and font preparation live outside the shared geometry engine.
final class ChartMarkerDecoder {
  private var metrics: [Double: [Double]] = [:]
  #if MARKER_VARIANTS
    private let markerVariantAtlas: ChartMarkerVariantAtlas

    init(markerVariantAtlas: ChartMarkerVariantAtlas) {
      self.markerVariantAtlas = markerVariantAtlas
    }
  #else
    init() {}
  #endif

  func decode(_ json: String, replace: Bool) -> [ChartMarkerPayload]? {
    guard let data = json.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) else { return nil }
    let records: [[String: Any]]
    if replace {
      guard let array = object as? [[String: Any]] else { return nil }
      records = array
    } else {
      guard let record = object as? [String: Any] else { return nil }
      records = [record]
    }
    var result: [ChartMarkerPayload] = []
    var ids = Set<String>()
    for record in records {
      #if MARKER_VARIANTS
        let variantName = (record["variant"] as? String).flatMap { $0.isEmpty ? nil : $0 }
      #else
        let variantName: String? = nil
      #endif
      let text = record["text"] as? String ?? ""
      guard let id = record["id"] as? String, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            ids.insert(id).inserted,
            variantName != nil || ((1...5).contains(text.utf8.count)
              && text.utf8.allSatisfy({ (32...126).contains($0) })
              && text.contains(where: { $0 != " " })),
            let position = record["position"] as? String, ["above", "below"].contains(position)
      else { return nil }
      let keys = ["timestamp", "fontSize", "borderWidth", "paddingHorizontal", "paddingVertical",
                  "minWidth", "minHeight", "borderRadius", "offset"]
      var numbers: [Double] = []
      for key in keys {
        guard let number = record[key] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue >= 0 else { return nil }
        numbers.append(number.doubleValue)
      }
      let size = numbers[1]
      guard size > 0, size < Double(Float.greatestFiniteMagnitude),
            numbers[0] <= 9_007_199_254_740_991, numbers[0].rounded(.down) == numbers[0] else { return nil }
      if metrics[size] == nil { metrics[size] = ChartMarkerAtlas.metrics(size: size) }
      var values = [numbers[0], position == "below" ? 1.0 : 0.0]
      values.append(contentsOf: numbers.dropFirst())
      values.append(contentsOf: metrics[size]!)
      for key in ["backgroundColor", "textColor", "borderColor"] {
        guard let color = record[key] as? String,
              color.range(of: "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$", options: .regularExpression) != nil
        else { return nil }
        let value = colorFromHex(color, fallback: NativeColor())
        values.append(contentsOf: [Double(value.r), Double(value.g), Double(value.b), Double(value.a)])
      }
      guard let encoded = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            let descriptor = String(data: encoded, encoding: .utf8) else { return nil }
      let variantId: Int
      #if MARKER_VARIANTS
        if let variantName {
          guard let assigned = markerVariantAtlas.assign(variantName) else {
            NSLog("[TradingCharts] marker variant atlas is full; could not assign '%@'", variantName)
            return nil
          }
          variantId = assigned
        } else {
          variantId = -1
        }
      #else
        variantId = -1
      #endif
      result.append(
        ChartMarkerPayload(
          id: id,
          text: text,
          variantId: variantId,
          values: values,
          descriptor: descriptor
        )
      )
    }
    // Metrics are cheap to rebuild; avoid retaining every historical size forever.
    if metrics.count > 64 { metrics.removeAll(keepingCapacity: true) }
    return result
  }
}
