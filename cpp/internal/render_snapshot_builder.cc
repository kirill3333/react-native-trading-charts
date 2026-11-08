// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/render_snapshot_builder.h"

#include <cassert>
#include <cstddef>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/pane_layout.h"
#include "cpp/internal/render_snapshot_builder_impl.h"

namespace trading_charts::internal {

std::shared_ptr<const RenderSnapshot> RenderSnapshotBuilder::Build() {
  if (ReuseContent()) {
    return snapshot_;
  }
  InitializeSnapshot();
  if (!HasDrawableContent()) {
    BuildIndicatorLegends();
    return snapshot_;
  }

  FindVisibleRange();
  SetVisibleRangeMetadata();
  ComputeSeriesWindows();
  CalculateYRange();
  CalculateAdditionalPaneRanges();
  BuildPriceLines();
  AddExtrema();
  AddTicks();
  ReserveGeometry();
  AddRsiBackgroundGeometry();
  AddGridGeometry();
  AddBollFills();
  AddSeriesGeometry();
  AddAdditionalSeriesGeometry();
  AddPaneSeparators();
  AddPriceLineGeometry();
  SetLineEndpoint();
  AddCurrentPriceGeometry();
  snapshot_->content_vertices = std::move(content_vertices_);
  AddCrosshair();
  BuildIndicatorLegends();
  return snapshot_;
}

// Content geometry changes only with content_revision. When the previous
// snapshot was built from the same content, copy it (the vertex buffer
// itself is shared, never copied) and rebuild only the crosshair overlay.
bool RenderSnapshotBuilder::ReuseContent() {
  const std::shared_ptr<const RenderSnapshot>& previous = input_.previous;
  if (!previous || previous->content_revision != input_.content_revision ||
      !previous->content_vertices) {
    return false;
  }
  *snapshot_ = *previous;
  snapshot_->revision = input_.revision;
  snapshot_->overlay_vertices.clear();
  // Reset crosshair-derived fields; AddCrosshair repopulates them when the
  // crosshair is active.
  snapshot_->crosshair_visible = false;
  snapshot_->crosshair_price = 0.0;
  snapshot_->crosshair_x = 0.0f;
  snapshot_->crosshair_y = 0.0f;
  snapshot_->selected_candle = Candle{};
  snapshot_->selected_change = 0.0;
  snapshot_->selected_change_percent = 0.0;
  snapshot_->selected_amplitude_percent = 0.0;
  snapshot_->selected_percentages_valid = false;
  snapshot_->active_pane_index = 0;
  snapshot_->crosshair_series_values.clear();
  pane_y_min_.clear();
  pane_y_max_.clear();
  pane_y_min_.reserve(snapshot_->panes.size());
  pane_y_max_.reserve(snapshot_->panes.size());
  for (const PaneSnapshot& pane : snapshot_->panes) {
    pane_y_min_.push_back(pane.visible_y_min);
    pane_y_max_.push_back(pane.visible_y_max);
  }
  AddCrosshair();
  BuildIndicatorLegends();
  return true;
}

void RenderSnapshotBuilder::InitializeSnapshot() {
  assert(!input_.panes.empty());
  snapshot_->revision = input_.revision;
  snapshot_->content_revision = input_.content_revision;
  snapshot_->width = input_.width;
  snapshot_->height = input_.height;
  snapshot_->config = input_.config;
  snapshot_->visible_x_min = input_.visible_x_min;
  snapshot_->visible_x_max = input_.visible_x_max;
  const double visible_x_span = input_.visible_x_max - input_.visible_x_min;
  snapshot_->horizontal_scale =
      input_.viewport_initialized && visible_x_span > 0.0
          ? input_.horizontal_scale_base_span / visible_x_span
          : 1.0;
  snapshot_->total_candle_count = input_.candles.size();
  snapshot_->y_axis_scale = 1.0 / input_.y_range_multiplier;

  const std::vector<Rect> pane_rects = ComputePaneRects(
      input_.config, input_.panes, input_.width, input_.height);
  const size_t pane_count = pane_rects.size();
  snapshot_->panes.reserve(pane_count);
  for (size_t index = 0; index < pane_count; ++index) {
    const PaneConfig& pane = input_.panes[index];
    PaneSnapshot pane_snapshot;
    pane_snapshot.pane_id = pane.pane_id;
    pane_snapshot.price_scale_id = pane.price_scale_id;
    pane_snapshot.plot = pane_rects[index];
    pane_snapshot.height_weight = pane.height_weight;
    pane_snapshot.scale_visible = pane.scale_visible;
    pane_snapshot.volume_format = pane.volume_format;
    for (const auto& series : input_.additional_series) {
      if (!IsSeriesInPane(series, index)) {
        continue;
      }
      if (series.config.source == SeriesSource::kOhlcvRsi) {
        pane_snapshot.rsi_scale = true;
      }
      if (series.config.source == SeriesSource::kOhlcvWilliamsR) {
        pane_snapshot.williams_scale = true;
      }
    }
    pane_snapshot.precision = pane.precision;
    snapshot_->panes.push_back(std::move(pane_snapshot));
  }
  snapshot_->plot = snapshot_->panes.front().plot;
  pane_y_min_.assign(pane_count, 0.0);
  pane_y_max_.assign(pane_count, 1.0);
}

bool RenderSnapshotBuilder::HasDrawableContent() {
  const bool plot_has_area =
      snapshot_->plot.Width() >= 1.0f && snapshot_->plot.Height() >= 1.0f;
  if (plot_has_area && !input_.candles.empty()) {
    return true;
  }
  snapshot_->visible_y_min = 0.0;
  snapshot_->visible_y_max = 1.0;
  return false;
}

std::shared_ptr<const RenderSnapshot> BuildRenderSnapshot(
    const SnapshotBuildInput& input) {
  return RenderSnapshotBuilder(input).Build();
}

}  // namespace trading_charts::internal
