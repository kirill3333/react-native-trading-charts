// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <cstdlib>
#include <initializer_list>
#include <iterator>
#include <limits>
#include <memory>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/config_constants.h"
#include "cpp/internal/config_normalization.h"
#include "cpp/internal/render_snapshot_builder.h"
#include "cpp/internal/render_snapshot_builder_impl.h"
#include "cpp/internal/trading_time.h"

namespace trading_charts::internal {

namespace {

constexpr int kMaxTickCount = 256;
constexpr float kYAxisTickSpacing = 44.0f;
constexpr float kXAxisTickSpacing = 72.0f;

constexpr int kMinimumVolumeTickCount = 3;
constexpr int kMinimumAxisTickCount = 2;
constexpr double kTickBoundaryTolerance = 1e-9;
constexpr double kDecimalStepBase = 10.0;
constexpr size_t kNiceStepFactorCount = 4;
using NiceStepFactors = std::array<double, kNiceStepFactorCount>;
constexpr NiceStepFactors kNiceStepFactors = {1.0, 2.0, 2.5, 5.0};

constexpr double kAutoscaleMinMoveExpansion = 5.0;
constexpr double kEmptyPaneMinMoveCount = 10.0;
constexpr double kMinimumPaneRange = 1.0;
constexpr double kEmptyVolumeMaximum = 1.0;

constexpr size_t kTimeStepCandidateCount = 19;

constexpr double Seconds(double count) {
  return count * static_cast<double>(kMillisecondsPerSecond);
}

constexpr double Minutes(double count) {
  return count * static_cast<double>(kMillisecondsPerMinute);
}

constexpr double Hours(double count) {
  return count * static_cast<double>(kMillisecondsPerHour);
}

constexpr double Days(double count) {
  return count * static_cast<double>(kMillisecondsPerDay);
}

size_t ClampLogicalIndex(double index, size_t last_index) {
  const double capped_at_last =
      std::min(static_cast<double>(last_index), index);
  const double non_negative_index = std::max(0.0, capped_at_last);
  return static_cast<size_t>(non_negative_index);
}

double NiceStep(double range, int target_count, double minimum) {
  if (!(range > 0.0) || target_count <= 0) {
    return std::max(minimum, 1.0);
  }
  const double raw =
      std::max(range / static_cast<double>(target_count), minimum);
  const double power = std::pow(kDecimalStepBase, std::floor(std::log10(raw)));
  const double fraction = raw / power;
  double nice = kDecimalStepBase;
  for (double candidate : kNiceStepFactors) {
    if (fraction <= candidate) {
      nice = candidate;
      break;
    }
  }
  return std::max(nice * power, minimum);
}

double PreviousNiceStep(double step, double minimum) {
  if (!(step > minimum)) {
    return step;
  }
  const double upper_bound = std::nextafter(step, 0.0);
  const double power =
      std::pow(kDecimalStepBase, std::floor(std::log10(upper_bound)));
  const double fraction = upper_bound / power;
  double nice = kNiceStepFactors.front();
  for (auto candidate = kNiceStepFactors.rbegin();
       candidate != kNiceStepFactors.rend(); ++candidate) {
    if (fraction >= *candidate) {
      nice = *candidate;
      break;
    }
  }
  return std::max(nice * power, minimum);
}

int TickCount(double minimum, double maximum, double step, int limit) {
  if (!(maximum >= minimum) || !(step > 0.0) || limit <= 0) {
    return 0;
  }
  const double first = std::ceil(minimum / step) * step;
  int count = 0;
  for (; count < limit; ++count) {
    const double value = first + static_cast<double>(count) * step;
    if (value > maximum + step * kTickBoundaryTolerance) {
      break;
    }
  }
  return count;
}

double EnsureMinimumNiceTickCount(double minimum, double maximum, double step,
                                  double minimum_step, int minimum_count) {
  while (TickCount(minimum, maximum, step, minimum_count) < minimum_count) {
    const double previous = PreviousNiceStep(step, minimum_step);
    if (!(previous < step)) {
      break;
    }
    step = previous;
  }
  return step;
}

double TimeStep(double span, int target_count) {
  constexpr std::array<double, kTimeStepCandidateCount> kCandidates = {
      Seconds(1.0), Seconds(5.0),  Seconds(15.0), Seconds(30.0), Minutes(1.0),
      Minutes(5.0), Minutes(15.0), Minutes(30.0), Hours(1.0),    Hours(4.0),
      Hours(12.0),  Hours(24.0),   Days(2.0),     Days(7.0),     Days(14.0),
      Days(30.0),   Days(90.0),    Days(180.0),   Days(365.0),
  };
  const double desired = span / static_cast<double>(std::max(target_count, 1));
  for (double candidate : kCandidates) {
    if (candidate >= desired) {
      return candidate;
    }
  }
  return NiceStep(span, target_count, 1.0);
}

}  // namespace

void RenderSnapshotBuilder::FindVisibleRange() {
  if (input_.config.logical_spacing) {
    const size_t last_index = input_.candles.size() - 1;
    const size_t lower_index =
        ClampLogicalIndex(std::ceil(input_.visible_x_min), last_index);
    // The iterator range is half-open, so the inclusive upper candle index
    // advances by one after clamping.
    const size_t upper_index =
        ClampLogicalIndex(std::floor(input_.visible_x_max), last_index) + 1;
    lower_ = input_.candles.begin() + static_cast<std::ptrdiff_t>(lower_index);
    upper_ = input_.candles.begin() + static_cast<std::ptrdiff_t>(upper_index);
  } else {
    lower_ = std::lower_bound(input_.candles.begin(), input_.candles.end(),
                              input_.visible_x_min,
                              [](const Candle& candle, double value) {
                                return candle.timestamp < value;
                              });
    upper_ = std::upper_bound(input_.candles.begin(), input_.candles.end(),
                              input_.visible_x_max,
                              [](double value, const Candle& candle) {
                                return value < candle.timestamp;
                              });
  }
  // When the viewport sits inside a data gap (irregular timestamps in time
  // mode) the window is honestly empty: lower_ == upper_ is preserved
  // instead of falling back to the whole store. Autoscale then anchors to
  // the neighboring candles (see CalculateYRange) and platforms suppress
  // visible-range events via has_visible_candles == false.
}

void RenderSnapshotBuilder::SetVisibleRangeMetadata() {
  const size_t first =
      static_cast<size_t>(std::distance(input_.candles.begin(), lower_));
  if (lower_ == upper_) {
    // Empty window (data gap): report the insertion point with
    // last < first so consumers see an honest empty range, and suppress
    // visible-range events through has_visible_candles == false.
    snapshot_->first_visible_index = first;
    snapshot_->last_visible_index = first == 0 ? 0 : first - 1;
    snapshot_->has_visible_candles = false;
    return;
  }
  snapshot_->first_visible_index = first;
  snapshot_->last_visible_index =
      static_cast<size_t>(std::distance(input_.candles.begin(), upper_) - 1);
  snapshot_->has_visible_candles = true;

  if (input_.config.logical_spacing) {
    snapshot_->visible_x_min = lower_->timestamp;
    snapshot_->visible_x_max = (upper_ - 1)->timestamp;
    if (!(snapshot_->visible_x_max > snapshot_->visible_x_min)) {
      snapshot_->visible_x_max =
          snapshot_->visible_x_min +
          NominalResolutionMilliseconds(input_.config.resolution);
    }
  }
}

void RenderSnapshotBuilder::CalculateYRange() {
  // For an empty visible window (data gap) anchor the autoscale to the
  // candles adjacent to the gap so the y-range stays stable while panning
  // through it. Extrema of these neighbors project outside the plot and
  // are therefore hidden.
  CandleIterator range_begin = lower_;
  CandleIterator range_end = upper_;
  if (range_begin == range_end) {
    range_begin = lower_ == input_.candles.begin() ? lower_ : lower_ - 1;
    range_end = lower_ == input_.candles.end() ? lower_ : lower_ + 1;
  }
  minimum_candle_ = range_begin;
  maximum_candle_ = range_begin;
  const bool line = IsLineLikeSeries(input_.config.series_type);
  double raw_min = line ? CandleValue(*range_begin, input_.config.line_source)
                        : range_begin->low;
  double raw_max = line ? raw_min : range_begin->high;
  for (auto it = range_begin; it != range_end; ++it) {
    const double minimum =
        line ? CandleValue(*it, input_.config.line_source) : it->low;
    const double maximum = line ? minimum : it->high;
    if (minimum < raw_min) {
      raw_min = minimum;
      minimum_candle_ = it;
    }
    if (maximum > raw_max) {
      raw_max = maximum;
      maximum_candle_ = it;
    }
  }
  visible_minimum_value_ = raw_min;
  visible_maximum_value_ = raw_max;
  IncludeAdditionalSeriesRange(0, raw_min, raw_max);
  if (!(raw_max > raw_min)) {
    const double extend_value =
        kAutoscaleMinMoveExpansion * input_.config.min_move;
    raw_min -= extend_value;
    raw_max += extend_value;
  }
  if (!(raw_max > raw_min)) {
    raw_min = std::nextafter(raw_min, -std::numeric_limits<double>::infinity());
    raw_max = std::nextafter(raw_max, std::numeric_limits<double>::infinity());
  }

  const double raw_range = raw_max - raw_min;
  assert(HasValidScaleMargins(input_.config.y_scale_margin_top,
                              input_.config.y_scale_margin_bottom));
  const double inner_scale = 1.0 - input_.config.y_scale_margin_top -
                             input_.config.y_scale_margin_bottom;
  const double auto_y_min =
      raw_min - raw_range * input_.config.y_scale_margin_bottom / inner_scale;
  const double auto_y_max =
      raw_max + raw_range * input_.config.y_scale_margin_top / inner_scale;
  const double y_center = auto_y_min + (auto_y_max - auto_y_min) / 2.0;
  const double y_range = (auto_y_max - auto_y_min) * input_.y_range_multiplier;
  const double half_y_range = y_range / 2.0;
  y_min_ = y_center - half_y_range;
  y_max_ = y_center + half_y_range;
  snapshot_->visible_y_min = y_min_;
  snapshot_->visible_y_max = y_max_;
  pane_y_min_[kMainPaneIndex] = y_min_;
  pane_y_max_[kMainPaneIndex] = y_max_;
  PaneSnapshot& main_pane = snapshot_->panes[kMainPaneIndex];
  main_pane.visible_y_min = y_min_;
  main_pane.visible_y_max = y_max_;
  main_pane.y_axis_scale = snapshot_->y_axis_scale;
}

const std::vector<Candle>* RenderSnapshotBuilder::SourceCandles(
    const SeriesData& series) const {
  switch (series.source_binding.kind) {
    case SeriesSourceBindingKind::kUnavailable:
      return nullptr;
    case SeriesSourceBindingKind::kMain:
      return &input_.candles;
    case SeriesSourceBindingKind::kAdditional: {
      const size_t index = series.source_binding.additional_series_index;
      assert(index < input_.additional_series.size());
      return index < input_.additional_series.size()
                 ? &input_.additional_series[index].candles
                 : nullptr;
    }
  }
  return nullptr;
}

// Computes the visible data window of every additional series once per
// snapshot. In time mode the bounds are the visible timestamps; in logical
// mode they are the timestamps bracketing the visible main candles, so a
// pair of binary searches per series replaces a full store scan.
void RenderSnapshotBuilder::ComputeSeriesWindows() {
  series_windows_.assign(input_.additional_series.size(), SeriesWindow{});
  // Logical series need a visible main-candle index to project onto. In time
  // mode additional series have independent timestamps and may legitimately
  // contain data inside a gap in the main series.
  if (!snapshot_->has_visible_candles && input_.config.logical_spacing) {
    return;
  }
  double bound_min = input_.visible_x_min;
  double bound_max = input_.visible_x_max;
  if (input_.config.logical_spacing) {
    bound_min = input_.candles[snapshot_->first_visible_index].timestamp;
    bound_max = input_.candles[snapshot_->last_visible_index].timestamp;
  }
  for (size_t index = 0; index < input_.additional_series.size(); ++index) {
    const SeriesData& series = input_.additional_series[index];
    if (!series.config.visible) {
      continue;
    }
    SeriesWindow& window = series_windows_[index];
    if (series.config.type == SeriesType::kHistogram) {
      if (series.config.source == SeriesSource::kOhlcvVolume) {
        const std::vector<Candle>* source = SourceCandles(series);
        if (source == nullptr) {
          continue;
        }
        if (input_.config.logical_spacing && source == &input_.candles) {
          window.first = snapshot_->first_visible_index;
          window.last = snapshot_->last_visible_index + 1;
        } else {
          window.first = LowerTimestampBound(*source, bound_min);
          window.last = UpperTimestampBound(*source, bound_max);
        }
      } else {
        window.first = LowerTimestampBound(series.histogram, bound_min);
        window.last = UpperTimestampBound(series.histogram, bound_max);
      }
    } else {
      window.first = LowerTimestampBound(series.candles, bound_min);
      window.last = UpperTimestampBound(series.candles, bound_max);
    }
  }
}

template <typename Callback>
void RenderSnapshotBuilder::VisitLineGapAnchors(const SeriesData& series,
                                                const SeriesWindow& window,
                                                Callback&& callback) const {
  if (series.config.source == SeriesSource::kOhlcvSar ||
      !IsLineLikeSeries(series.config.type) || window.first != window.last ||
      series.candles.empty()) {
    return;
  }
  // Logical spacing can only render timestamps present in the main store;
  // unmatched neighboring samples must stay out of autoscale as well.
  if (input_.config.logical_spacing) {
    return;
  }
  if (window.first > 0) {
    callback(series.candles[window.first - 1]);
  }
  if (window.first < series.candles.size()) {
    callback(series.candles[window.first]);
  }
}

void RenderSnapshotBuilder::IncludeAdditionalSeriesRange(
    size_t pane_index, double& minimum, double& maximum) const {
  for (size_t index = 0; index < input_.additional_series.size(); ++index) {
    const SeriesData& series = input_.additional_series[index];
    if (!series.config.visible || !IsSeriesInPane(series, pane_index)) {
      continue;
    }
    const SeriesWindow& window = series_windows_[index];
    if (series.config.source == SeriesSource::kOhlcvMacd) {
      minimum = std::min(minimum, 0.0);
      maximum = std::max(maximum, 0.0);
      const auto include_candle = [&](const Candle& candle) {
        minimum = std::min(minimum, candle.close);
        maximum = std::max(maximum, candle.close);
      };
      VisitVisibleSeriesSamples(window, series.candles,
                                input_.config.logical_spacing, include_candle);
      const SeriesWindow signal_window =
          VisibleWindowFor(series.signal_candles);
      VisitVisibleSeriesSamples(signal_window, series.signal_candles,
                                input_.config.logical_spacing, include_candle);
      VisitVisibleHistogram(index, [&](double, double value, const Color&) {
        minimum = std::min(minimum, value);
        maximum = std::max(maximum, value);
      });
      continue;
    }
    if (series.config.type == SeriesType::kHistogram) {
      minimum = std::min(minimum, 0.0);
      VisitVisibleHistogram(index, [&](double, double value, const Color&) {
        minimum = std::min(minimum, value);
        maximum = std::max(maximum, value);
      });
    } else {
      const auto include_candle = [&](const Candle& candle) {
        if (IsLineLikeSeries(series.config.type) &&
            series.config.source != SeriesSource::kOhlcvBoll) {
          const double value = CandleValue(candle, series.config.line_source);
          minimum = std::min(minimum, value);
          maximum = std::max(maximum, value);
        } else {
          minimum = std::min(minimum, candle.low);
          maximum = std::max(maximum, candle.high);
        }
      };
      VisitVisibleSeriesSamples(window, series.candles,
                                input_.config.logical_spacing, include_candle);
      VisitLineGapAnchors(series, window, include_candle);
    }
  }
}

void RenderSnapshotBuilder::CalculateAdditionalPaneRanges() {
  for (size_t pane_index = 1; pane_index < snapshot_->panes.size();
       ++pane_index) {
    const bool williams = snapshot_->panes[pane_index].williams_scale;
    if (williams || snapshot_->panes[pane_index].rsi_scale) {
      pane_y_min_[pane_index] = williams ? -100.0 : kRsiMinimumValue;
      pane_y_max_[pane_index] = williams ? 0.0 : kRsiMaximumValue;
      snapshot_->panes[pane_index].visible_y_min = pane_y_min_[pane_index];
      snapshot_->panes[pane_index].visible_y_max = pane_y_max_[pane_index];
      snapshot_->panes[pane_index].y_axis_scale = 1.0;
      continue;
    }
    bool has_value = false;
    double raw_min = std::numeric_limits<double>::infinity();
    double raw_max = -std::numeric_limits<double>::infinity();
    for (size_t index = 0; index < input_.additional_series.size(); ++index) {
      const SeriesData& series = input_.additional_series[index];
      if (!series.config.visible || !IsSeriesInPane(series, pane_index)) {
        continue;
      }
      const SeriesWindow& window = series_windows_[index];
      if (series.config.source == SeriesSource::kOhlcvMacd) {
        has_value = true;
        raw_min = std::min(raw_min, 0.0);
        raw_max = std::max(raw_max, 0.0);
        const auto include_candle = [&](const Candle& candle) {
          raw_min = std::min(raw_min, candle.close);
          raw_max = std::max(raw_max, candle.close);
        };
        VisitVisibleSeriesSamples(window, series.candles,
                                  input_.config.logical_spacing,
                                  include_candle);
        const SeriesWindow signal_window =
            VisibleWindowFor(series.signal_candles);
        VisitVisibleSeriesSamples(signal_window, series.signal_candles,
                                  input_.config.logical_spacing,
                                  include_candle);
        VisitVisibleHistogram(index, [&](double, double value, const Color&) {
          raw_min = std::min(raw_min, value);
          raw_max = std::max(raw_max, value);
        });
        continue;
      }
      if (series.config.type == SeriesType::kHistogram) {
        VisitVisibleHistogram(index, [&](double, double value, const Color&) {
          has_value = true;
          raw_min = std::min({raw_min, 0.0, value});
          raw_max = std::max(raw_max, value);
        });
      } else {
        const auto include_candle = [&](const Candle& candle) {
          has_value = true;
          if (series.config.source == SeriesSource::kOhlcvKdj) {
            raw_min =
                std::min({raw_min, candle.high, candle.close, candle.low});
            raw_max =
                std::max({raw_max, candle.high, candle.close, candle.low});
          } else if (IsLineLikeSeries(series.config.type) &&
                     series.config.source != SeriesSource::kOhlcvBoll) {
            const double value = CandleValue(candle, series.config.line_source);
            raw_min = std::min(raw_min, value);
            raw_max = std::max(raw_max, value);
          } else {
            raw_min = std::min(raw_min, candle.low);
            raw_max = std::max(raw_max, candle.high);
          }
        };
        VisitVisibleSeriesSamples(window, series.candles,
                                  input_.config.logical_spacing,
                                  include_candle);
        VisitLineGapAnchors(series, window, include_candle);
      }
    }
    const PaneConfig& pane = input_.panes[pane_index];
    if (!has_value) {
      raw_min = 0.0;
      raw_max = pane.volume_format ? kEmptyVolumeMaximum
                                   : pane.min_move * kEmptyPaneMinMoveCount;
    }
    if (!(raw_max > raw_min)) {
      const double minimum_range = std::max(
          pane.min_move * kAutoscaleMinMoveExpansion, kMinimumPaneRange);
      raw_max = raw_min + minimum_range;
    }
    assert(
        HasValidScaleMargins(pane.scale_margin_top, pane.scale_margin_bottom));
    const double inner = 1.0 - pane.scale_margin_top - pane.scale_margin_bottom;
    const double raw_range = raw_max - raw_min;
    const double auto_min =
        raw_min - raw_range * pane.scale_margin_bottom / inner;
    const double auto_max = raw_max + raw_range * pane.scale_margin_top / inner;
    const double center = (auto_min + auto_max) / 2.0;
    const double range = (auto_max - auto_min) * pane.y_range_multiplier;
    const double half_range = range / 2.0;
    pane_y_min_[pane_index] = center - half_range;
    pane_y_max_[pane_index] = center + half_range;
    snapshot_->panes[pane_index].visible_y_min = pane_y_min_[pane_index];
    snapshot_->panes[pane_index].visible_y_max = pane_y_max_[pane_index];
    snapshot_->panes[pane_index].y_axis_scale = 1.0 / pane.y_range_multiplier;
  }
}

void RenderSnapshotBuilder::AddExtremum(PriceExtremum& extremum,
                                        CandleIterator candle, double value) {
  const size_t index =
      static_cast<size_t>(std::distance(input_.candles.cbegin(), candle));
  const double domain_x = input_.config.logical_spacing
                              ? static_cast<double>(index)
                              : candle->timestamp;
  const float x = ProjectX(domain_x);
  const float y = ProjectY(value);
  if (x < snapshot_->plot.left || x > snapshot_->plot.right ||
      y < snapshot_->plot.top || y > snapshot_->plot.bottom) {
    return;
  }
  extremum.visible = true;
  extremum.value = value;
  extremum.x = x;
  extremum.y = y;
  const float plot_center_x =
      (snapshot_->plot.left + snapshot_->plot.right) / 2.0f;
  extremum.label_on_right = x <= plot_center_x;
}

void RenderSnapshotBuilder::AddExtrema() {
  if (!input_.config.show_price_extremes) {
    return;
  }
  AddExtremum(snapshot_->visible_maximum, maximum_candle_,
              visible_maximum_value_);
  if (visible_minimum_value_ != visible_maximum_value_) {
    AddExtremum(snapshot_->visible_minimum, minimum_candle_,
                visible_minimum_value_);
  }
}

void RenderSnapshotBuilder::AddTicks() {
  const float scaled_x_tick_spacing =
      kXAxisTickSpacing * input_.config.display_scale;
  const int x_target = std::max(
      kMinimumAxisTickCount,
      static_cast<int>(snapshot_->plot.Width() / scaled_x_tick_spacing));
  if (input_.config.logical_spacing) {
    const double visible_span = input_.visible_x_max - input_.visible_x_min;
    const size_t index_step = std::max<size_t>(
        1, static_cast<size_t>(std::ceil(visible_span / x_target)));
    const double first_visible_index =
        std::max(0.0, std::ceil(input_.visible_x_min));
    size_t index = static_cast<size_t>(first_visible_index);
    const size_t remainder = index % index_step;
    if (remainder != 0) {
      index += index_step - remainder;
    }
    for (int i = 0; i < kMaxTickCount && index < input_.candles.size() &&
                    static_cast<double>(index) <= input_.visible_x_max;
         ++i, index += index_step) {
      snapshot_->x_ticks.push_back(AxisTick{
          input_.candles[index].timestamp,
          ProjectX(static_cast<double>(index)),
      });
    }
  } else {
    const double x_step =
        TimeStep(input_.visible_x_max - input_.visible_x_min, x_target);
    const double first_x = std::ceil(input_.visible_x_min / x_step) * x_step;
    for (int i = 0; i < kMaxTickCount; ++i) {
      const double value = first_x + static_cast<double>(i) * x_step;
      if (value > input_.visible_x_max + x_step * kTickBoundaryTolerance) {
        break;
      }
      snapshot_->x_ticks.push_back(AxisTick{value, ProjectX(value)});
    }
  }

  const int y_target = std::max(
      kMinimumAxisTickCount,
      static_cast<int>(snapshot_->plot.Height() /
                       (kYAxisTickSpacing * input_.config.display_scale)));
  const double y_step =
      NiceStep(y_max_ - y_min_, y_target, input_.config.min_move);
  const double first_y = std::ceil(y_min_ / y_step) * y_step;
  for (int i = 0; i < kMaxTickCount; ++i) {
    const double value = first_y + static_cast<double>(i) * y_step;
    if (value > y_max_ + y_step * kTickBoundaryTolerance) {
      break;
    }
    snapshot_->y_ticks.push_back(AxisTick{value, ProjectY(value)});
  }
  PaneSnapshot& main_pane = snapshot_->panes[kMainPaneIndex];
  main_pane.y_tick_offset = snapshot_->pane_y_ticks.size();
  snapshot_->pane_y_ticks.insert(snapshot_->pane_y_ticks.end(),
                                 snapshot_->y_ticks.begin(),
                                 snapshot_->y_ticks.end());
  main_pane.y_tick_count = snapshot_->y_ticks.size();

  for (size_t pane_index = 1; pane_index < snapshot_->panes.size();
       ++pane_index) {
    PaneSnapshot& pane = snapshot_->panes[pane_index];
    pane.y_tick_offset = snapshot_->pane_y_ticks.size();
    const PaneConfig& config = input_.panes[pane_index];
    const int target = std::max(
        kMinimumAxisTickCount,
        static_cast<int>(pane.plot.Height() /
                         (kYAxisTickSpacing * input_.config.display_scale)));
    double step = NiceStep(pane_y_max_[pane_index] - pane_y_min_[pane_index],
                           target, config.min_move);
    const float minimum_three_tick_height =
        static_cast<float>(kMinimumVolumeTickCount - 1) * kYAxisTickSpacing *
        input_.config.display_scale;
    if (config.volume_format &&
        pane.plot.Height() >= minimum_three_tick_height) {
      // NiceStep rounds upward and can leave only zero plus one useful
      // volume label. When three labels fit at the normal axis spacing,
      // walk down the same nice-step sequence until all three are present.
      step = EnsureMinimumNiceTickCount(
          pane_y_min_[pane_index], pane_y_max_[pane_index], step,
          config.min_move, kMinimumVolumeTickCount);
    }
    const double first = std::ceil(pane_y_min_[pane_index] / step) * step;
    for (int index = 0; index < kMaxTickCount; ++index) {
      const double value = first + static_cast<double>(index) * step;
      if (value > pane_y_max_[pane_index] + step * kTickBoundaryTolerance) {
        break;
      }
      const float position =
          pane.plot.bottom -
          static_cast<float>(
              (value - pane_y_min_[pane_index]) /
              (pane_y_max_[pane_index] - pane_y_min_[pane_index])) *
              pane.plot.Height();
      snapshot_->pane_y_ticks.push_back(AxisTick{value, position});
    }
    if (pane.rsi_scale || pane.williams_scale) {
      // Keep the generated 0...100 ticks; native overlays clip boundary
      // labels to their pane. Add each RSI series' configured levels without
      // duplicating their dashed grid geometry.
      for (const SeriesData& series : input_.additional_series) {
        if (!IsSeriesInPane(series, pane_index) ||
            !IsFixedOscillator(series.config.source)) {
          continue;
        }
        for (double value :
             {series.config.Oversold(), series.config.Overbought()}) {
          const auto begin = snapshot_->pane_y_ticks.begin() +
                             static_cast<std::ptrdiff_t>(pane.y_tick_offset);
          const bool exists = std::any_of(
              begin, snapshot_->pane_y_ticks.end(), [&](const AxisTick& tick) {
                return std::abs(tick.value - value) < kTickBoundaryTolerance;
              });
          if (!exists) {
            snapshot_->pane_y_ticks.push_back(
                AxisTick{value, ProjectPaneY(pane_index, value), false});
          }
        }
      }
      auto begin = snapshot_->pane_y_ticks.begin() +
                   static_cast<std::ptrdiff_t>(pane.y_tick_offset);
      std::sort(begin, snapshot_->pane_y_ticks.end(),
                [](const AxisTick& left, const AxisTick& right) {
                  return left.value < right.value;
                });
    }
    pane.y_tick_count = snapshot_->pane_y_ticks.size() - pane.y_tick_offset;
  }
}

}  // namespace trading_charts::internal
