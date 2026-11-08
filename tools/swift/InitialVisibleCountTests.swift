// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Foundation

@main
enum InitialVisibleCountTests {
  static func main() {
    // Exercise the JSON boundary even if a caller bypasses the JS resolver.
    for value in ["2147483648", "1e100", "1.5", "0"] {
      precondition(ChartConfigurationDecoder.decode("{\"initialVisibleCount\":\(value)}") == nil)
    }
    let maximum = ChartConfigurationDecoder.decode("{\"initialVisibleCount\":2147483647}")
    precondition(maximum?.native.initial_visible_count == Int32.max)
  }
}
