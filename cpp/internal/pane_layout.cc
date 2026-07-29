// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/pane_layout.h"

#include <algorithm>
#include <vector>

namespace trading_charts::internal {

const PaneConfig& PaneConfigAt(const std::vector<PaneConfig>& panes,
                               size_t index) {
  static const PaneConfig kFallback{};
  return index < panes.size() ? panes[index] : kFallback;
}

std::vector<Rect> ComputePaneRects(const ChartConfig& config,
                                   const std::vector<PaneConfig>& panes,
                                   float width, float height) {
  const size_t pane_count = std::max<size_t>(panes.size(), 1);
  const float y_lane = config.show_y_axis ? config.y_axis_width : 0.0f;
  const float left =
      config.show_y_axis && !config.y_axis_on_right ? y_lane : 0.0f;
  const float right =
      width - (config.show_y_axis && config.y_axis_on_right ? y_lane : 0.0f);
  const float bottom =
      height - (config.show_x_axis ? config.x_axis_height : 0.0f);
  const float separator = config.display_scale;
  const float available =
      std::max(0.0f, bottom - kTopInset -
                         separator * static_cast<float>(pane_count - 1));

  // Iteratively fix panes whose proportional share falls below their minimum
  // height, then distribute the remaining space by weight.
  std::vector<float> heights(pane_count, 0.0f);
  std::vector<bool> fixed(pane_count, false);
  float remaining_height = available;
  double remaining_weight = 0.0;
  for (size_t index = 0; index < pane_count; ++index) {
    remaining_weight += std::max(PaneConfigAt(panes, index).height_weight, 0.0);
  }
  for (size_t pass = 0; pass < pane_count; ++pass) {
    bool changed = false;
    for (size_t index = 0; index < pane_count; ++index) {
      if (fixed[index]) {
        continue;
      }
      const PaneConfig& pane = PaneConfigAt(panes, index);
      const double weight = std::max(pane.height_weight, 0.0);
      const float proposed =
          remaining_weight > 0.0
              ? static_cast<float>(static_cast<double>(remaining_height) *
                                   weight / remaining_weight)
              : 0.0f;
      if (proposed < pane.min_height) {
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
    const PaneConfig& pane = PaneConfigAt(panes, index);
    heights[index] =
        remaining_weight > 0.0
            ? static_cast<float>(static_cast<double>(remaining_height) *
                                 std::max(pane.height_weight, 0.0) /
                                 remaining_weight)
            : remaining_height /
                  static_cast<float>(std::max<size_t>(flexible_count, 1));
  }

  std::vector<Rect> rects(pane_count);
  float top = kTopInset;
  for (size_t index = 0; index < pane_count; ++index) {
    const float pane_height =
        index + 1 == pane_count ? std::max(0.0f, bottom - top) : heights[index];
    rects[index] = Rect{left, top, right, top + pane_height};
    top += pane_height + separator;
  }
  return rects;
}

}  // namespace trading_charts::internal
