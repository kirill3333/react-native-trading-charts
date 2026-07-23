// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_SERIES_GEOMETRY_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_SERIES_GEOMETRY_H_

#include <cstddef>
#include <vector>

#include "cpp/chart_engine.h"

namespace trading_charts::internal {

struct SeriesGeometryInput {
  const ChartConfig& config;
  const std::vector<Candle>& candles;
  size_t first_index = 0;
  size_t end_index = 0;
  Rect plot;
  double visible_x_min = 0.0;
  double visible_x_max = 1.0;
  double visible_y_min = 0.0;
  double visible_y_max = 1.0;
};

size_t SeriesGeometryFloatCapacity(const SeriesGeometryInput& input);

void AppendSeriesGeometry(const SeriesGeometryInput& input,
                          std::vector<float>& vertices);

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_SERIES_GEOMETRY_H_
