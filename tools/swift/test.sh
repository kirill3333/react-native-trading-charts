#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/trading-charts-swift.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
xctest_developer="$(xcrun --sdk macosx --show-sdk-platform-path)/Developer"
xctest_frameworks="$xctest_developer/Library/Frameworks"
xctest_libraries="$xctest_developer/usr/lib"

xcrun swiftc -swift-version 5 -warnings-as-errors -g \
  -module-cache-path "$test_dir/module-cache" \
  -F "$xctest_frameworks" -Xlinker -rpath -Xlinker "$xctest_frameworks" \
  -I "$xctest_libraries" -L "$xctest_libraries" \
  -Xlinker -rpath -Xlinker "$xctest_libraries" \
  -Xlinker -rpath -Xlinker "$xctest_developer/Library/PrivateFrameworks" \
  "$repo_root/ios/Rendering/ChartVertexBufferPool.swift" \
  "$repo_root/ios/Host/ChartPriceScaleChanges.swift" \
  "$repo_root/tools/swift/main.swift" \
  -o "$test_dir/buffer-tests"
"$test_dir/buffer-tests"
