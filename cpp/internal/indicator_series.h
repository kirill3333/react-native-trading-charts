// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_INDICATOR_SERIES_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_INDICATOR_SERIES_H_

#include <cstddef>
#include <vector>

namespace trading_charts {

struct Candle;
struct SeriesData;

}  // namespace trading_charts

namespace trading_charts::internal {

// Rebuilds the derived output owned by `series` from `source`. The caller owns
// both objects and keeps any required synchronization for the full call.
void RebuildDerivedSeries(SeriesData& series, const std::vector<Candle>* source,
                          size_t first_changed_source_index);

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_INDICATOR_SERIES_H_
