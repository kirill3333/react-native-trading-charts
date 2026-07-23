// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/chart_engine.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <limits>
#include <memory>
#include <utility>
#include <vector>

#include "cpp/internal/render_snapshot_builder.h"

namespace trading_charts {
namespace {

constexpr double kMinYRangeMultiplier = 0.1;
constexpr double kMaxYRangeMultiplier = 10.0;

template <typename T>
bool IsFinite(T value) {
  return std::isfinite(value);
}

bool IsAlignedTimestamp(double timestamp, double timeframe_ms) {
  if (!(timestamp >= 0.0) || !(timeframe_ms >= 1.0)) {
    return false;
  }
  return std::fmod(timestamp, timeframe_ms) == 0.0;
}

bool IsValidCandle(const Candle& candle) {
  return IsFinite(candle.timestamp) && candle.timestamp >= 0.0 &&
         IsFinite(candle.open) && IsFinite(candle.high) &&
         IsFinite(candle.low) && IsFinite(candle.close) &&
         IsFinite(candle.volume) && candle.volume >= 0.0 &&
         candle.high >= std::max(candle.open, candle.close) &&
         candle.low <= std::min(candle.open, candle.close);
}

Candle CandleFromValues(const double* values) {
  return Candle{values[0], values[1], values[2],
                values[3], values[4], values[5]};
}

struct ParsedCandles {
  UpdateStatus status = UpdateStatus::kApplied;
  std::vector<Candle> candles;
};

ParsedCandles ParseCandles(const double* values, size_t value_count) {
  if (value_count == 0) {
    return {};
  }
  if (values == nullptr || value_count % kCandleValueCount != 0) {
    return {UpdateStatus::kInvalidInput, {}};
  }

  ParsedCandles parsed;
  parsed.candles.reserve(value_count / kCandleValueCount);
  double previous = -std::numeric_limits<double>::infinity();
  for (size_t i = 0; i < value_count; i += kCandleValueCount) {
    Candle candle = CandleFromValues(values + i);
    if (!IsValidCandle(candle) || candle.timestamp <= previous) {
      return {UpdateStatus::kInvalidInput, {}};
    }
    previous = candle.timestamp;
    parsed.candles.push_back(candle);
  }
  return parsed;
}

ChartConfig NormalizeConfig(ChartConfig config) {
  config.timeframe_ms = std::max(std::round(config.timeframe_ms), 1.0);
  config.initial_visible_count = std::max(config.initial_visible_count, 1);
  if (!IsFinite(config.default_scale) || !(config.default_scale > 0.0)) {
    config.default_scale = 1.0;
  }
  if (!IsFinite(config.default_y_scale)) {
    config.default_y_scale = 1.0;
  }
  config.default_y_scale =
      std::clamp(config.default_y_scale, 1.0 / kMaxYRangeMultiplier,
                 1.0 / kMinYRangeMultiplier);
  if (!IsFinite(config.display_scale) || !(config.display_scale > 0.0f)) {
    config.display_scale = 1.0f;
  }
  if (!IsFinite(config.tooltip_background_opacity)) {
    config.tooltip_background_opacity = 1.0f;
  }
  config.tooltip_background_opacity =
      std::clamp(config.tooltip_background_opacity, 0.0f, 1.0f);
  if (!IsFinite(config.grid_opacity)) {
    config.grid_opacity = 0.75f;
  }
  if (!IsFinite(config.crosshair_opacity)) {
    config.crosshair_opacity = 0.85f;
  }
  config.grid_opacity = std::clamp(config.grid_opacity, 0.0f, 1.0f);
  config.crosshair_opacity = std::clamp(config.crosshair_opacity, 0.0f, 1.0f);
  config.x_axis_height = std::max(config.x_axis_height, 1.0f);
  config.y_axis_width = std::max(config.y_axis_width, 1.0f);
  config.precision = std::clamp(config.precision, 0, 12);
  if (!IsFinite(config.min_move) || !(config.min_move > 0.0)) {
    config.min_move = 0.01;
  }
  if (!IsFinite(config.y_scale_margin_top) || config.y_scale_margin_top < 0.0 ||
      !IsFinite(config.y_scale_margin_bottom) ||
      config.y_scale_margin_bottom < 0.0 ||
      config.y_scale_margin_top + config.y_scale_margin_bottom >= 1.0) {
    config.y_scale_margin_top = 0.2;
    config.y_scale_margin_bottom = 0.1;
  }
  return config;
}

}  // namespace

ChartEngine::ChartEngine() = default;

void ChartEngine::MarkDirtyLocked() {
  ++revision_;
  ++content_revision_;
  dirty_ = true;
}

void ChartEngine::MarkCrosshairDirtyLocked() {
  ++revision_;
  dirty_ = true;
}

void ChartEngine::SetConfig(const ChartConfig& config) {
  ChartConfig normalized_config = NormalizeConfig(config);
  std::lock_guard<std::mutex> lock(mutex_);
  const bool viewport_defaults_changed =
      config_.initial_visible_count != config.initial_visible_count ||
      config_.timeframe_ms != config.timeframe_ms ||
      config_.logical_spacing != config.logical_spacing;
  config_ = std::move(normalized_config);
  if (viewport_defaults_changed && !candles_.empty()) {
    ResetViewportLocked();
  }
  if (!config_.crosshair_enabled) {
    crosshair_active_ = false;
  }
  MarkDirtyLocked();
}

double ChartEngine::XDomainUnitLocked() const {
  return config_.logical_spacing ? 1.0 : config_.timeframe_ms;
}

double ChartEngine::CandleXLocked(size_t index) const {
  return config_.logical_spacing ? static_cast<double>(index)
                                 : candles_[index].timestamp;
}

double ChartEngine::DataXMinLocked() const {
  return CandleXLocked(0) - XDomainUnitLocked() * 0.5;
}

double ChartEngine::DataXMaxLocked() const {
  return CandleXLocked(candles_.size() - 1) + XDomainUnitLocked() * 2.5;
}

void ChartEngine::SetSize(float width, float height) {
  std::lock_guard<std::mutex> lock(mutex_);
  const float next_width = std::max(width, 0.0f);
  const float next_height = std::max(height, 0.0f);
  if (next_width == width_ && next_height == height_) {
    return;
  }
  width_ = next_width;
  height_ = next_height;
  MarkDirtyLocked();
}

UpdateStatus ChartEngine::SetHistory(const double* values, size_t value_count) {
  if (value_count == 0) {
    Clear();
    return UpdateStatus::kApplied;
  }
  ParsedCandles parsed = ParseCandles(values, value_count);
  if (parsed.status != UpdateStatus::kApplied) {
    return parsed.status;
  }

  std::lock_guard<std::mutex> lock(mutex_);
  for (const Candle& candle : parsed.candles) {
    if (!IsAlignedTimestamp(candle.timestamp, config_.timeframe_ms)) {
      return UpdateStatus::kInvalidInput;
    }
  }
  candles_ = std::move(parsed.candles);
  last_trade_timestamp_ = candles_.back().timestamp;
  crosshair_active_ = false;
  ResetViewportLocked();
  MarkDirtyLocked();
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::PrependHistory(const double* values,
                                         size_t value_count) {
  ParsedCandles parsed = ParseCandles(values, value_count);
  if (parsed.status != UpdateStatus::kApplied || parsed.candles.empty()) {
    return parsed.status;
  }

  std::lock_guard<std::mutex> lock(mutex_);
  for (const Candle& candle : parsed.candles) {
    if (!IsAlignedTimestamp(candle.timestamp, config_.timeframe_ms)) {
      return UpdateStatus::kInvalidInput;
    }
  }
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
  MarkDirtyLocked();
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::UpdateCandle(const double* values,
                                       size_t value_count) {
  if (values == nullptr || value_count != kCandleValueCount) {
    return UpdateStatus::kInvalidInput;
  }
  const Candle candle = CandleFromValues(values);
  if (!IsValidCandle(candle)) {
    return UpdateStatus::kInvalidInput;
  }

  std::lock_guard<std::mutex> lock(mutex_);
  if (!IsAlignedTimestamp(candle.timestamp, config_.timeframe_ms)) {
    return UpdateStatus::kInvalidInput;
  }
  if (candles_.empty()) {
    candles_.push_back(candle);
    last_trade_timestamp_ = candle.timestamp;
    ResetViewportLocked();
  } else if (candle.timestamp == candles_.back().timestamp) {
    candles_.back() = candle;
    last_trade_timestamp_ = std::max(
        last_trade_timestamp_.value_or(candle.timestamp), candle.timestamp);
  } else if (candle.timestamp > candles_.back().timestamp) {
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
  MarkDirtyLocked();
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::UpdateTradeLocked(double timestamp, double price,
                                            double size) {
  if (!IsFinite(timestamp) || timestamp < 0.0 || !IsFinite(price) ||
      !IsFinite(size) || size < 0.0) {
    return UpdateStatus::kInvalidInput;
  }
  if (last_trade_timestamp_.has_value() && timestamp < *last_trade_timestamp_) {
    return UpdateStatus::kIgnoredOldTimestamp;
  }

  const double bucket =
      std::floor(timestamp / config_.timeframe_ms) * config_.timeframe_ms;
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
  const UpdateStatus status =
      UpdateTradeLocked(values[0], values[1], values[2]);
  if (status == UpdateStatus::kApplied) {
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
  for (size_t i = 0; i < value_count; i += kTradeValueCount) {
    if (!IsFinite(values[i]) || values[i] < 0.0 || !IsFinite(values[i + 1]) ||
        !IsFinite(values[i + 2]) || values[i + 2] < 0.0) {
      return UpdateStatus::kInvalidInput;
    }
  }
  UpdateStatus result = UpdateStatus::kApplied;
  bool changed = false;
  for (size_t i = 0; i < value_count; i += kTradeValueCount) {
    const UpdateStatus status =
        UpdateTradeLocked(values[i], values[i + 1], values[i + 2]);
    if (status == UpdateStatus::kInvalidInput) {
      return status;
    }
    if (status == UpdateStatus::kIgnoredOldTimestamp) {
      result = status;
    }
    if (status == UpdateStatus::kApplied) {
      changed = true;
    }
  }
  if (changed) {
    MarkDirtyLocked();
  }
  return result;
}

void ChartEngine::Clear() {
  std::lock_guard<std::mutex> lock(mutex_);
  candles_.clear();
  last_trade_timestamp_.reset();
  crosshair_active_ = false;
  viewport_initialized_ = false;
  y_range_multiplier_ = 1.0 / config_.default_y_scale;
  visible_x_min_ = 0.0;
  visible_x_max_ = 1.0;
  horizontal_scale_base_span_ = 1.0;
  MarkDirtyLocked();
}

void ChartEngine::ResetViewportLocked() {
  y_range_multiplier_ = 1.0 / config_.default_y_scale;
  if (candles_.empty()) {
    viewport_initialized_ = false;
    visible_x_min_ = 0.0;
    visible_x_max_ = 1.0;
    horizontal_scale_base_span_ = 1.0;
    return;
  }
  const size_t count =
      std::min(candles_.size(),
               static_cast<size_t>(std::max(config_.initial_visible_count, 1)));
  const size_t begin = candles_.size() - count;
  const double unit = XDomainUnitLocked();
  visible_x_min_ = CandleXLocked(begin) - unit * 0.5;
  visible_x_max_ = CandleXLocked(candles_.size() - 1) + unit * 2.5;
  if (!(visible_x_max_ > visible_x_min_)) {
    visible_x_max_ = visible_x_min_ + unit * 3.0;
  }
  horizontal_scale_base_span_ = visible_x_max_ - visible_x_min_;
  visible_x_min_ = visible_x_max_ -
                   (visible_x_max_ - visible_x_min_) / config_.default_scale;
  viewport_initialized_ = true;
  ClampViewportLocked();
}

void ChartEngine::FitContentLocked() {
  y_range_multiplier_ = 1.0 / config_.default_y_scale;
  if (candles_.empty()) {
    viewport_initialized_ = false;
    visible_x_min_ = 0.0;
    visible_x_max_ = 1.0;
    return;
  }
  const double unit = XDomainUnitLocked();
  visible_x_min_ = DataXMinLocked();
  visible_x_max_ = DataXMaxLocked();
  if (!(visible_x_max_ > visible_x_min_)) {
    visible_x_max_ = visible_x_min_ + unit * 3.0;
  }
  viewport_initialized_ = true;
  ClampViewportLocked();
}

void ChartEngine::ClampViewportLocked() {
  if (candles_.empty() || !viewport_initialized_) {
    return;
  }
  const double data_min = DataXMinLocked();
  const double data_max = DataXMaxLocked();
  const double minimum_span = XDomainUnitLocked() * 3.0;
  const double full_span = std::max(data_max - data_min, minimum_span);
  double span = std::max(visible_x_max_ - visible_x_min_, minimum_span);
  span = std::min(span, full_span);
  visible_x_min_ = std::max(visible_x_min_, data_min);
  visible_x_max_ = visible_x_min_ + span;
  if (visible_x_max_ > data_max) {
    visible_x_max_ = data_max;
    visible_x_min_ = data_max - span;
  }
}

bool ChartEngine::IsAtLiveEdgeLocked() const {
  if (candles_.empty() || !viewport_initialized_) {
    return false;
  }
  const double data_max = DataXMaxLocked();
  const float axis_width = config_.show_y_axis ? config_.y_axis_width : 0.0f;
  const double plot_width =
      std::max(static_cast<double>(width_ - axis_width), 1.0);
  const double domain_per_pixel =
      (visible_x_max_ - visible_x_min_) / plot_width;
  const double tolerance = std::max(domain_per_pixel, 1.0);
  return visible_x_max_ >= data_max - tolerance;
}

bool ChartEngine::Pan(float delta_pixels) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!config_.allow_pan || !viewport_initialized_ || width_ <= 0.0f ||
      candles_.empty() || !std::isfinite(delta_pixels)) {
    return false;
  }
  const double previous_x_min = visible_x_min_;
  const double previous_x_max = visible_x_max_;
  const bool crosshair_changed = crosshair_active_;
  const float axis_width = config_.show_y_axis ? config_.y_axis_width : 0.0f;
  const double plot_width =
      std::max(static_cast<double>(width_ - axis_width), 1.0);
  const double delta = -static_cast<double>(delta_pixels) / plot_width *
                       (visible_x_max_ - visible_x_min_);
  visible_x_min_ += delta;
  visible_x_max_ += delta;
  crosshair_active_ = false;
  ClampViewportLocked();
  const bool viewport_changed =
      visible_x_min_ != previous_x_min || visible_x_max_ != previous_x_max;
  if (viewport_changed) {
    MarkDirtyLocked();
  } else if (crosshair_changed) {
    MarkCrosshairDirtyLocked();
  }
  return viewport_changed;
}

bool ChartEngine::Zoom(double scale, float focus_x) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!config_.allow_zoom || !viewport_initialized_ || !(scale > 0.0) ||
      !IsFinite(scale) || candles_.empty()) {
    return false;
  }
  const double previous_x_min = visible_x_min_;
  const double previous_x_max = visible_x_max_;
  const bool crosshair_changed = crosshair_active_;
  const float left = config_.show_y_axis && !config_.y_axis_on_right
                         ? config_.y_axis_width
                         : 0.0f;
  const float right = width_ - (config_.show_y_axis && config_.y_axis_on_right
                                    ? config_.y_axis_width
                                    : 0.0f);
  const float plot_width = std::max(right - left, 1.0f);
  const double normalized =
      std::clamp(static_cast<double>((focus_x - left) / plot_width), 0.0, 1.0);
  const double old_span = visible_x_max_ - visible_x_min_;
  const double focus = visible_x_min_ + normalized * old_span;
  const double new_span = old_span / scale;
  visible_x_min_ = focus - normalized * new_span;
  visible_x_max_ = visible_x_min_ + new_span;
  crosshair_active_ = false;
  ClampViewportLocked();
  const bool viewport_changed =
      visible_x_min_ != previous_x_min || visible_x_max_ != previous_x_max;
  if (viewport_changed) {
    MarkDirtyLocked();
  } else if (crosshair_changed) {
    MarkCrosshairDirtyLocked();
  }
  return viewport_changed;
}

void ChartEngine::ZoomAtRightEdge(double scale) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!viewport_initialized_ || !(scale > 0.0) || !IsFinite(scale) ||
      candles_.empty()) {
    return;
  }
  const double old_span = visible_x_max_ - visible_x_min_;
  const double new_span = old_span / scale;
  visible_x_min_ = visible_x_max_ - new_span;
  crosshair_active_ = false;
  ClampViewportLocked();
  MarkDirtyLocked();
}

bool ChartEngine::ScaleY(float delta_pixels) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!config_.allow_y_axis_scale || !config_.show_y_axis ||
      !viewport_initialized_ || height_ <= 0.0f || candles_.empty() ||
      !std::isfinite(delta_pixels)) {
    return false;
  }
  const float axis_height = config_.show_x_axis ? config_.x_axis_height : 0.0f;
  const double plot_height = std::max(
      static_cast<double>(height_ - axis_height - internal::kTopInset), 1.0);
  const double next =
      std::clamp(y_range_multiplier_ *
                     std::exp(static_cast<double>(delta_pixels) / plot_height),
                 kMinYRangeMultiplier, kMaxYRangeMultiplier);
  const bool crosshair_changed = crosshair_active_;
  crosshair_active_ = false;
  if (next == y_range_multiplier_) {
    if (crosshair_changed) {
      MarkCrosshairDirtyLocked();
    }
    return false;
  }
  y_range_multiplier_ = next;
  MarkDirtyLocked();
  return true;
}

void ChartEngine::ResetViewport() {
  std::lock_guard<std::mutex> lock(mutex_);
  crosshair_active_ = false;
  ResetViewportLocked();
  MarkDirtyLocked();
}

void ChartEngine::FitContent() {
  std::lock_guard<std::mutex> lock(mutex_);
  crosshair_active_ = false;
  FitContentLocked();
  MarkDirtyLocked();
}

void ChartEngine::SetCrosshair(bool active, float x, float y) {
  std::lock_guard<std::mutex> lock(mutex_);
  const bool next = active && config_.crosshair_enabled && !candles_.empty();
  if (crosshair_active_ == next &&
      (!next || (x == crosshair_touch_x_ && y == crosshair_touch_y_))) {
    return;
  }
  crosshair_active_ = next;
  crosshair_touch_x_ = x;
  crosshair_touch_y_ = y;
  MarkCrosshairDirtyLocked();
}

size_t ChartEngine::CandleCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return candles_.size();
}

Candle ChartEngine::CandleAt(size_t index) const {
  std::lock_guard<std::mutex> lock(mutex_);
  return index < candles_.size() ? candles_[index] : Candle{};
}

std::vector<Candle> ChartEngine::Candles() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return candles_;
}

std::shared_ptr<const RenderSnapshot> ChartEngine::Snapshot() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!dirty_ && snapshot_) {
    return snapshot_;
  }
  internal::SnapshotBuildInput input{config_, candles_};
  input.width = width_;
  input.height = height_;
  input.visible_x_min = visible_x_min_;
  input.visible_x_max = visible_x_max_;
  input.horizontal_scale_base_span = horizontal_scale_base_span_;
  input.y_range_multiplier = y_range_multiplier_;
  input.viewport_initialized = viewport_initialized_;
  input.crosshair_active = crosshair_active_;
  input.crosshair_touch_x = crosshair_touch_x_;
  input.crosshair_touch_y = crosshair_touch_y_;
  input.revision = revision_;
  input.content_revision = content_revision_;
  snapshot_ = internal::BuildRenderSnapshot(input);
  dirty_ = false;
  return snapshot_;
}

}  // namespace trading_charts
