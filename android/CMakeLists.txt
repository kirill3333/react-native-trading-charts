cmake_minimum_required(VERSION 3.22.1)
project(tradingcharts LANGUAGES CXX)

add_library(
  tradingcharts
  SHARED
  ../cpp/chart_engine.cc
  ../cpp/internal/render_snapshot_builder.cc
  ../cpp/internal/series_geometry.cc
  src/main/cpp/chart_engine_jni.cc
)

set_target_properties(
  tradingcharts
  PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
)

target_include_directories(
  tradingcharts
  PRIVATE
  ..
)

find_library(log-lib log)
target_link_libraries(tradingcharts PRIVATE ${log-lib})
