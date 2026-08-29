# Copyright 2026 Kirill Novikov
# SPDX-License-Identifier: MIT

set(
  TRADING_CHARTS_ENGINE_SOURCES
  ${CMAKE_CURRENT_LIST_DIR}/chart_engine.cc
  ${CMAKE_CURRENT_LIST_DIR}/chart_engine_config.cc
  ${CMAKE_CURRENT_LIST_DIR}/chart_engine_data.cc
  ${CMAKE_CURRENT_LIST_DIR}/chart_engine_series.cc
  ${CMAKE_CURRENT_LIST_DIR}/chart_engine_viewport.cc
  ${CMAKE_CURRENT_LIST_DIR}/internal/config_normalization.cc
  ${CMAKE_CURRENT_LIST_DIR}/internal/indicator_series.cc
  ${CMAKE_CURRENT_LIST_DIR}/internal/packed_data.cc
  ${CMAKE_CURRENT_LIST_DIR}/internal/pane_layout.cc
  ${CMAKE_CURRENT_LIST_DIR}/internal/render_snapshot_builder.cc
  ${CMAKE_CURRENT_LIST_DIR}/internal/series_geometry.cc
  ${CMAKE_CURRENT_LIST_DIR}/internal/trading_time.cc
)
