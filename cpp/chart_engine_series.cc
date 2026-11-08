// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <iterator>
#include <optional>
#include <string>
#include <tuple>
#include <unordered_map>
#include <unordered_set>
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
         type == SeriesType::kArea || type == SeriesType::kBaseline;
}

bool IsRsiMacdPair(SeriesSource first, SeriesSource second) {
  return (first == SeriesSource::kOhlcvRsi &&
          second == SeriesSource::kOhlcvMacd) ||
         (first == SeriesSource::kOhlcvMacd &&
          second == SeriesSource::kOhlcvRsi);
}

// These fields determine source bindings and the values stored by the
// indicator calculators. Styling can change without invalidating either.
auto SeriesCalculationInputs(const SeriesConfig& config) {
  return std::tie(
      config.type, config.source, config.source_series_id, config.pane_id,
      config.price_scale_id, config.line_source, config.rsi_period,
      config.moving_average_period, config.macd_fast_period,
      config.macd_slow_period, config.macd_signal_period, config.boll_period,
      config.boll_std_dev_multiplier, config.sar_step, config.sar_maximum,
      config.williams_period, config.kdj_period, config.kdj_m1, config.kdj_m2);
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

bool ValidSeriesParameters(const SeriesConfig& config) {
  const bool has_valid_identifiers =
      !config.series_id.empty() && config.series_id != "main" &&
      !config.pane_id.empty() && !config.price_scale_id.empty();
  if (!has_valid_identifiers || !IsSupportedSeriesType(config.type)) {
    return false;
  }
  if (RequiresDedicatedPane(config.source) &&
      (config.type != SeriesType::kLine || config.source_series_id.empty() ||
       config.source_series_id == config.series_id)) {
    return false;
  }
  if (config.source == SeriesSource::kOhlcvWilliamsR &&
      (config.williams_period == 0 ||
       !(config.williams_oversold >= -100.0 &&
         config.williams_oversold < config.williams_overbought &&
         config.williams_overbought <= 0.0))) {
    return false;
  }
  if (config.source == SeriesSource::kOhlcvKdj &&
      (config.kdj_period == 0 || config.kdj_m1 == 0 || config.kdj_m2 == 0)) {
    return false;
  }
  if (config.source == SeriesSource::kOhlcvRsi &&
      !IsValidRsiSeriesConfig(config)) {
    return false;
  }
  if (IsMovingAverageSource(config.source) &&
      !IsValidMovingAverageSeriesConfig(config)) {
    return false;
  }
  if (config.source == SeriesSource::kOhlcvMacd &&
      !IsValidMacdSeriesConfig(config)) {
    return false;
  }
  if (config.source == SeriesSource::kOhlcvSar &&
      (config.type != SeriesType::kLine || config.source_series_id.empty() ||
       !std::isfinite(config.sar_step) || !std::isfinite(config.sar_maximum) ||
       config.sar_step <= 0.0 || config.sar_step > config.sar_maximum ||
       config.sar_maximum > 1.0)) {
    return false;
  }
  if (config.source == SeriesSource::kOhlcvBoll &&
      (config.type != SeriesType::kLine || config.boll_period == 0 ||
       !std::isfinite(config.boll_std_dev_multiplier) ||
       config.boll_std_dev_multiplier <= 0.0 ||
       config.source_series_id.empty())) {
    return false;
  }
  return true;
}

bool ValidSeriesPlacement(const SeriesConfig& config,
                          const std::vector<PaneConfig>& panes,
                          const std::vector<SeriesData>& series,
                          bool complete) {
  const auto pane = std::find_if(
      panes.begin(), panes.end(), [&](const PaneConfig& candidate) {
        return candidate.pane_id == config.pane_id &&
               candidate.price_scale_id == config.price_scale_id;
      });
  if (pane == panes.end()) {
    return false;
  }
  if (pane == panes.begin() && (IsFixedOscillator(config.source) ||
                                RequiresDedicatedPane(config.source) ||
                                config.source == SeriesSource::kOhlcvMacd)) {
    return false;
  }
  for (const auto& other : series) {
    if (other.config.pane_id != config.pane_id ||
        other.config.series_id == config.series_id ||
        other.config.source == config.source) {
      continue;
    }
    const auto other_source = other.config.source;
    if (RequiresDedicatedPane(config.source) ||
        RequiresDedicatedPane(other_source) ||
        ((complete || other.pane_index.has_value()) &&
         IsRsiMacdPair(config.source, other_source))) {
      return false;
    }
  }
  const bool same_pane = IsMovingAverageSource(config.source) ||
                         config.source == SeriesSource::kOhlcvBoll ||
                         config.source == SeriesSource::kOhlcvSar;
  const bool needs_source = same_pane || RequiresDedicatedPane(config.source) ||
                            config.source == SeriesSource::kOhlcvMacd;
  if (!needs_source && !(complete && IsDerivedOhlcvSource(config.source))) {
    return true;
  }
  if (config.source_series_id == "main" || config.source_series_id.empty()) {
    return !same_pane || pane == panes.begin();
  }
  const auto source =
      std::find_if(series.begin(), series.end(), [&](const SeriesData& item) {
        return item.config.series_id == config.source_series_id;
      });
  if (source == series.end()) {
    return !complete && config.declarative;
  }
  return source->config.source == SeriesSource::kData &&
         source->config.type != SeriesType::kHistogram &&
         (!same_pane ||
          (source->config.pane_id == config.pane_id &&
           source->config.price_scale_id == config.price_scale_id));
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
    if (IsDerivedOhlcvSource(source) && source != SeriesSource::kOhlcvVolume &&
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

bool ChartEngine::PaneHasFixedScaleLocked(size_t pane_index) const {
  return std::any_of(additional_series_.begin(), additional_series_.end(),
                     [&](const SeriesData& series) {
                       return series.pane_index.has_value() &&
                              *series.pane_index == pane_index &&
                              IsFixedOscillator(series.config.source);
                     });
}

UpdateStatus ChartEngine::AddSeries(const SeriesConfig& config) {
  if (!ValidSeriesParameters(config)) {
    return UpdateStatus::kInvalidInput;
  }
  MutationScope mutation(*this);
  SeriesConfig normalized = internal::NormalizeSeriesConfig(config, config_);
  if (!ValidSeriesPlacement(normalized, panes_, additional_series_, false)) {
    return UpdateStatus::kInvalidInput;
  }
  SeriesData* existing = FindSeriesLocked(normalized.series_id);
  if (existing != nullptr) {
    if (!existing->config.declarative || !normalized.declarative) {
      return UpdateStatus::kInvalidInput;
    }
    mutation.ContentChanged();
    if (SeriesCalculationInputs(existing->config) ==
        SeriesCalculationInputs(normalized)) {
      existing->config = std::move(normalized);
      return UpdateStatus::kApplied;
    }
    if (IsRsiMacdPair(existing->config.source, normalized.source)) {
      *existing = SeriesData{};
    }
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

UpdateStatus ChartEngine::ApplyConfiguration(
    const ChartConfig& config, const std::vector<PaneConfig>& panes,
    bool resizable, const std::vector<SeriesConfig>& declarations) {
  auto normalized = internal::NormalizeChartConfig(config);
  MutationScope mutation(*this);
  auto next_panes = NormalizePanesLocked(panes, normalized);
  std::vector<SeriesData> next;
  next.reserve(declarations.size() + additional_series_.size());
  std::unordered_set<std::string> requested;
  for (const auto& declaration : declarations) {
    if ((declaration.source == SeriesSource::kOhlcvVolume &&
         declaration.type != SeriesType::kHistogram) ||
        !ValidSeriesParameters(declaration) ||
        !requested.insert(declaration.series_id).second) {
      return UpdateStatus::kInvalidInput;
    }
  }

  std::unordered_map<std::string, SeriesData*> previous_by_id;
  for (auto& item : additional_series_) {
    previous_by_id.emplace(item.config.series_id, &item);
  }
  auto declaration = declarations.begin();
  const auto append_declaration = [&] {
    auto& item = next.emplace_back();
    item.config = internal::NormalizeSeriesConfig(*declaration, normalized);
    ++declaration;
    item.config.declarative = true;
  };
  // Fill surviving declarative slots in the new draw order. Runtime series
  // retain their relative position and new declarations follow existing slots.
  for (const auto& item : additional_series_) {
    if (item.config.declarative) {
      if (requested.count(item.config.series_id) != 0) {
        append_declaration();
      }
      continue;
    }
    if (requested.count(item.config.series_id) != 0) {
      return UpdateStatus::kInvalidInput;
    }
    const auto source = previous_by_id.find(item.config.source_series_id);
    if (IsDerivedOhlcvSource(item.config.source) &&
        source != previous_by_id.end() && source->second->config.declarative &&
        !requested.count(item.config.source_series_id)) {
      continue;  // Match RemoveSeries' cascade when a declared source
                 // disappears.
    }
    next.emplace_back().config = item.config;
  }
  while (declaration != declarations.end()) {
    append_declaration();
  }
  for (const auto& item : next) {
    // A runtime series can outlive its pane. Keep it dormant until the pane
    // returns, but check dependencies on replaced declarations in live panes.
    const bool affected_runtime =
        requested.count(item.config.source_series_id) != 0 &&
        std::any_of(next_panes.begin(), next_panes.end(),
                    [&](const PaneConfig& pane) {
                      return pane.pane_id == item.config.pane_id &&
                             pane.price_scale_id == item.config.price_scale_id;
                    });
    if ((item.config.declarative || affected_runtime) &&
        !ValidSeriesPlacement(item.config, next_panes, next,
                              item.config.declarative)) {
      return UpdateStatus::kInvalidInput;
    }
  }

  // Resolve every retained data store before building indicators. A forward
  // reference can then use exactly the same input as a backward reference.
  std::vector<SeriesData*> retained(next.size(), nullptr);
  std::unordered_map<std::string, const std::vector<Candle>*> sources;
  sources.emplace("main", &candles_);
  for (size_t index = 0; index < next.size(); ++index) {
    const auto& target = next[index].config;
    const auto old = previous_by_id.find(target.series_id);
    if (target.source != SeriesSource::kData || old == previous_by_id.end()) {
      continue;
    }
    auto* data = old->second;
    const bool histogram = target.type == SeriesType::kHistogram;
    if (data->config.source == SeriesSource::kData &&
        (data->config.type == SeriesType::kHistogram) == histogram) {
      retained[index] = data;
      if (!histogram) {
        sources.emplace(target.series_id, &data->candles);
      }
    }
  }
  for (size_t index = 0; index < next.size(); ++index) {
    auto& item = next[index];
    if (!IsDerivedOhlcvSource(item.config.source) ||
        item.config.source == SeriesSource::kOhlcvVolume) {
      continue;
    }
    const auto source = sources.find(item.config.source_series_id.empty()
                                         ? "main"
                                         : item.config.source_series_id);
    const auto* candles = source != sources.end() ? source->second : nullptr;
    const auto old = previous_by_id.find(item.config.series_id);
    if (old != previous_by_id.end() &&
        SeriesCalculationInputs(old->second->config) ==
            SeriesCalculationInputs(item.config) &&
        SourceCandlesLocked(*old->second) == candles) {
      retained[index] = old->second;
    } else {
      internal::RebuildDerivedSeries(item, candles, 0);
    }
  }

  // Validation and indicator allocations have finished. Transfer ownership
  // of compatible histories without copying them or publishing interim state.
  mutation.ContentChanged();
  for (size_t index = 0; index < next.size(); ++index) {
    if (retained[index] != nullptr) {
      auto updated = std::move(next[index].config);
      next[index] = std::move(*retained[index]);
      next[index].config = std::move(updated);
    }
  }
  additional_series_ = std::move(next);
  panes_ = std::move(next_panes);
  panes_resizable_ =
      resizable && panes_.size() >= internal::kMinimumResizablePaneCount;
  SetConfigLocked(std::move(normalized), mutation);
  RebuildSeriesIndicesLocked(mutation);
  return UpdateStatus::kApplied;
}

bool ChartEngine::SetSeriesLegendVisible(const std::string& series_id,
                                         bool visible) {
  MutationScope mutation(*this);
  SeriesData* series = FindSeriesLocked(series_id);
  if (series == nullptr || !IsDerivedOhlcvSource(series->config.source) ||
      series->config.source == SeriesSource::kOhlcvSar ||
      series->config.legend_visible == visible) {
    return false;
  }
  mutation.OverlayChanged();
  series->config.legend_visible = visible;
  return true;
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
    series->boll_states.clear();
    series->sar_states.clear();
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
