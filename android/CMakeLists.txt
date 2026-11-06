cmake_minimum_required(VERSION 3.22.1)
project(tradingcharts LANGUAGES CXX)

include(${CMAKE_CURRENT_LIST_DIR}/../cpp/engine_sources.cmake)

add_library(
  tradingcharts
  SHARED
  ${TRADING_CHARTS_ENGINE_SOURCES}
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

# 16 KB page size support (Android 15+). Needed on NDK < r28; harmless on r28+.
if(ANDROID_ABI STREQUAL "arm64-v8a" OR ANDROID_ABI STREQUAL "x86_64")
  target_link_options(tradingcharts PRIVATE "-Wl,-z,max-page-size=16384")
endif()
