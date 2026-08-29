// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/packed_data.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace trading_charts::internal {
namespace {

template <typename T>
bool IsFinite(T value) {
  return std::isfinite(value);
}

bool IsValidTimestamp(double value) {
  return IsFinite(value) && value >= 0.0 &&
         value <= kMaxJavaScriptSafeInteger && std::trunc(value) == value;
}

bool IsValidCandle(const Candle& candle) {
  return IsValidTimestamp(candle.timestamp) && IsFinite(candle.open) &&
         IsFinite(candle.high) && IsFinite(candle.low) &&
         IsFinite(candle.close) && IsFinite(candle.volume) &&
         candle.volume >= 0.0 &&
         candle.high >= std::max(candle.open, candle.close) &&
         candle.low <= std::min(candle.open, candle.close);
}

Candle CandleFromValues(const double* values) {
  return Candle{
      values[kPackedTimestampIndex], values[kPackedOpenIndex],
      values[kPackedHighIndex],      values[kPackedLowIndex],
      values[kPackedCloseIndex],     values[kPackedVolumeIndex],
  };
}

}  // namespace

ParsedCandles ParsePackedCandles(const double* values, size_t value_count) {
  if (value_count == 0) {
    return {};
  }
  if (values == nullptr || value_count % kCandleValueCount != 0) {
    return {UpdateStatus::kInvalidInput, {}};
  }

  ParsedCandles parsed;
  parsed.candles.reserve(value_count / kCandleValueCount);
  double previous = -std::numeric_limits<double>::infinity();
  for (size_t index = 0; index < value_count; index += kCandleValueCount) {
    Candle candle = CandleFromValues(values + index);
    if (!IsValidCandle(candle) || candle.timestamp <= previous) {
      return {UpdateStatus::kInvalidInput, {}};
    }
    previous = candle.timestamp;
    parsed.candles.push_back(candle);
  }
  return parsed;
}

ParsedHistogram ParsePackedHistogram(const double* values, size_t value_count) {
  if (value_count == 0) {
    return {};
  }
  if (values == nullptr || value_count % kHistogramValueCount != 0) {
    return {UpdateStatus::kInvalidInput, {}};
  }
  ParsedHistogram parsed;
  parsed.points.reserve(value_count / kHistogramValueCount);
  double previous = -std::numeric_limits<double>::infinity();
  for (size_t index = 0; index < value_count; index += kHistogramValueCount) {
    const double timestamp = values[index + kPackedTimestampIndex];
    const double value = values[index + kPackedHistogramValueIndex];
    if (!IsFinite(timestamp) || timestamp < 0.0 || timestamp <= previous ||
        !IsFinite(value)) {
      return {UpdateStatus::kInvalidInput, {}};
    }
    previous = timestamp;
    parsed.points.push_back(HistogramPoint{timestamp, value});
  }
  return parsed;
}

bool ParsePackedCandle(const double* values, size_t value_count,
                       Candle* candle) {
  if (values == nullptr || value_count != kCandleValueCount ||
      candle == nullptr) {
    return false;
  }
  const Candle parsed = CandleFromValues(values);
  if (!IsValidCandle(parsed)) {
    return false;
  }
  *candle = parsed;
  return true;
}

}  // namespace trading_charts::internal
