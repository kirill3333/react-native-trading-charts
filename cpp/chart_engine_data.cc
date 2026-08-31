// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <cassert>
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

  MutationScope mutation(*this);
  mutation.ContentChanged();
  candles_ = std::move(parsed.candles);
  RefreshDerivedDependentsLocked("main", 0, mutation);
  last_trade_timestamp_ = candles_.back().timestamp;
  crosshair_active_ = false;
  ResetViewportLocked(mutation);
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::PrependHistory(const double* values,
                                         size_t value_count) {
  internal::ParsedCandles parsed =
      internal::ParsePackedCandles(values, value_count);
  if (parsed.status != UpdateStatus::kApplied || parsed.candles.empty()) {
    return parsed.status;
  }

  MutationScope mutation(*this);
  if (!candles_.empty() &&
      parsed.candles.back().timestamp >= candles_.front().timestamp) {
    return UpdateStatus::kInvalidInput;
  }
  mutation.ContentChanged();
  if (candles_.empty()) {
    candles_ = std::move(parsed.candles);
    last_trade_timestamp_ = candles_.back().timestamp;
    ResetViewportLocked(mutation);
  } else {
    if (config_.logical_spacing && viewport_initialized_) {
      const double shift = static_cast<double>(parsed.candles.size());
      visible_x_min_ += shift;
      visible_x_max_ += shift;
    }
    candles_.insert(candles_.begin(), parsed.candles.begin(),
                    parsed.candles.end());
    ClampViewportValuesLocked(&visible_x_min_, &visible_x_max_);
  }
  crosshair_active_ = false;
  RefreshDerivedDependentsLocked("main", 0, mutation);
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::UpdateCandle(const double* values,
                                       size_t value_count) {
  Candle candle;
  if (!internal::ParsePackedCandle(values, value_count, &candle)) {
    return UpdateStatus::kInvalidInput;
  }

  MutationScope mutation(*this);
  const size_t previous_size = candles_.size();
  size_t first_changed = previous_size == 0 ? 0 : previous_size - 1;
  if (candles_.empty()) {
    mutation.ContentChanged();
    candles_.push_back(candle);
    last_trade_timestamp_ = candle.timestamp;
    ResetViewportLocked(mutation);
  } else if (candle.timestamp == candles_.back().timestamp) {
    mutation.ContentChanged();
    candles_.back() = candle;
    last_trade_timestamp_ = std::max(
        last_trade_timestamp_.value_or(candle.timestamp), candle.timestamp);
  } else if (candle.timestamp > candles_.back().timestamp) {
    first_changed = previous_size;
    const double old_last = CandleXLocked(candles_.size() - 1);
    const bool follow_live_edge = IsAtLiveEdgeLocked();
    mutation.ContentChanged();
    candles_.push_back(candle);
    last_trade_timestamp_ = candle.timestamp;
    if (follow_live_edge) {
      const double delta = CandleXLocked(candles_.size() - 1) - old_last;
      visible_x_min_ += delta;
      visible_x_max_ += delta;
      ClampViewportValuesLocked(&visible_x_min_, &visible_x_max_);
    }
  } else {
    return UpdateStatus::kIgnoredOldTimestamp;
  }
  RefreshDerivedDependentsLocked("main", first_changed, mutation);
  return UpdateStatus::kApplied;
}

bool ChartEngine::ValidateTradeSequenceLocked(const double* values,
                                              size_t value_count) const {
  std::optional<double> simulated_last_timestamp = last_trade_timestamp_;
  std::optional<double> simulated_last_bucket =
      candles_.empty() ? std::nullopt
                       : std::optional<double>(candles_.back().timestamp);
  for (size_t index = 0; index < value_count; index += kTradeValueCount) {
    const double timestamp = values[index + internal::kPackedTimestampIndex];
    const double price = values[index + internal::kPackedTradePriceIndex];
    const double size = values[index + internal::kPackedTradeSizeIndex];
    if (!internal::IsValidTrade(timestamp, price, size)) {
      return false;
    }
    if (!config_.trade_aggregation.calendar.configured) {
      continue;
    }
    if (simulated_last_timestamp.has_value() &&
        timestamp < *simulated_last_timestamp) {
      continue;
    }
    const internal::BucketLookupResult lookup = internal::BucketForTimestamp(
        config_, static_cast<std::int64_t>(timestamp));
    if (lookup.status == internal::BucketLookupStatus::kInvalid ||
        (lookup.status == internal::BucketLookupStatus::kOutsideSession &&
         config_.trade_aggregation.outside_session ==
             OutsideSessionPolicy::kReject)) {
      return false;
    }
    if (lookup.status == internal::BucketLookupStatus::kOutsideSession) {
      simulated_last_timestamp = timestamp;
      continue;
    }
    const double bucket = static_cast<double>(lookup.bucket.key_timestamp_ms);
    if (simulated_last_bucket.has_value() && bucket < *simulated_last_bucket) {
      continue;
    }
    simulated_last_bucket = bucket;
    simulated_last_timestamp = timestamp;
  }
  return true;
}

ChartEngine::TradeApplyStatus ChartEngine::ApplyValidatedTradeLocked(
    double timestamp, double price, double size, MutationScope& mutation) {
  if (last_trade_timestamp_.has_value() && timestamp < *last_trade_timestamp_) {
    return TradeApplyStatus::kIgnoredOldTimestamp;
  }

  const internal::BucketLookupResult lookup = internal::BucketForTimestamp(
      config_, static_cast<std::int64_t>(timestamp));
  assert(lookup.status != internal::BucketLookupStatus::kInvalid);
  if (lookup.status == internal::BucketLookupStatus::kOutsideSession) {
    assert(config_.trade_aggregation.outside_session ==
           OutsideSessionPolicy::kIgnore);
    last_trade_timestamp_ = timestamp;
    return TradeApplyStatus::kIgnoredOutsideSession;
  }
  const double bucket = static_cast<double>(lookup.bucket.key_timestamp_ms);
  if (candles_.empty()) {
    mutation.ContentChanged();
    candles_.push_back(Candle{bucket, price, price, price, price, size});
    last_trade_timestamp_ = timestamp;
    ResetViewportLocked(mutation);
    return TradeApplyStatus::kApplied;
  }

  Candle& last = candles_.back();
  if (bucket < last.timestamp) {
    return TradeApplyStatus::kIgnoredOldTimestamp;
  }
  if (bucket == last.timestamp) {
    mutation.ContentChanged();
    last.high = std::max(last.high, price);
    last.low = std::min(last.low, price);
    last.close = price;
    last.volume += size;
  } else {
    const double old_last = CandleXLocked(candles_.size() - 1);
    const bool follow_live_edge = IsAtLiveEdgeLocked();
    mutation.ContentChanged();
    candles_.push_back(Candle{bucket, price, price, price, price, size});
    if (follow_live_edge) {
      const double delta = CandleXLocked(candles_.size() - 1) - old_last;
      visible_x_min_ += delta;
      visible_x_max_ += delta;
      ClampViewportValuesLocked(&visible_x_min_, &visible_x_max_);
    }
  }
  last_trade_timestamp_ = timestamp;
  return TradeApplyStatus::kApplied;
}

UpdateStatus ChartEngine::UpdateTrade(const double* values,
                                      size_t value_count) {
  if (values == nullptr || value_count != kTradeValueCount) {
    return UpdateStatus::kInvalidInput;
  }
  MutationScope mutation(*this);
  if (!ValidateTradeSequenceLocked(values, value_count)) {
    return UpdateStatus::kInvalidInput;
  }
  const size_t previous_size = candles_.size();
  const TradeApplyStatus status = ApplyValidatedTradeLocked(
      values[internal::kPackedTimestampIndex],
      values[internal::kPackedTradePriceIndex],
      values[internal::kPackedTradeSizeIndex], mutation);
  switch (status) {
    case TradeApplyStatus::kApplied:
      RefreshDerivedDependentsLocked(
          "main", previous_size == 0 ? 0 : previous_size - 1, mutation);
      return UpdateStatus::kApplied;
    case TradeApplyStatus::kIgnoredOldTimestamp:
      return UpdateStatus::kIgnoredOldTimestamp;
    case TradeApplyStatus::kIgnoredOutsideSession:
      return UpdateStatus::kIgnoredOutsideSession;
  }
  return UpdateStatus::kInvalidInput;
}

UpdateStatus ChartEngine::UpdateTrades(const double* values,
                                       size_t value_count) {
  if (value_count == 0) {
    return UpdateStatus::kApplied;
  }
  if (values == nullptr || value_count % kTradeValueCount != 0) {
    return UpdateStatus::kInvalidInput;
  }
  MutationScope mutation(*this);
  if (!ValidateTradeSequenceLocked(values, value_count)) {
    return UpdateStatus::kInvalidInput;
  }
  const size_t previous_size = candles_.size();
  UpdateStatus result = UpdateStatus::kApplied;
  bool changed = false;
  for (size_t index = 0; index < value_count; index += kTradeValueCount) {
    const TradeApplyStatus status = ApplyValidatedTradeLocked(
        values[index + internal::kPackedTimestampIndex],
        values[index + internal::kPackedTradePriceIndex],
        values[index + internal::kPackedTradeSizeIndex], mutation);
    switch (status) {
      case TradeApplyStatus::kApplied:
        changed = true;
        break;
      case TradeApplyStatus::kIgnoredOldTimestamp:
        result = UpdateStatus::kIgnoredOldTimestamp;
        break;
      case TradeApplyStatus::kIgnoredOutsideSession:
        result = UpdateStatus::kIgnoredOutsideSession;
        break;
    }
  }
  if (changed) {
    RefreshDerivedDependentsLocked(
        "main", previous_size == 0 ? 0 : previous_size - 1, mutation);
    return UpdateStatus::kApplied;
  }
  return result;
}

void ChartEngine::Clear() {
  MutationScope mutation(*this);
  mutation.ContentChanged();
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
}

}  // namespace trading_charts
