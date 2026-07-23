#!/usr/bin/env bash
set -euo pipefail

readonly script_dir="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
  pwd
)"
tool_dir="$(bash "$script_dir/bootstrap.sh")"
readonly tool_dir
readonly cpp_files=(
  cpp/chart_engine.h
  cpp/chart_engine.cc
  cpp/internal/render_snapshot_builder.h
  cpp/internal/render_snapshot_builder.cc
  cpp/tests/chart_engine_header_test.cc
  cpp/tests/chart_engine_test.cc
  android/src/main/cpp/chart_engine_jni.cc
)

"$tool_dir/cpplint" "${cpp_files[@]}"
