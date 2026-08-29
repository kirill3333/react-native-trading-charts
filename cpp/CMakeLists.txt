cmake_minimum_required(VERSION 3.22.1)
project(trading_charts_engine LANGUAGES CXX)

include(${CMAKE_CURRENT_LIST_DIR}/engine_sources.cmake)

option(
  TRADING_CHARTS_BUILD_BENCHMARKS
  "Build standalone ChartEngine benchmarks"
  OFF
)

add_library(
  trading_charts_engine
  STATIC
  ${TRADING_CHARTS_ENGINE_SOURCES}
)

target_include_directories(
  trading_charts_engine
  PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/..
)

target_compile_features(trading_charts_engine PUBLIC cxx_std_17)

if(CMAKE_CXX_COMPILER_ID MATCHES "AppleClang|Clang|GNU")
  target_compile_options(
    trading_charts_engine
    PRIVATE
    -Wall
    -Wextra
    -Wpedantic
    -Wconversion
    -Wsign-conversion
    -Wshadow
    -Wdouble-promotion
    -Werror
  )
endif()

add_library(
  chart_engine_header_test
  OBJECT
  tests/chart_engine_header_test.cc
)
target_link_libraries(chart_engine_header_test PRIVATE trading_charts_engine)

add_executable(chart_engine_test tests/chart_engine_test.cc)
target_link_libraries(chart_engine_test PRIVATE trading_charts_engine)
if(MSVC)
  target_compile_options(chart_engine_test PRIVATE /UNDEBUG)
else()
  target_compile_options(chart_engine_test PRIVATE -UNDEBUG)
endif()

enable_testing()
add_test(NAME chart_engine_test COMMAND chart_engine_test)

if(TRADING_CHARTS_BUILD_BENCHMARKS)
  include(FetchContent)

  set(BENCHMARK_ENABLE_TESTING OFF CACHE BOOL "" FORCE)
  set(BENCHMARK_ENABLE_GTEST_TESTS OFF CACHE BOOL "" FORCE)
  set(BENCHMARK_ENABLE_INSTALL OFF CACHE BOOL "" FORCE)
  set(BENCHMARK_ENABLE_WERROR OFF CACHE BOOL "" FORCE)

  FetchContent_Declare(
    google_benchmark
    GIT_REPOSITORY https://github.com/google/benchmark.git
    GIT_TAG v1.9.5
    GIT_SHALLOW TRUE
  )
  FetchContent_MakeAvailable(google_benchmark)

  add_executable(
    chart_engine_benchmark
    benchmarks/chart_engine_benchmark.cc
  )
  target_link_libraries(
    chart_engine_benchmark
    PRIVATE
    benchmark::benchmark_main
    trading_charts_engine
  )
endif()
