// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_PACKED_DATA_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_PACKED_DATA_H_

#include <cmath>
#include <cstddef>
#include <vector>

#include "cpp/chart_engine.h"

namespace trading_charts::internal {

struct ParsedCandles {
  UpdateStatus status = UpdateStatus::kApplied;
  std::vector<Candle> candles;
};

struct ParsedHistogram {
  UpdateStatus status = UpdateStatus::kApplied;
  std::vector<HistogramPoint> points;
};

ParsedCandles ParsePackedCandles(const double* values, size_t value_count);
ParsedHistogram ParsePackedHistogram(const double* values, size_t value_count);
bool ParsePackedCandle(const double* values, size_t value_count,
                       Candle* candle);

inline bool IsValidTrade(double timestamp, double price, double size) {
  constexpr double kMaxSafeInteger = 9007199254740991.0;
  return std::isfinite(timestamp) && timestamp >= 0.0 &&
         timestamp <= kMaxSafeInteger && std::trunc(timestamp) == timestamp &&
         std::isfinite(price) && std::isfinite(size) && size >= 0.0;
}

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_PACKED_DATA_H_
