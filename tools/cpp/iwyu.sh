#!/usr/bin/env bash
set -euo pipefail

readonly build_dir="${TMPDIR:-/tmp}/trading-charts-cpp-iwyu"

cmake \
  -S cpp \
  -B "$build_dir" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
iwyu_tool.py -p "$build_dir" \
  cpp/chart_engine.cc \
  cpp/internal/render_snapshot_builder.cc \
  cpp/internal/series_geometry.cc \
  cpp/tests/chart_engine_test.cc \
  -- \
  -Xiwyu --error
