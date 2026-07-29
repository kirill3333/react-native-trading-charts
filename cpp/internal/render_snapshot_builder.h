// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_RENDER_SNAPSHOT_BUILDER_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_RENDER_SNAPSHOT_BUILDER_H_

#include <cstdint>
#include <memory>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/pane_layout.h"

namespace trading_charts::internal {

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
  // The previously published snapshot of the same engine. When its
  // content_revision matches, the builder reuses its content geometry
  // instead of tessellating everything again.
  std::shared_ptr<const RenderSnapshot> previous = nullptr;
};

// Builds a new immutable snapshot from state protected by ChartEngine's mutex.
std::shared_ptr<const RenderSnapshot> BuildRenderSnapshot(
    const SnapshotBuildInput& input);

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_RENDER_SNAPSHOT_BUILDER_H_
