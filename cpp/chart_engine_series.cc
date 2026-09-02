// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <iterator>
#include <string>
#include <utility>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/config_constants.h"
#include "cpp/internal/config_normalization.h"
#include "cpp/internal/indicator_series.h"
#include "cpp/internal/packed_data.h"

namespace trading_charts {
namespace {

constexpr size_t kSinglePointUpdateCount = 1;

bool IsSupportedSeriesType(SeriesType type) {
  return type == SeriesType::kCandlestick ||
         type == SeriesType::kHollowCandlestick || type == SeriesType::kBar ||
         type == SeriesType::kHistogram || type == SeriesType::kLine ||
         type == SeriesType::kArea;
}

bool IsValidRsiSeriesConfig(const SeriesConfig& config) {
  const bool has_valid_levels =
      std::isfinite(config.rsi_oversold) &&
      std::isfinite(config.rsi_overbought) &&
      config.rsi_oversold >= internal::kRsiMinimumValue &&
      config.rsi_overbought <= internal::kRsiMaximumValue &&
      config.rsi_oversold < config.rsi_overbought;
  return config.type == SeriesType::kLine && config.rsi_period > 0 &&
         has_valid_levels;
}

bool IsValidMovingAverageSeriesConfig(const SeriesConfig& config) {
  return config.type == SeriesType::kLine && config.moving_average_period > 0 &&
         !config.source_series_id.empty();
}

bool IsValidMacdSeriesConfig(const SeriesConfig& config) {
  const bool has_valid_periods =
      config.macd_fast_period > 0 && config.macd_slow_period > 0 &&
      config.macd_signal_period > 0 &&
      config.macd_fast_period < config.macd_slow_period;
  return config.type == SeriesType::kLine && has_valid_periods &&
         !config.source_series_id.empty();
}

}  // namespace

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

void ChartEngine::RebuildSeriesIndicesLocked(MutationScope& mutation) {
  if (!additional_series_.empty()) {
    mutation.ContentChanged();
  }
  for (SeriesData& series : additional_series_) {
    const auto pane =
        std::find_if(panes_.begin(), panes_.end(), [&](const PaneConfig& item) {
          return item.pane_id == series.config.pane_id &&
                 item.price_scale_id == series.config.price_scale_id;
        });
    series.pane_index.reset();
    if (pane != panes_.end()) {
      series.pane_index =
          static_cast<size_t>(std::distance(panes_.begin(), pane));
    }
    series.source_binding = SeriesSourceBinding{};
    if (!IsDerivedOhlcvSource(series.config.source)) {
      continue;
    }
    if (series.config.source_series_id.empty() ||
        series.config.source_series_id == "main") {
      series.source_binding.kind = SeriesSourceBindingKind::kMain;
      continue;
    }
    const auto source = std::find_if(
        additional_series_.begin(), additional_series_.end(),
        [&](const SeriesData& candidate) {
          return candidate.config.series_id == series.config.source_series_id &&
                 candidate.config.type != SeriesType::kHistogram &&
                 (series.config.source == SeriesSource::kOhlcvVolume ||
                  candidate.config.source == SeriesSource::kData);
        });
    if (source != additional_series_.end()) {
      series.source_binding.kind = SeriesSourceBindingKind::kAdditional;
      series.source_binding.additional_series_index = static_cast<size_t>(
          std::distance(additional_series_.begin(), source));
    }
  }
}

const std::vector<Candle>* ChartEngine::SourceCandlesLocked(
    const SeriesData& series) const {
  switch (series.source_binding.kind) {
    case SeriesSourceBindingKind::kUnavailable:
      return nullptr;
    case SeriesSourceBindingKind::kMain:
      return &candles_;
    case SeriesSourceBindingKind::kAdditional: {
      const size_t index = series.source_binding.additional_series_index;
      assert(index < additional_series_.size());
      return index < additional_series_.size()
                 ? &additional_series_[index].candles
                 : nullptr;
    }
  }
  return nullptr;
}

void ChartEngine::RefreshDerivedDependentsLocked(
    const std::string& source_series_id, size_t first_changed_source_index,
    MutationScope& mutation) {
  for (SeriesData& series : additional_series_) {
    const SeriesSource source = series.config.source;
    if ((source == SeriesSource::kOhlcvRsi ||
         source == SeriesSource::kOhlcvMacd || IsMovingAverageSource(source)) &&
        (series.config.source_series_id.empty()
             ? source_series_id == "main"
             : series.config.source_series_id == source_series_id)) {
      mutation.ContentChanged();
      internal::RebuildDerivedSeries(series, SourceCandlesLocked(series),
                                     first_changed_source_index);
    }
  }
}

void ChartEngine::RebuildAllDerivedSeriesLocked(MutationScope& mutation) {
  for (SeriesData& series : additional_series_) {
    if (!IsDerivedOhlcvSource(series.config.source)) {
      continue;
    }
    mutation.ContentChanged();
    internal::RebuildDerivedSeries(series, SourceCandlesLocked(series), 0);
  }
}

bool ChartEngine::PaneHasRsiLocked(size_t pane_index) const {
  return std::any_of(additional_series_.begin(), additional_series_.end(),
                     [&](const SeriesData& series) {
                       return series.pane_index.has_value() &&
                              *series.pane_index == pane_index &&
                              series.config.source == SeriesSource::kOhlcvRsi;
                     });
}

bool ChartEngine::PaneHasMacdLocked(size_t pane_index) const {
  return std::any_of(additional_series_.begin(), additional_series_.end(),
                     [&](const SeriesData& series) {
                       return series.pane_index.has_value() &&
                              *series.pane_index == pane_index &&
                              series.config.source == SeriesSource::kOhlcvMacd;
                     });
}

UpdateStatus ChartEngine::AddSeries(const SeriesConfig& config) {
  const bool has_valid_identifiers =
      !config.series_id.empty() && config.series_id != "main" &&
      !config.pane_id.empty() && !config.price_scale_id.empty();
  if (!has_valid_identifiers || !IsSupportedSeriesType(config.type)) {
    return UpdateStatus::kInvalidInput;
  }
  if (config.source == SeriesSource::kOhlcvRsi &&
      !IsValidRsiSeriesConfig(config)) {
    return UpdateStatus::kInvalidInput;
  }
  if (IsMovingAverageSource(config.source) &&
      !IsValidMovingAverageSeriesConfig(config)) {
    return UpdateStatus::kInvalidInput;
  }
  if (config.source == SeriesSource::kOhlcvMacd &&
      !IsValidMacdSeriesConfig(config)) {
    return UpdateStatus::kInvalidInput;
  }
  MutationScope mutation(*this);
  SeriesConfig normalized = internal::NormalizeSeriesConfig(config, config_);
  const auto pane = std::find_if(
      panes_.begin(), panes_.end(), [&](const PaneConfig& candidate) {
        return candidate.pane_id == normalized.pane_id &&
               candidate.price_scale_id == normalized.price_scale_id;
      });
  if (pane == panes_.end()) {
    return UpdateStatus::kInvalidInput;
  }
  if (normalized.source == SeriesSource::kOhlcvRsi && pane == panes_.begin()) {
    return UpdateStatus::kInvalidInput;
  }
  const size_t pane_index =
      static_cast<size_t>(std::distance(panes_.begin(), pane));
  if (normalized.source == SeriesSource::kOhlcvMacd &&
      (pane == panes_.begin() || PaneHasRsiLocked(pane_index))) {
    return UpdateStatus::kInvalidInput;
  }
  if (normalized.source == SeriesSource::kOhlcvRsi &&
      PaneHasMacdLocked(pane_index)) {
    return UpdateStatus::kInvalidInput;
  }
  if (IsMovingAverageSource(normalized.source)) {
    if (normalized.source_series_id == "main") {
      if (pane != panes_.begin()) {
        return UpdateStatus::kInvalidInput;
      }
    } else {
      const SeriesData* source = FindSeriesLocked(normalized.source_series_id);
      if (source == nullptr) {
        if (!normalized.declarative) {
          return UpdateStatus::kInvalidInput;
        }
      } else if (source->config.source != SeriesSource::kData ||
                 source->config.type == SeriesType::kHistogram ||
                 source->config.pane_id != normalized.pane_id ||
                 source->config.price_scale_id != normalized.price_scale_id) {
        return UpdateStatus::kInvalidInput;
      }
    }
  }
  if (normalized.source == SeriesSource::kOhlcvMacd &&
      normalized.source_series_id != "main") {
    const SeriesData* source = FindSeriesLocked(normalized.source_series_id);
    if (source == nullptr) {
      if (!normalized.declarative) {
        return UpdateStatus::kInvalidInput;
      }
    } else if (source->config.source != SeriesSource::kData ||
               source->config.type == SeriesType::kHistogram) {
      return UpdateStatus::kInvalidInput;
    }
  }
  SeriesData* existing = FindSeriesLocked(normalized.series_id);
  if (existing != nullptr) {
    if (!existing->config.declarative || !normalized.declarative) {
      return UpdateStatus::kInvalidInput;
    }
    mutation.ContentChanged();
    existing->config = normalized;
  } else {
    SeriesData series;
    series.config = normalized;
    mutation.ContentChanged();
    additional_series_.push_back(std::move(series));
  }
  RebuildSeriesIndicesLocked(mutation);
  RebuildAllDerivedSeriesLocked(mutation);
  return UpdateStatus::kApplied;
}

bool ChartEngine::RemoveSeries(const std::string& series_id) {
  if (series_id.empty() || series_id == "main") {
    return false;
  }
  MutationScope mutation(*this);
  const auto should_remove = [&](const SeriesData& series) {
    return series.config.series_id == series_id ||
           (IsDerivedOhlcvSource(series.config.source) &&
            series.config.source_series_id == series_id);
  };
  if (std::none_of(additional_series_.begin(), additional_series_.end(),
                   should_remove)) {
    return false;
  }
  mutation.ContentChanged();
  additional_series_.erase(
      std::remove_if(additional_series_.begin(), additional_series_.end(),
                     should_remove),
      additional_series_.end());
  RebuildSeriesIndicesLocked(mutation);
  RebuildAllDerivedSeriesLocked(mutation);
  return true;
}

UpdateStatus ChartEngine::SetSeriesData(const std::string& series_id,
                                        const double* values,
                                        size_t value_count, bool histogram) {
  if (series_id == "main") {
    return histogram ? UpdateStatus::kInvalidInput
                     : SetHistory(values, value_count);
  }
  internal::ParsedCandles candles;
  internal::ParsedHistogram points;
  if (histogram) {
    points = internal::ParsePackedHistogram(values, value_count);
    if (points.status != UpdateStatus::kApplied) {
      return points.status;
    }
  } else {
    candles = internal::ParsePackedCandles(values, value_count);
    if (candles.status != UpdateStatus::kApplied) {
      return candles.status;
    }
  }
  MutationScope mutation(*this);
  SeriesData* series = FindSeriesLocked(series_id);
  if (series == nullptr || series->config.source != SeriesSource::kData) {
    return UpdateStatus::kInvalidInput;
  }
  if (value_count == 0) {
    if (series->candles.empty() && series->histogram.empty()) {
      return UpdateStatus::kApplied;
    }
    mutation.ContentChanged();
    series->candles.clear();
    series->histogram.clear();
    series->moving_average_states.clear();
    series->rsi_states.clear();
    series->signal_candles.clear();
    series->macd_states.clear();
    RefreshDerivedDependentsLocked(series_id, 0, mutation);
    return UpdateStatus::kApplied;
  }
  if ((series->config.type == SeriesType::kHistogram) != histogram) {
    return UpdateStatus::kInvalidInput;
  }
  mutation.ContentChanged();
  if (histogram) {
    series->histogram = std::move(points.points);
  } else {
    series->candles = std::move(candles.candles);
  }
  RefreshDerivedDependentsLocked(series_id, 0, mutation);
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
  internal::ParsedCandles candles;
  internal::ParsedHistogram points;
  if (histogram) {
    points = internal::ParsePackedHistogram(values, value_count);
    if (points.status != UpdateStatus::kApplied || points.points.empty()) {
      return points.status;
    }
  } else {
    candles = internal::ParsePackedCandles(values, value_count);
    if (candles.status != UpdateStatus::kApplied || candles.candles.empty()) {
      return candles.status;
    }
  }
  MutationScope mutation(*this);
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
    mutation.ContentChanged();
    series->histogram.insert(series->histogram.begin(), points.points.begin(),
                             points.points.end());
  } else {
    if (!series->candles.empty() &&
        candles.candles.back().timestamp >= series->candles.front().timestamp) {
      return UpdateStatus::kInvalidInput;
    }
    mutation.ContentChanged();
    series->candles.insert(series->candles.begin(), candles.candles.begin(),
                           candles.candles.end());
  }
  RefreshDerivedDependentsLocked(series_id, 0, mutation);
  return UpdateStatus::kApplied;
}

UpdateStatus ChartEngine::UpdateSeriesData(const std::string& series_id,
                                           const double* values,
                                           size_t value_count, bool histogram) {
  if (series_id == "main") {
    return histogram ? UpdateStatus::kInvalidInput
                     : UpdateCandle(values, value_count);
  }
  MutationScope mutation(*this);
  SeriesData* series = FindSeriesLocked(series_id);
  if (series == nullptr || series->config.source != SeriesSource::kData ||
      (series->config.type == SeriesType::kHistogram) != histogram) {
    return UpdateStatus::kInvalidInput;
  }
  if (histogram) {
    internal::ParsedHistogram parsed =
        internal::ParsePackedHistogram(values, value_count);
    if (parsed.status != UpdateStatus::kApplied ||
        parsed.points.size() != kSinglePointUpdateCount) {
      return UpdateStatus::kInvalidInput;
    }
    const HistogramPoint point = parsed.points.front();
    if (series->histogram.empty() ||
        point.timestamp > series->histogram.back().timestamp) {
      mutation.ContentChanged();
      series->histogram.push_back(point);
    } else if (point.timestamp == series->histogram.back().timestamp) {
      mutation.ContentChanged();
      series->histogram.back() = point;
    } else {
      return UpdateStatus::kIgnoredOldTimestamp;
    }
  } else {
    internal::ParsedCandles parsed =
        internal::ParsePackedCandles(values, value_count);
    if (parsed.status != UpdateStatus::kApplied ||
        parsed.candles.size() != kSinglePointUpdateCount) {
      return UpdateStatus::kInvalidInput;
    }
    const Candle candle = parsed.candles.front();
    const size_t previous_size = series->candles.size();
    size_t first_changed = previous_size == 0 ? 0 : previous_size - 1;
    if (series->candles.empty() ||
        candle.timestamp > series->candles.back().timestamp) {
      first_changed = previous_size;
      mutation.ContentChanged();
      series->candles.push_back(candle);
    } else if (candle.timestamp == series->candles.back().timestamp) {
      mutation.ContentChanged();
      series->candles.back() = candle;
    } else {
      return UpdateStatus::kIgnoredOldTimestamp;
    }
    RefreshDerivedDependentsLocked(series_id, first_changed, mutation);
  }
  return UpdateStatus::kApplied;
}

}  // namespace trading_charts
