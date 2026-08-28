#!/usr/bin/env bash
set -euo pipefail

readonly script_dir="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
  pwd
)"
tool_dir="$(bash "$script_dir/bootstrap.sh")"
readonly tool_dir
readonly clang_tidy="${CLANG_TIDY:-$tool_dir/clang-tidy}"
readonly clang_cxx="${CLANG_CXX:-${CXX:-c++}}"
readonly build_dir="${TMPDIR:-/tmp}/trading-charts-cpp-tidy"

cmake_args=(
  -S cpp
  -B "$build_dir"
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_CXX_COMPILER="$clang_cxx"
  -DCMAKE_CXX_CLANG_TIDY="$clang_tidy"
  -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
)
sdk_path=""
if [[ "$(uname -s)" == "Darwin" ]]; then
  sdk_path="$(xcrun --show-sdk-path)"
  cmake_args+=("-DCMAKE_OSX_SYSROOT=$sdk_path")
fi

cmake "${cmake_args[@]}"
cmake --build "$build_dir" --parallel

ios_interop_args=(
  -std=c++17
  -I.
  -Iios/cxx
)
if [[ -n "$sdk_path" ]]; then
  ios_interop_args+=(-isysroot "$sdk_path")
fi
"$clang_tidy" ios/cxx/TradingChartsCxx.cc -- \
  "${ios_interop_args[@]}"

if [[ -n "${JAVA_HOME:-}" ]]; then
  case "$(uname -s)" in
    Darwin) readonly jni_platform=darwin ;;
    Linux) readonly jni_platform=linux ;;
    *) readonly jni_platform="" ;;
  esac
  if [[ -n "$jni_platform" ]]; then
    jni_args=(
      -std=c++17
      -I.
      -I"$JAVA_HOME/include"
      -I"$JAVA_HOME/include/$jni_platform"
    )
    if [[ -n "$sdk_path" ]]; then
      jni_args+=(-isysroot "$sdk_path")
    fi
    "$clang_tidy" android/src/main/cpp/chart_engine_jni.cc -- \
      "${jni_args[@]}"
  fi
fi
