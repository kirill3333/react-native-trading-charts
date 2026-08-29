// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <utility>

#include "cpp/chart_engine.h"
#include "cpp/internal/packed_data.h"
#include "cpp/internal/trading_time.h"

namespace trading_charts {

UpdateStatus ChartEngine::SetHistory(const double* values, size_t value_count) {
  if (value_count == 0) {
    Clear();
    return UpdateStatus::kApplied;
  }
  internal::ParsedCandles parsed =
      internal::ParsePackedCandles(values, value_count);
  if (parsed.status != UpdateStatus::kApplied) {
    return parsed.status;
  }

  std::lock_guard<std::mutex> lock(mutex_);
  candles_ = std::move(parsed.candles);
  RefreshDerivedDependentsLocked("main", 0);
  last_trade_timestamp_ = candles_.back().timestamp;
  crosshair_active_ = false;
  ResetViewportLocked();
  MarkDirtyLocked();
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::PrependHistory(const double* values,
                                         size_t value_count) {
  internal::ParsedCandles parsed =
      internal::ParsePackedCandles(values, value_count);
  if (parsed.status != UpdateStatus::kApplied || parsed.candles.empty()) {
    return parsed.status;
  }

  std::lock_guard<std::mutex> lock(mutex_);
  if (!candles_.empty() &&
      parsed.candles.back().timestamp >= candles_.front().timestamp) {
    return UpdateStatus::kInvalidInput;
  }
  if (candles_.empty()) {
    candles_ = std::move(parsed.candles);
    last_trade_timestamp_ = candles_.back().timestamp;
    ResetViewportLocked();
  } else {
    if (config_.logical_spacing && viewport_initialized_) {
      const double shift = static_cast<double>(parsed.candles.size());
      visible_x_min_ += shift;
      visible_x_max_ += shift;
    }
    candles_.insert(candles_.begin(), parsed.candles.begin(),
                    parsed.candles.end());
    ClampViewportLocked();
  }
  crosshair_active_ = false;
  RefreshDerivedDependentsLocked("main", 0);
  MarkDirtyLocked();
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::UpdateCandle(const double* values,
                                       size_t value_count) {
  Candle candle;
  if (!internal::ParsePackedCandle(values, value_count, &candle)) {
    return UpdateStatus::kInvalidInput;
  }

  std::lock_guard<std::mutex> lock(mutex_);
  const size_t previous_size = candles_.size();
  size_t first_changed = previous_size == 0 ? 0 : previous_size - 1;
  if (candles_.empty()) {
    candles_.push_back(candle);
    last_trade_timestamp_ = candle.timestamp;
    ResetViewportLocked();
  } else if (candle.timestamp == candles_.back().timestamp) {
    candles_.back() = candle;
    last_trade_timestamp_ = std::max(
        last_trade_timestamp_.value_or(candle.timestamp), candle.timestamp);
  } else if (candle.timestamp > candles_.back().timestamp) {
    first_changed = previous_size;
    const double old_last = CandleXLocked(candles_.size() - 1);
    const bool follow_live_edge = IsAtLiveEdgeLocked();
    candles_.push_back(candle);
    last_trade_timestamp_ = candle.timestamp;
    if (follow_live_edge) {
      const double delta = CandleXLocked(candles_.size() - 1) - old_last;
      visible_x_min_ += delta;
      visible_x_max_ += delta;
      ClampViewportLocked();
    }
  } else {
    return UpdateStatus::kIgnoredOldTimestamp;
  }
  RefreshDerivedDependentsLocked("main", first_changed);
  MarkDirtyLocked();
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::UpdateTradeLocked(double timestamp, double price,
                                            double size) {
  if (!internal::IsValidTrade(timestamp, price, size)) {
    return UpdateStatus::kInvalidInput;
  }
  if (last_trade_timestamp_.has_value() && timestamp < *last_trade_timestamp_) {
    return UpdateStatus::kIgnoredOldTimestamp;
  }

  const internal::BucketLookupResult lookup = internal::BucketForTimestamp(
      config_, static_cast<std::int64_t>(timestamp));
  if (lookup.status == internal::BucketLookupStatus::kInvalid) {
    return UpdateStatus::kInvalidInput;
  }
  if (lookup.status == internal::BucketLookupStatus::kOutsideSession) {
    if (config_.trade_aggregation.outside_session ==
        OutsideSessionPolicy::kIgnore) {
      last_trade_timestamp_ = timestamp;
      return UpdateStatus::kIgnoredOutsideSession;
    }
    return UpdateStatus::kInvalidInput;
  }
  const double bucket = static_cast<double>(lookup.bucket.key_timestamp_ms);
  if (candles_.empty()) {
    candles_.push_back(Candle{bucket, price, price, price, price, size});
    last_trade_timestamp_ = timestamp;
    ResetViewportLocked();
    return UpdateStatus::kApplied;
  }

  Candle& last = candles_.back();
  if (bucket < last.timestamp) {
    return UpdateStatus::kIgnoredOldTimestamp;
  }
  if (bucket == last.timestamp) {
    last.high = std::max(last.high, price);
    last.low = std::min(last.low, price);
    last.close = price;
    last.volume += size;
  } else {
    const double old_last = CandleXLocked(candles_.size() - 1);
    const bool follow_live_edge = IsAtLiveEdgeLocked();
    candles_.push_back(Candle{bucket, price, price, price, price, size});
    if (follow_live_edge) {
      const double delta = CandleXLocked(candles_.size() - 1) - old_last;
      visible_x_min_ += delta;
      visible_x_max_ += delta;
      ClampViewportLocked();
    }
  }
  last_trade_timestamp_ = timestamp;
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::UpdateTrade(const double* values,
                                      size_t value_count) {
  if (values == nullptr || value_count != kTradeValueCount) {
    return UpdateStatus::kInvalidInput;
  }
  std::lock_guard<std::mutex> lock(mutex_);
  const size_t previous_size = candles_.size();
  const UpdateStatus status =
      UpdateTradeLocked(values[0], values[1], values[2]);
  if (status == UpdateStatus::kApplied) {
    RefreshDerivedDependentsLocked("main",
                                   previous_size == 0 ? 0 : previous_size - 1);
    MarkDirtyLocked();
  }
  return status;
}

UpdateStatus ChartEngine::UpdateTrades(const double* values,
                                       size_t value_count) {
  if (value_count == 0) {
    return UpdateStatus::kApplied;
  }
  if (values == nullptr || value_count % kTradeValueCount != 0) {
    return UpdateStatus::kInvalidInput;
  }
  std::lock_guard<std::mutex> lock(mutex_);
  const size_t previous_size = candles_.size();
  for (size_t index = 0; index < value_count; index += kTradeValueCount) {
    if (!internal::IsValidTrade(values[index], values[index + 1],
                                values[index + 2])) {
      return UpdateStatus::kInvalidInput;
    }
  }
  UpdateStatus result = UpdateStatus::kApplied;
  bool changed = false;
  for (size_t index = 0; index < value_count; index += kTradeValueCount) {
    const UpdateStatus status =
        UpdateTradeLocked(values[index], values[index + 1], values[index + 2]);
    if (status == UpdateStatus::kInvalidInput) {
      return status;
    }
    if (status == UpdateStatus::kIgnoredOldTimestamp ||
        status == UpdateStatus::kIgnoredOutsideSession) {
      result = status;
    }
    if (status == UpdateStatus::kApplied) {
      changed = true;
    }
  }
  if (changed) {
    RefreshDerivedDependentsLocked("main",
                                   previous_size == 0 ? 0 : previous_size - 1);
    MarkDirtyLocked();
    // A mixed batch may contain ignored old trades followed by newer trades
    // that were applied. Native views use kApplied to decide whether a frame
    // is needed, so an actual mutation takes precedence over ignored records.
    return UpdateStatus::kApplied;
  }
  return result;
}

void ChartEngine::Clear() {
  std::lock_guard<std::mutex> lock(mutex_);
  candles_.clear();
  for (SeriesData& series : additional_series_) {
    series.candles.clear();
    series.histogram.clear();
    series.moving_average_states.clear();
    series.rsi_states.clear();
    series.signal_candles.clear();
    series.macd_states.clear();
  }
  last_trade_timestamp_.reset();
  crosshair_active_ = false;
  viewport_initialized_ = false;
  y_range_multiplier_ = 1.0 / config_.default_y_scale;
  for (size_t index = 0; index < panes_.size(); ++index) {
    panes_[index].y_range_multiplier = index == 0 ? y_range_multiplier_ : 1.0;
  }
  visible_x_min_ = 0.0;
  visible_x_max_ = 1.0;
  horizontal_scale_base_span_ = 1.0;
  MarkDirtyLocked();
}

}  // namespace trading_charts
