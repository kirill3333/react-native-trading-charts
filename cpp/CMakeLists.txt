cmake_minimum_required(VERSION 3.22.1)
project(trading_charts_engine LANGUAGES CXX)

add_library(
  trading_charts_engine
  STATIC
  chart_engine.cc
  internal/render_snapshot_builder.cc
  internal/series_geometry.cc
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
