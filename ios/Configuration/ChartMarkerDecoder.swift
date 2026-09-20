// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

struct ChartMarkerPayload {
  let id: String
  let text: String
  let values: [Double]
  let descriptor: String
}

/// JSON and font preparation live outside the shared geometry engine.
final class ChartMarkerDecoder {
  private var metrics: [Double: [Double]] = [:]

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
      guard let id = record["id"] as? String, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            ids.insert(id).inserted,
            let text = record["text"] as? String,
            (1...5).contains(text.utf8.count),
            text.utf8.allSatisfy({ (32...126).contains($0) }), text.contains(where: { $0 != " " }),
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
      result.append(ChartMarkerPayload(id: id, text: text, values: values, descriptor: descriptor))
    }
    // Metrics are cheap to rebuild; avoid retaining every historical size forever.
    if metrics.count > 64 { metrics.removeAll(keepingCapacity: true) }
    return result
  }
}
