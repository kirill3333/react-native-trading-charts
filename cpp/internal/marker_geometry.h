// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT
#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_MARKER_GEOMETRY_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_MARKER_GEOMETRY_H_
#include <memory>
#include <vector>

#include "cpp/chart_engine.h"
namespace trading_charts::internal {
std::shared_ptr<const MarkerSnapshot> BuildMarkers(
    const MarkerStore& store, const std::vector<Candle>& candles,
    const RenderSnapshot& snapshot, double domain_min, double domain_max);
}  // namespace trading_charts::internal
#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_MARKER_GEOMETRY_H_
