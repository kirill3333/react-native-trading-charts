// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_RENDER_SNAPSHOT_BUILDER_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_RENDER_SNAPSHOT_BUILDER_H_

#include <cstdint>
#include <memory>
#include <vector>

#include "cpp/chart_engine.h"

namespace trading_charts::internal {

inline constexpr float kTopInset = 8.0f;

// References engine-owned state while ChartEngine holds its mutex. The
// builder copies everything needed by the published snapshot before returning.
struct SnapshotBuildInput {
  const ChartConfig& config;
  const std::vector<Candle>& candles;
  const std::vector<PaneConfig>& panes;
  const std::vector<SeriesData>& additional_series;
  float width = 0.0f;
  float height = 0.0f;
  double visible_x_min = 0.0;
  double visible_x_max = 1.0;
  double horizontal_scale_base_span = 1.0;
  double y_range_multiplier = 1.0;
  bool viewport_initialized = false;
  bool crosshair_active = false;
  float crosshair_touch_x = 0.0f;
  float crosshair_touch_y = 0.0f;
  std::uint64_t revision = 0;
  std::uint64_t content_revision = 0;
};

// Builds a new immutable snapshot from state protected by ChartEngine's mutex.
std::shared_ptr<const RenderSnapshot> BuildRenderSnapshot(
    const SnapshotBuildInput& input);

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_RENDER_SNAPSHOT_BUILDER_H_
