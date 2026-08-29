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
  constexpr double kMaxSafeInteger = 9007199254740991.0;
  return IsFinite(value) && value >= 0.0 && value <= kMaxSafeInteger &&
         std::trunc(value) == value;
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
  return Candle{values[0], values[1], values[2],
                values[3], values[4], values[5]};
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
  if (values == nullptr || value_count % 2 != 0) {
    return {UpdateStatus::kInvalidInput, {}};
  }
  ParsedHistogram parsed;
  parsed.points.reserve(value_count / 2);
  double previous = -std::numeric_limits<double>::infinity();
  for (size_t index = 0; index < value_count; index += 2) {
    const double timestamp = values[index];
    const double value = values[index + 1];
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
