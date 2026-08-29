// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/config_normalization.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <utility>

#include "cpp/internal/trading_time.h"

namespace trading_charts::internal {
namespace {

constexpr double kMinYRangeMultiplier = 0.1;
constexpr double kMaxYRangeMultiplier = 10.0;

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
  calendar.week_starts_on = calendar.week_starts_on == 7 ? 7 : 1;
  return calendar;
}

ChartConfig NormalizeChartConfig(ChartConfig config) {
  config.resolution.multiplier = std::max(config.resolution.multiplier, 1U);
  config.resolution.fixed_duration_ms =
      std::max(config.resolution.fixed_duration_ms, std::int64_t{1});
  config.trade_aggregation.calendar =
      NormalizeTradingCalendar(std::move(config.trade_aggregation.calendar));
  config.initial_visible_count = std::max(config.initial_visible_count, 1);
  if (!std::isfinite(config.default_scale) || !(config.default_scale > 0.0)) {
    config.default_scale = 1.0;
  }
  if (!std::isfinite(config.default_y_scale)) {
    config.default_y_scale = 1.0;
  }
  config.default_y_scale =
      std::clamp(config.default_y_scale, 1.0 / kMaxYRangeMultiplier,
                 1.0 / kMinYRangeMultiplier);
  if (!std::isfinite(config.display_scale) || !(config.display_scale > 0.0F)) {
    config.display_scale = 1.0F;
  }
  if (config.series_type != SeriesType::kCandlestick &&
      config.series_type != SeriesType::kBar &&
      config.series_type != SeriesType::kHollowCandlestick &&
      config.series_type != SeriesType::kLine &&
      config.series_type != SeriesType::kArea) {
    config.series_type = SeriesType::kCandlestick;
  }
  if (!std::isfinite(config.candle_radius) || config.candle_radius < 0.0F) {
    config.candle_radius = 0.0F;
  }
  if (!std::isfinite(config.bar_line_width) ||
      !(config.bar_line_width > 0.0F)) {
    config.bar_line_width = config.display_scale;
  }
  if (!std::isfinite(config.line_width) || !(config.line_width > 0.0F)) {
    config.line_width = 1.5F * config.display_scale;
  }
  if (!std::isfinite(config.line_gap_threshold_ms) ||
      config.line_gap_threshold_ms < 0.0) {
    config.line_gap_threshold_ms = 0.0;
  }
  config.line_source = NormalizeLineSource(config.line_source);
  if (!std::isfinite(config.tooltip_background_opacity)) {
    config.tooltip_background_opacity = 1.0F;
  }
  config.tooltip_background_opacity =
      std::clamp(config.tooltip_background_opacity, 0.0F, 1.0F);
  if (!std::isfinite(config.grid_opacity)) {
    config.grid_opacity = 0.75F;
  }
  if (!std::isfinite(config.crosshair_opacity)) {
    config.crosshair_opacity = 0.85F;
  }
  config.grid_opacity = std::clamp(config.grid_opacity, 0.0F, 1.0F);
  config.crosshair_opacity = std::clamp(config.crosshair_opacity, 0.0F, 1.0F);
  config.x_axis_height = std::max(config.x_axis_height, 1.0F);
  config.y_axis_width = std::max(config.y_axis_width, 1.0F);
  config.precision = std::clamp(config.precision, 0, 12);
  if (!std::isfinite(config.min_move) || !(config.min_move > 0.0)) {
    config.min_move = 0.01;
  }
  if (!std::isfinite(config.y_scale_margin_top) ||
      config.y_scale_margin_top < 0.0 ||
      !std::isfinite(config.y_scale_margin_bottom) ||
      config.y_scale_margin_bottom < 0.0 ||
      config.y_scale_margin_top + config.y_scale_margin_bottom >= 1.0) {
    config.y_scale_margin_top = 0.2;
    config.y_scale_margin_bottom = 0.1;
  }
  return config;
}

SeriesConfig NormalizeSeriesConfig(SeriesConfig config,
                                   const ChartConfig& chart_config) {
  config.line_source = NormalizeLineSource(config.line_source);
  if (!std::isfinite(config.line_width) || !(config.line_width > 0.0F)) {
    config.line_width = chart_config.line_width;
  }
  if (!std::isfinite(config.line_gap_threshold_ms) ||
      config.line_gap_threshold_ms < 0.0) {
    config.line_gap_threshold_ms = 0.0;
  }
  return config;
}

}  // namespace trading_charts::internal
