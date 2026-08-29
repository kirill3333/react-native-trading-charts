// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_PACKED_DATA_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_PACKED_DATA_H_

#include <cmath>
#include <cstddef>
#include <vector>

#include "cpp/chart_engine.h"

namespace trading_charts::internal {

inline constexpr size_t kPackedTimestampIndex = 0;
inline constexpr size_t kPackedOpenIndex = 1;
inline constexpr size_t kPackedHighIndex = 2;
inline constexpr size_t kPackedLowIndex = 3;
inline constexpr size_t kPackedCloseIndex = 4;
inline constexpr size_t kPackedVolumeIndex = 5;

inline constexpr size_t kPackedTradePriceIndex = 1;
inline constexpr size_t kPackedTradeSizeIndex = 2;

inline constexpr size_t kHistogramValueCount = 2;
inline constexpr size_t kPackedHistogramValueIndex = 1;

inline constexpr double kMaxJavaScriptSafeInteger = 9007199254740991.0;

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
  return std::isfinite(timestamp) && timestamp >= 0.0 &&
         timestamp <= kMaxJavaScriptSafeInteger &&
         std::trunc(timestamp) == timestamp && std::isfinite(price) &&
         std::isfinite(size) && size >= 0.0;
}

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_PACKED_DATA_H_
