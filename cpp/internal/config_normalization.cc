// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/config_normalization.h"

#include <algorithm>
#include <cmath>
#include <utility>
#include <vector>

#include "cpp/internal/config_constants.h"
#include "cpp/internal/trading_time.h"

namespace trading_charts::internal {
namespace {

template <typename T>
bool IsFinitePositive(T value) {
  return std::isfinite(value) && value > static_cast<T>(0);
}

bool IsSupportedMainSeriesType(SeriesType type) {
  return type == SeriesType::kCandlestick || type == SeriesType::kBar ||
         type == SeriesType::kHollowCandlestick || type == SeriesType::kLine ||
         type == SeriesType::kArea;
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

}  // namespace

bool HasValidScaleMargins(double top, double bottom) {
  return std::isfinite(top) && top >= 0.0 && std::isfinite(bottom) &&
         bottom >= 0.0 &&
         top + bottom <=
             kMaximumCombinedScaleMargin - kMinimumScaleContentFraction;
}

TradingCalendarConfig NormalizeTradingCalendar(TradingCalendarConfig calendar) {
  std::sort(
      calendar.transitions.begin(), calendar.transitions.end(),
      [](const TimeZoneTransition& first, const TimeZoneTransition& second) {
        return first.at_utc_ms < second.at_utc_ms;
      });
  if (calendar.transitions.empty()) {
    calendar.transitions.push_back(TimeZoneTransition{0, 0});
  }
  std::sort(calendar.holidays.begin(), calendar.holidays.end(),
            [](const CivilDate& first, const CivilDate& second) {
              return DaysFromCivil(first) < DaysFromCivil(second);
            });
  std::sort(calendar.overrides.begin(), calendar.overrides.end(),
            [](const TradingCalendarOverrideConfig& first,
               const TradingCalendarOverrideConfig& second) {
              return DaysFromCivil(first.date) < DaysFromCivil(second.date);
            });
  calendar.week_starts_on =
      calendar.week_starts_on == kIsoSunday ? kIsoSunday : kIsoMonday;
  return calendar;
}

ChartConfig NormalizeChartConfig(ChartConfig config) {
  const ChartConfig defaults;
  config.resolution.multiplier =
      std::max(config.resolution.multiplier, kMinimumResolutionMultiplier);
  config.resolution.fixed_duration_ms = std::max(
      config.resolution.fixed_duration_ms, kMinimumFixedDurationMilliseconds);
  config.trade_aggregation.calendar =
      NormalizeTradingCalendar(std::move(config.trade_aggregation.calendar));
  config.initial_visible_count =
      std::max(config.initial_visible_count, kMinimumInitialVisibleCount);
  if (!IsFinitePositive(config.default_scale)) {
    config.default_scale = defaults.default_scale;
  }
  if (!std::isfinite(config.default_y_scale)) {
    config.default_y_scale = defaults.default_y_scale;
  }
  config.default_y_scale =
      std::clamp(config.default_y_scale, 1.0 / kMaxYRangeMultiplier,
                 1.0 / kMinYRangeMultiplier);
  if (!IsFinitePositive(config.display_scale)) {
    config.display_scale = defaults.display_scale;
  }
  if (!IsSupportedMainSeriesType(config.series_type)) {
    config.series_type = SeriesType::kCandlestick;
  }
  if (!std::isfinite(config.candle_radius) || config.candle_radius < 0.0F) {
    config.candle_radius = 0.0F;
  }
  if (!IsFinitePositive(config.bar_line_width)) {
    config.bar_line_width = config.display_scale;
  }
  if (!IsFinitePositive(config.line_width)) {
    config.line_width = defaults.line_width * config.display_scale;
  }
  if (!std::isfinite(config.line_gap_threshold_ms) ||
      config.line_gap_threshold_ms < 0.0) {
    config.line_gap_threshold_ms = 0.0;
  }
  config.line_source = NormalizeLineSource(config.line_source);
  if (!std::isfinite(config.tooltip_background_opacity)) {
    config.tooltip_background_opacity = defaults.tooltip_background_opacity;
  }
  config.tooltip_background_opacity = std::clamp(
      config.tooltip_background_opacity, kMinimumOpacity, kMaximumOpacity);
  if (!std::isfinite(config.grid_opacity)) {
    config.grid_opacity = defaults.grid_opacity;
  }
  if (!std::isfinite(config.crosshair_opacity)) {
    config.crosshair_opacity = defaults.crosshair_opacity;
  }
  config.grid_opacity =
      std::clamp(config.grid_opacity, kMinimumOpacity, kMaximumOpacity);
  config.crosshair_opacity =
      std::clamp(config.crosshair_opacity, kMinimumOpacity, kMaximumOpacity);
  config.x_axis_height = std::max(config.x_axis_height, kMinimumAxisDimension);
  config.y_axis_width = std::max(config.y_axis_width, kMinimumAxisDimension);
  config.precision = std::clamp(config.precision, kMinimumPricePrecision,
                                kMaximumPricePrecision);
  if (!IsFinitePositive(config.min_move)) {
    config.min_move = defaults.min_move;
  }
  if (!HasValidScaleMargins(config.y_scale_margin_top,
                            config.y_scale_margin_bottom)) {
    config.y_scale_margin_top = defaults.y_scale_margin_top;
    config.y_scale_margin_bottom = defaults.y_scale_margin_bottom;
  }
  return config;
}

SeriesConfig NormalizeSeriesConfig(SeriesConfig config,
                                   const ChartConfig& chart_config) {
  config.line_source = NormalizeLineSource(config.line_source);
  if (!IsFinitePositive(config.line_width)) {
    config.line_width = chart_config.line_width;
  }
  if (!std::isfinite(config.line_gap_threshold_ms) ||
      config.line_gap_threshold_ms < 0.0) {
    config.line_gap_threshold_ms = 0.0;
  }
  return config;
}

}  // namespace trading_charts::internal
