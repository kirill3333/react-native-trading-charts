#!/usr/bin/env bash
set -euo pipefail

readonly build_dir="${TMPDIR:-/tmp}/trading-charts-cpp-benchmarks"

cmake \
  -S cpp \
  -B "$build_dir" \
  -DCMAKE_BUILD_TYPE=Release \
  -DTRADING_CHARTS_BUILD_BENCHMARKS=ON
cmake --build "$build_dir" --config Release --target chart_engine_benchmark --parallel
"$build_dir/chart_engine_benchmark" "$@"
