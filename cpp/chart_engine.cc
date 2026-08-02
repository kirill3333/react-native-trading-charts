// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/chart_engine.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <limits>
#include <memory>
#include <numeric>
#include <string>
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

OhlcValueSource NormalizeLineSource(OhlcValueSource source) {
  switch (source) {
    case OhlcValueSource::kOpen:
    case OhlcValueSource::kHigh:
    case OhlcValueSource::kLow:
    case OhlcValueSource::kClose:
      return source;
  }
  return OhlcValueSource::kClose;
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

struct ParsedHistogram {
  UpdateStatus status = UpdateStatus::kApplied;
  std::vector<HistogramPoint> points;
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

ParsedHistogram ParseHistogram(const double* values, size_t value_count) {
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
  if (config.series_type != SeriesType::kCandlestick &&
      config.series_type != SeriesType::kBar &&
      config.series_type != SeriesType::kHollowCandlestick &&
      config.series_type != SeriesType::kLine &&
      config.series_type != SeriesType::kArea) {
    config.series_type = SeriesType::kCandlestick;
  }
  if (!IsFinite(config.bar_line_width) || !(config.bar_line_width > 0.0f)) {
    config.bar_line_width = config.display_scale;
  }
  if (!IsFinite(config.line_width) || !(config.line_width > 0.0f)) {
    config.line_width = 2.0f * config.display_scale;
  }
  if (!IsFinite(config.line_gap_threshold_ms) ||
      config.line_gap_threshold_ms < 0.0) {
    config.line_gap_threshold_ms = 0.0;
  }
  config.line_source = NormalizeLineSource(config.line_source);
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
  // Compare against the normalized config: raw inputs that normalize to the
  // current values must not trigger a viewport reset.
  const bool viewport_defaults_changed =
      config_.initial_visible_count !=
          normalized_config.initial_visible_count ||
      config_.timeframe_ms != normalized_config.timeframe_ms ||
      config_.logical_spacing != normalized_config.logical_spacing;
  config_ = std::move(normalized_config);
  if (!panes_.empty()) {
    panes_[0].scale_margin_top = config_.y_scale_margin_top;
    panes_[0].scale_margin_bottom = config_.y_scale_margin_bottom;
    panes_[0].min_move = config_.min_move;
    panes_[0].precision = config_.precision;
    panes_[0].scale_visible = config_.show_y_axis;
  }
  if (viewport_defaults_changed && !candles_.empty()) {
    ResetViewportLocked();
  }
  if (!config_.crosshair_enabled) {
    crosshair_active_ = false;
  }
  MarkDirtyLocked();
}

void ChartEngine::SetPanes(const std::vector<PaneConfig>& panes,
                           bool resizable) {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<PaneConfig> normalized;
  normalized.reserve(std::max<size_t>(panes.size(), 1));
  if (panes.empty()) {
    normalized.push_back(PaneConfig{});
  } else {
    for (PaneConfig pane : panes) {
      if (pane.pane_id.empty() || pane.price_scale_id.empty() ||
          !IsFinite(pane.height_weight) || pane.height_weight <= 0.0 ||
          !IsFinite(pane.min_height) || pane.min_height <= 0.0f) {
        continue;
      }
      pane.scale_margin_top = std::max(0.0, pane.scale_margin_top);
      pane.scale_margin_bottom = std::max(0.0, pane.scale_margin_bottom);
      if (pane.scale_margin_top + pane.scale_margin_bottom >= 1.0) {
        pane.scale_margin_top = 0.1;
        pane.scale_margin_bottom = 0.0;
      }
      if (!IsFinite(pane.min_move) || pane.min_move <= 0.0) {
        pane.min_move = 0.01;
      }
      pane.precision = std::clamp(pane.precision, 0, 12);
      auto previous = std::find_if(
          panes_.begin(), panes_.end(), [&](const PaneConfig& existing) {
            return existing.pane_id == pane.pane_id &&
                   existing.price_scale_id == pane.price_scale_id;
          });
      if (previous != panes_.end()) {
        const double configured_weight = pane.height_weight;
        if (pane.height_weight == previous->configured_height_weight) {
          pane.height_weight = previous->height_weight;
        }
        pane.configured_height_weight = configured_weight;
        pane.y_range_multiplier = previous->y_range_multiplier;
      } else {
        pane.configured_height_weight = pane.height_weight;
      }
      normalized.push_back(std::move(pane));
    }
  }
  auto main_pane = std::find_if(
      normalized.begin(), normalized.end(), [](const PaneConfig& pane) {
        return pane.pane_id == "main" && pane.price_scale_id == "main";
      });
  if (main_pane == normalized.end()) {
    normalized.insert(normalized.begin(), PaneConfig{});
  } else if (main_pane != normalized.begin()) {
    std::rotate(normalized.begin(), main_pane, main_pane + 1);
  }
  normalized.front().scale_margin_top = config_.y_scale_margin_top;
  normalized.front().scale_margin_bottom = config_.y_scale_margin_bottom;
  normalized.front().min_move = config_.min_move;
  normalized.front().precision = config_.precision;
  normalized.front().scale_visible = config_.show_y_axis;
  normalized.front().y_range_multiplier = y_range_multiplier_;
  panes_ = std::move(normalized);
  panes_resizable_ = resizable && panes_.size() > 1;
  additional_series_.erase(
      std::remove_if(
          additional_series_.begin(), additional_series_.end(),
          [&](const SeriesData& series) {
            if (!series.config.declarative) {
              return false;
            }
            return std::none_of(
                panes_.begin(), panes_.end(), [&](const PaneConfig& pane) {
                  return pane.pane_id == series.config.pane_id &&
                         pane.price_scale_id == series.config.price_scale_id;
                });
          }),
      additional_series_.end());
  RebuildSeriesIndicesLocked();
  MarkDirtyLocked();
}

SeriesData* ChartEngine::FindSeriesLocked(const std::string& series_id) {
  auto found =
      std::find_if(additional_series_.begin(), additional_series_.end(),
                   [&](const SeriesData& series) {
                     return series.config.series_id == series_id;
                   });
  return found == additional_series_.end() ? nullptr : &*found;
}

const SeriesData* ChartEngine::FindSeriesLocked(
    const std::string& series_id) const {
  auto found =
      std::find_if(additional_series_.begin(), additional_series_.end(),
                   [&](const SeriesData& series) {
                     return series.config.series_id == series_id;
                   });
  return found == additional_series_.end() ? nullptr : &*found;
}

void ChartEngine::RebuildSeriesIndicesLocked() {
  for (SeriesData& series : additional_series_) {
    const auto pane =
        std::find_if(panes_.begin(), panes_.end(), [&](const PaneConfig& item) {
          return item.pane_id == series.config.pane_id &&
                 item.price_scale_id == series.config.price_scale_id;
        });
    series.pane_index =
        pane == panes_.end()
            ? kInvalidStateIndex
            : static_cast<size_t>(std::distance(panes_.begin(), pane));
    series.source_series_index = kInvalidStateIndex;
    if (series.config.source != SeriesSource::kOhlcvVolume) {
      continue;
    }
    if (series.config.source_series_id.empty() ||
        series.config.source_series_id == "main") {
      series.source_series_index = kMainSeriesStateIndex;
      continue;
    }
    const auto source = std::find_if(
        additional_series_.begin(), additional_series_.end(),
        [&](const SeriesData& candidate) {
          return candidate.config.series_id == series.config.source_series_id &&
                 candidate.config.type != SeriesType::kHistogram;
        });
    if (source != additional_series_.end()) {
      series.source_series_index = static_cast<size_t>(
          std::distance(additional_series_.begin(), source));
    }
  }
}

UpdateStatus ChartEngine::AddSeries(const SeriesConfig& config) {
  if (config.series_id.empty() || config.series_id == "main" ||
      config.pane_id.empty() || config.price_scale_id.empty() ||
      (config.type != SeriesType::kCandlestick &&
       config.type != SeriesType::kHollowCandlestick &&
       config.type != SeriesType::kBar &&
       config.type != SeriesType::kHistogram &&
       config.type != SeriesType::kLine && config.type != SeriesType::kArea)) {
    return UpdateStatus::kInvalidInput;
  }
  std::lock_guard<std::mutex> lock(mutex_);
  SeriesConfig normalized = config;
  normalized.line_source = NormalizeLineSource(normalized.line_source);
  if (!IsFinite(normalized.line_width) || !(normalized.line_width > 0.0f)) {
    normalized.line_width = config_.line_width;
  }
  if (!IsFinite(normalized.line_gap_threshold_ms) ||
      normalized.line_gap_threshold_ms < 0.0) {
    normalized.line_gap_threshold_ms = 0.0;
  }
  const auto pane = std::find_if(
      panes_.begin(), panes_.end(), [&](const PaneConfig& candidate) {
        return candidate.pane_id == normalized.pane_id &&
               candidate.price_scale_id == normalized.price_scale_id;
      });
  if (pane == panes_.end()) {
    return UpdateStatus::kInvalidInput;
  }
  SeriesData* existing = FindSeriesLocked(normalized.series_id);
  if (existing != nullptr) {
    if (!existing->config.declarative || !normalized.declarative) {
      return UpdateStatus::kInvalidInput;
    }
    existing->config = normalized;
  } else {
    additional_series_.push_back(SeriesData{normalized, {}, {}});
  }
  RebuildSeriesIndicesLocked();
  MarkDirtyLocked();
  return UpdateStatus::kApplied;
}

bool ChartEngine::RemoveSeries(const std::string& series_id) {
  if (series_id.empty() || series_id == "main") {
    return false;
  }
  std::lock_guard<std::mutex> lock(mutex_);
  const auto old_size = additional_series_.size();
  additional_series_.erase(
      std::remove_if(additional_series_.begin(), additional_series_.end(),
                     [&](const SeriesData& series) {
                       return series.config.series_id == series_id ||
                              (series.config.source ==
                                   SeriesSource::kOhlcvVolume &&
                               series.config.source_series_id == series_id);
                     }),
      additional_series_.end());
  if (additional_series_.size() == old_size) {
    return false;
  }
  RebuildSeriesIndicesLocked();
  MarkDirtyLocked();
  return true;
}

UpdateStatus ChartEngine::SetSeriesData(const std::string& series_id,
                                        const double* values,
                                        size_t value_count, bool histogram) {
  if (series_id == "main") {
    return histogram ? UpdateStatus::kInvalidInput
                     : SetHistory(values, value_count);
  }
  ParsedCandles candles;
  ParsedHistogram points;
  if (histogram) {
    points = ParseHistogram(values, value_count);
    if (points.status != UpdateStatus::kApplied) {
      return points.status;
    }
  } else {
    candles = ParseCandles(values, value_count);
    if (candles.status != UpdateStatus::kApplied) {
      return candles.status;
    }
  }
  std::lock_guard<std::mutex> lock(mutex_);
  SeriesData* series = FindSeriesLocked(series_id);
  if (series == nullptr || series->config.source != SeriesSource::kData) {
    return UpdateStatus::kInvalidInput;
  }
  if (value_count == 0) {
    if (series->candles.empty() && series->histogram.empty()) {
      return UpdateStatus::kApplied;
    }
    series->candles.clear();
    series->histogram.clear();
    MarkDirtyLocked();
    return UpdateStatus::kApplied;
  }
  if ((series->config.type == SeriesType::kHistogram) != histogram) {
    return UpdateStatus::kInvalidInput;
  }
  if (histogram) {
    series->histogram = std::move(points.points);
  } else {
    series->candles = std::move(candles.candles);
  }
  MarkDirtyLocked();
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::PrependSeriesData(const std::string& series_id,
                                            const double* values,
                                            size_t value_count,
                                            bool histogram) {
  if (series_id == "main") {
    return histogram ? UpdateStatus::kInvalidInput
                     : PrependHistory(values, value_count);
  }
  ParsedCandles candles;
  ParsedHistogram points;
  if (histogram) {
    points = ParseHistogram(values, value_count);
    if (points.status != UpdateStatus::kApplied || points.points.empty()) {
      return points.status;
    }
  } else {
    candles = ParseCandles(values, value_count);
    if (candles.status != UpdateStatus::kApplied || candles.candles.empty()) {
      return candles.status;
    }
  }
  std::lock_guard<std::mutex> lock(mutex_);
  SeriesData* series = FindSeriesLocked(series_id);
  if (series == nullptr || series->config.source != SeriesSource::kData ||
      (series->config.type == SeriesType::kHistogram) != histogram) {
    return UpdateStatus::kInvalidInput;
  }
  if (histogram) {
    if (!series->histogram.empty() &&
        points.points.back().timestamp >= series->histogram.front().timestamp) {
      return UpdateStatus::kInvalidInput;
    }
    series->histogram.insert(series->histogram.begin(), points.points.begin(),
                             points.points.end());
  } else {
    if (!series->candles.empty() &&
        candles.candles.back().timestamp >= series->candles.front().timestamp) {
      return UpdateStatus::kInvalidInput;
    }
    series->candles.insert(series->candles.begin(), candles.candles.begin(),
                           candles.candles.end());
  }
  MarkDirtyLocked();
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::UpdateSeriesData(const std::string& series_id,
                                           const double* values,
                                           size_t value_count, bool histogram) {
  if (series_id == "main") {
    return histogram ? UpdateStatus::kInvalidInput
                     : UpdateCandle(values, value_count);
  }
  std::lock_guard<std::mutex> lock(mutex_);
  SeriesData* series = FindSeriesLocked(series_id);
  if (series == nullptr || series->config.source != SeriesSource::kData ||
      (series->config.type == SeriesType::kHistogram) != histogram) {
    return UpdateStatus::kInvalidInput;
  }
  if (histogram) {
    ParsedHistogram parsed = ParseHistogram(values, value_count);
    if (parsed.status != UpdateStatus::kApplied || parsed.points.size() != 1) {
      return UpdateStatus::kInvalidInput;
    }
    const HistogramPoint point = parsed.points.front();
    if (series->histogram.empty() ||
        point.timestamp > series->histogram.back().timestamp) {
      series->histogram.push_back(point);
    } else if (point.timestamp == series->histogram.back().timestamp) {
      series->histogram.back() = point;
    } else {
      return UpdateStatus::kIgnoredOldTimestamp;
    }
  } else {
    ParsedCandles parsed = ParseCandles(values, value_count);
    if (parsed.status != UpdateStatus::kApplied || parsed.candles.size() != 1) {
      return UpdateStatus::kInvalidInput;
    }
    const Candle candle = parsed.candles.front();
    if (series->candles.empty() ||
        candle.timestamp > series->candles.back().timestamp) {
      series->candles.push_back(candle);
    } else if (candle.timestamp == series->candles.back().timestamp) {
      series->candles.back() = candle;
    } else {
      return UpdateStatus::kIgnoredOldTimestamp;
    }
  }
  MarkDirtyLocked();
  return UpdateStatus::kApplied;
}

bool ChartEngine::SetPaneHeight(const std::string& pane_id,
                                double height_weight) {
  if (!IsFinite(height_weight) || height_weight <= 0.0) {
    return false;
  }
  std::lock_guard<std::mutex> lock(mutex_);
  auto pane = std::find_if(panes_.begin(), panes_.end(),
                           [&](const PaneConfig& candidate) {
                             return candidate.pane_id == pane_id;
                           });
  if (pane == panes_.end() || pane->height_weight == height_weight) {
    return false;
  }
  pane->height_weight = height_weight;
  MarkDirtyLocked();
  return true;
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

void ChartEngine::ResetViewportLocked() {
  y_range_multiplier_ = 1.0 / config_.default_y_scale;
  for (size_t index = 0; index < panes_.size(); ++index) {
    panes_[index].y_range_multiplier = index == 0 ? y_range_multiplier_ : 1.0;
  }
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
  for (size_t index = 0; index < panes_.size(); ++index) {
    panes_[index].y_range_multiplier = index == 0 ? y_range_multiplier_ : 1.0;
  }
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
  float middle = 0.0f;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    const float axis_height =
        config_.show_x_axis ? config_.x_axis_height : 0.0f;
    middle = internal::kTopInset +
             (height_ - axis_height - internal::kTopInset) * 0.5f;
  }
  return ScaleYAt(delta_pixels, middle);
}

std::vector<Rect> ChartEngine::PaneRectsLocked() const {
  return internal::ComputePaneRects(config_, panes_, width_, height_);
}

size_t ChartEngine::PaneIndexAtYLocked(float y) const {
  const std::vector<Rect> rects = PaneRectsLocked();
  return PaneIndexAtYLocked(y, rects);
}

size_t ChartEngine::PaneIndexAtYLocked(float y,
                                       const std::vector<Rect>& rects) const {
  for (size_t index = 0; index < rects.size(); ++index) {
    if (y >= rects[index].top && y <= rects[index].bottom) {
      return index;
    }
  }
  return rects.empty() ? 0 : rects.size() - 1;
}

bool ChartEngine::ScaleYAt(float delta_pixels, float y) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!config_.allow_y_axis_scale || !config_.show_y_axis ||
      !viewport_initialized_ || height_ <= 0.0f || candles_.empty() ||
      !std::isfinite(delta_pixels)) {
    return false;
  }
  const std::vector<Rect> rects = PaneRectsLocked();
  const size_t pane_index = PaneIndexAtYLocked(y, rects);
  if (pane_index >= panes_.size()) {
    return false;
  }
  const double plot_height =
      std::max(static_cast<double>(rects[pane_index].Height()), 1.0);
  const double current = panes_[pane_index].y_range_multiplier;
  const double next = std::clamp(
      current * std::exp(static_cast<double>(delta_pixels) / plot_height),
      kMinYRangeMultiplier, kMaxYRangeMultiplier);
  const bool crosshair_changed = crosshair_active_;
  crosshair_active_ = false;
  if (next == current) {
    if (crosshair_changed) {
      MarkCrosshairDirtyLocked();
    }
    return false;
  }
  panes_[pane_index].y_range_multiplier = next;
  if (pane_index == 0) {
    y_range_multiplier_ = next;
  }
  MarkDirtyLocked();
  return true;
}

std::optional<size_t> ChartEngine::SeparatorAt(float y, float hit_slop) const {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!panes_resizable_ || panes_.size() < 2) {
    return std::nullopt;
  }
  const std::vector<Rect> rects = PaneRectsLocked();
  for (size_t index = 0; index + 1 < rects.size(); ++index) {
    if (std::abs(y - rects[index].bottom) <= hit_slop) {
      return index;
    }
  }
  return std::nullopt;
}

bool ChartEngine::ResizePaneSeparator(size_t separator_index,
                                      float delta_pixels) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!panes_resizable_ || separator_index + 1 >= panes_.size() ||
      !std::isfinite(delta_pixels)) {
    return false;
  }
  const std::vector<Rect> rects = PaneRectsLocked();
  const float first_height = rects[separator_index].Height();
  const float second_height = rects[separator_index + 1].Height();
  const float next_first =
      std::max(panes_[separator_index].min_height,
               std::min(first_height + delta_pixels,
                        first_height + second_height -
                            panes_[separator_index + 1].min_height));
  const float next_second = first_height + second_height - next_first;
  if (next_first == first_height || next_second <= 0.0f) {
    return false;
  }
  panes_[separator_index].height_weight = static_cast<double>(next_first);
  panes_[separator_index + 1].height_weight = static_cast<double>(next_second);
  crosshair_active_ = false;
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

uint64_t ChartEngine::Revision() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return revision_;
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
  internal::SnapshotBuildInput input{config_, candles_, panes_,
                                     additional_series_};
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
  input.previous = snapshot_;
  snapshot_ = internal::BuildRenderSnapshot(input);
  dirty_ = false;
  return snapshot_;
}

}  // namespace trading_charts
