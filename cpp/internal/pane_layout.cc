// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/pane_layout.h"

#include <algorithm>
#include <cassert>
#include <vector>

namespace trading_charts::internal {

std::vector<Rect> ComputePaneRects(const ChartConfig& config,
                                   const std::vector<PaneConfig>& panes,
                                   float width, float height) {
  assert(!panes.empty());
  const size_t pane_count = panes.size();
  const float y_lane = config.show_y_axis ? config.y_axis_width : 0.0f;
  const float left = 0.0f;
  const float right = width - y_lane;
  const float bottom =
      height - (config.show_x_axis ? config.x_axis_height : 0.0f);
  const float separator = config.display_scale;
  const size_t separator_count = pane_count - 1;
  const float total_separator_height =
      separator * static_cast<float>(separator_count);
  const float available =
      std::max(0.0f, bottom - kTopInset - total_separator_height);

  // Iteratively fix panes whose proportional share falls below their minimum
  // height, then distribute the remaining space by weight.
  std::vector<float> heights(pane_count, 0.0f);
  std::vector<bool> fixed(pane_count, false);
  float remaining_height = available;
  double remaining_weight = 0.0;
  for (size_t index = 0; index < pane_count; ++index) {
    remaining_weight += std::max(panes[index].height_weight, 0.0);
  }
  for (size_t pass = 0; pass < pane_count; ++pass) {
    bool changed = false;
    for (size_t index = 0; index < pane_count; ++index) {
      if (fixed[index]) {
        continue;
      }
      const PaneConfig& pane = panes[index];
      const double weight = std::max(pane.height_weight, 0.0);
      const bool has_remaining_weight = remaining_weight > 0.0;
      const float proportional_height =
          has_remaining_weight
              ? static_cast<float>(static_cast<double>(remaining_height) *
                                   weight / remaining_weight)
              : 0.0f;
      if (proportional_height < pane.min_height) {
        heights[index] = std::min(pane.min_height, remaining_height);
        fixed[index] = true;
        remaining_height = std::max(0.0f, remaining_height - heights[index]);
        remaining_weight = std::max(0.0, remaining_weight - weight);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  size_t flexible_count = 0;
  for (bool is_fixed : fixed) {
    flexible_count += is_fixed ? 0 : 1;
  }
  for (size_t index = 0; index < pane_count; ++index) {
    if (fixed[index]) {
      continue;
    }
    const PaneConfig& pane = panes[index];
    const bool has_remaining_weight = remaining_weight > 0.0;
    const float equal_share_height =
        remaining_height /
        static_cast<float>(std::max<size_t>(flexible_count, 1));
    if (has_remaining_weight) {
      const double normalized_weight =
          std::max(pane.height_weight, 0.0) / remaining_weight;
      heights[index] = static_cast<float>(
          static_cast<double>(remaining_height) * normalized_weight);
    } else {
      heights[index] = equal_share_height;
    }
  }

  std::vector<Rect> rects(pane_count);
  float top = kTopInset;
  for (size_t index = 0; index < pane_count; ++index) {
    const bool is_last_pane = index + 1 == pane_count;
    const float remaining_height_to_bottom = std::max(0.0f, bottom - top);
    // Let the last pane absorb floating-point distribution remainder so the
    // pane stack always ends exactly at the plot boundary.
    const float pane_height =
        is_last_pane ? remaining_height_to_bottom : heights[index];
    rects[index] = Rect{left, top, right, top + pane_height};
    top += pane_height + separator;
  }
  return rects;
}

}  // namespace trading_charts::internal
