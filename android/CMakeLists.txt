cmake_minimum_required(VERSION 3.22.1)
project(tradingcharts LANGUAGES CXX)

add_library(
  tradingcharts
  SHARED
  ../cpp/ChartEngine.cpp
  src/main/cpp/ChartEngineJni.cpp
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
  ../cpp
)

find_library(log-lib log)
target_link_libraries(tradingcharts PRIVATE ${log-lib})
