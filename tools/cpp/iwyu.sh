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
  cpp/chart_engine_config.cc \
  cpp/chart_engine_data.cc \
  cpp/chart_engine_series.cc \
  cpp/chart_engine_viewport.cc \
  cpp/internal/config_normalization.cc \
  cpp/internal/indicator_series.cc \
  cpp/internal/packed_data.cc \
  cpp/internal/render_snapshot_builder.cc \
  cpp/internal/series_geometry.cc \
  cpp/tests/chart_engine_test.cc \
  -- \
  -Xiwyu --error
