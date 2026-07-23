#!/usr/bin/env bash
set -euo pipefail

readonly build_dir="${TMPDIR:-/tmp}/trading-charts-cpp-tests"

cmake -S cpp -B "$build_dir" -DCMAKE_BUILD_TYPE=Release
cmake --build "$build_dir" --parallel
ctest --test-dir "$build_dir" --output-on-failure
