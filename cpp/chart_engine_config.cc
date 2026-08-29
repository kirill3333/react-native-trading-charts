// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <cmath>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/config_constants.h"
#include "cpp/internal/config_normalization.h"

namespace trading_charts {
namespace {

constexpr double kFallbackPaneTopScaleMargin = 0.1;
constexpr double kFallbackPaneBottomScaleMargin = 0.0;

}  // namespace

void ChartEngine::SetConfig(const ChartConfig& config) {
  ChartConfig normalized_config = internal::NormalizeChartConfig(config);
  std::lock_guard<std::mutex> lock(mutex_);
  // Compare against the normalized config: raw inputs that normalize to the
  // current values must not trigger a viewport reset.
  const bool viewport_defaults_changed =
      config_.initial_visible_count !=
          normalized_config.initial_visible_count ||
      config_.resolution.unit != normalized_config.resolution.unit ||
      config_.resolution.multiplier !=
          normalized_config.resolution.multiplier ||
      config_.resolution.fixed_duration_ms !=
          normalized_config.resolution.fixed_duration_ms ||
      config_.logical_spacing != normalized_config.logical_spacing;
  config_ = std::move(normalized_config);
  if (!panes_.empty()) {
    PaneConfig& main_pane = panes_[internal::kMainPaneIndex];
    main_pane.scale_margin_top = config_.y_scale_margin_top;
    main_pane.scale_margin_bottom = config_.y_scale_margin_bottom;
    main_pane.min_move = config_.min_move;
    main_pane.precision = config_.precision;
    main_pane.scale_visible = config_.show_y_axis;
  }
  if (viewport_defaults_changed && !candles_.empty()) {
    ResetViewportLocked();
  }
  if (!config_.crosshair_enabled) {
    crosshair_active_ = false;
  }
  MarkDirtyLocked();
}

void ChartEngine::SetTradingCalendar(const TradingCalendarConfig& calendar) {
  TradingCalendarConfig normalized =
      internal::NormalizeTradingCalendar(calendar);
  std::lock_guard<std::mutex> lock(mutex_);
  config_.trade_aggregation.calendar = std::move(normalized);
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
    const PaneConfig defaults;
    for (PaneConfig pane : panes) {
      const bool has_identifiers =
          !pane.pane_id.empty() && !pane.price_scale_id.empty();
      const bool has_valid_weight =
          std::isfinite(pane.height_weight) && pane.height_weight > 0.0;
      const bool has_valid_minimum_height =
          std::isfinite(pane.min_height) && pane.min_height > 0.0F;
      if (!has_identifiers || !has_valid_weight || !has_valid_minimum_height) {
        continue;
      }
      pane.scale_margin_top = std::max(0.0, pane.scale_margin_top);
      pane.scale_margin_bottom = std::max(0.0, pane.scale_margin_bottom);
      if (pane.scale_margin_top + pane.scale_margin_bottom >=
          internal::kMaximumCombinedScaleMargin) {
        pane.scale_margin_top = kFallbackPaneTopScaleMargin;
        pane.scale_margin_bottom = kFallbackPaneBottomScaleMargin;
      }
      if (!std::isfinite(pane.min_move) || pane.min_move <= 0.0) {
        pane.min_move = defaults.min_move;
      }
      pane.precision =
          std::clamp(pane.precision, internal::kMinimumPricePrecision,
                     internal::kMaximumPricePrecision);
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
  panes_resizable_ =
      resizable && panes_.size() >= internal::kMinimumResizablePaneCount;
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
  RebuildAllDerivedSeriesLocked();
  MarkDirtyLocked();
}

bool ChartEngine::SetPaneHeight(const std::string& pane_id,
                                double height_weight) {
  if (!std::isfinite(height_weight) || height_weight <= 0.0) {
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

}  // namespace trading_charts
