// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_PANE_LAYOUT_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_PANE_LAYOUT_H_

#include <cstddef>
#include <vector>

#include "cpp/chart_engine.h"

namespace trading_charts::internal {

inline constexpr float kTopInset = 8.0f;

// Computes the plot rect of every pane from the config and pane weights.
// This is the single source of truth shared by gesture hit-testing
// (ChartEngine) and the snapshot builder so both always agree on pane
// geometry. Pane min heights are clamped to the remaining space and the last
// pane is clamped to the plot bottom.
std::vector<Rect> ComputePaneRects(const ChartConfig& config,
                                   const std::vector<PaneConfig>& panes,
                                   float width, float height);

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_PANE_LAYOUT_H_
