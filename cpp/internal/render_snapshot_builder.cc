// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/render_snapshot_builder.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <limits>
#include <memory>
#include <numeric>
#include <string>
#include <utility>
#include <vector>

#include "cpp/internal/series_geometry.h"
#include "cpp/internal/trading_time.h"
#include "cpp/internal/triangle_geometry.h"

namespace trading_charts::internal {
namespace {

constexpr int kMaxTickCount = 256;
constexpr float kYAxisTickSpacing = 44.0f;
constexpr float kPaneSeparatorOpacityBoost = 0.2f;
constexpr int kMinimumVolumeTickCount = 3;

size_t SegmentCount(float start, float end, float step) {
  if (!(end > start) || !(step > 0.0f)) {
    return 0;
  }
  return static_cast<size_t>(std::ceil((end - start) / step));
}

void EmitDashedVertical(std::vector<float>& out, float x, float top,
                        float bottom, float display_scale, const Color& color) {
  const float dash = 4.0f * display_scale;
  const float gap = 3.0f * display_scale;
  float y = top;
  const size_t segment_count = SegmentCount(top, bottom, dash + gap);
  for (size_t segment = 0; segment < segment_count; ++segment) {
    AppendQuad(out, x - 0.5f, y, x + 0.5f, std::min(y + dash, bottom), color);
    y += dash + gap;
  }
}

void EmitDashedHorizontal(std::vector<float>& out, float y, float left,
                          float right, float display_scale,
                          const Color& color) {
  const float dash = 4.0f * display_scale;
  const float gap = 3.0f * display_scale;
  float x = left;
  const size_t segment_count = SegmentCount(left, right, dash + gap);
  for (size_t segment = 0; segment < segment_count; ++segment) {
    AppendQuad(out, x, y - 0.5f, std::min(x + dash, right), y + 0.5f, color);
    x += dash + gap;
  }
}

double NiceStep(double range, int target_count, double minimum) {
  if (!(range > 0.0) || target_count <= 0) {
    return std::max(minimum, 1.0);
  }
  const double raw =
      std::max(range / static_cast<double>(target_count), minimum);
  const double power = std::pow(10.0, std::floor(std::log10(raw)));
  const double fraction = raw / power;
  double nice = 10.0;
  if (fraction <= 1.0) {
    nice = 1.0;
  } else if (fraction <= 2.0) {
    nice = 2.0;
  } else if (fraction <= 2.5) {
    nice = 2.5;
  } else if (fraction <= 5.0) {
    nice = 5.0;
  }
  return std::max(nice * power, minimum);
}

double PreviousNiceStep(double step, double minimum) {
  if (!(step > minimum)) {
    return step;
  }
  const double upper_bound = std::nextafter(step, 0.0);
  const double power = std::pow(10.0, std::floor(std::log10(upper_bound)));
  const double fraction = upper_bound / power;
  double nice = 1.0;
  if (fraction >= 5.0) {
    nice = 5.0;
  } else if (fraction >= 2.5) {
    nice = 2.5;
  } else if (fraction >= 2.0) {
    nice = 2.0;
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
    if (value > maximum + step * 1e-9) {
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
  constexpr std::array<double, 19> kCandidates = {
      1000.0,
      5000.0,
      15000.0,
      30000.0,
      60000.0,
      5.0 * 60000.0,
      15.0 * 60000.0,
      30.0 * 60000.0,
      60.0 * 60000.0,
      4.0 * 60.0 * 60000.0,
      12.0 * 60.0 * 60000.0,
      24.0 * 60.0 * 60000.0,
      2.0 * 24.0 * 60.0 * 60000.0,
      7.0 * 24.0 * 60.0 * 60000.0,
      14.0 * 24.0 * 60.0 * 60000.0,
      30.0 * 24.0 * 60.0 * 60000.0,
      90.0 * 24.0 * 60.0 * 60000.0,
      180.0 * 24.0 * 60.0 * 60000.0,
      365.0 * 24.0 * 60.0 * 60000.0,
  };
  const double desired = span / static_cast<double>(std::max(target_count, 1));
  for (double candidate : kCandidates) {
    if (candidate >= desired) {
      return candidate;
    }
  }
  return NiceStep(span, target_count, 1.0);
}

Color WithAlpha(Color color, float value) {
  color.a *= value;
  return color;
}

// Visible index range [first, last) into a series' own data (or into the
// source candles of a derived volume series). Computed once per snapshot so
// that autoscale and geometry iterate only the visible window instead of
// scanning whole stores.
struct SeriesWindow {
  size_t first = 0;
  size_t last = 0;
};

// Both Candle and HistogramPoint expose a `timestamp` member.
template <typename Timestamped>
size_t LowerTimestampBound(const std::vector<Timestamped>& values,
                           double timestamp) {
  return static_cast<size_t>(std::distance(
      values.begin(),
      std::lower_bound(values.begin(), values.end(), timestamp,
                       [](const Timestamped& value, double bound) {
                         return value.timestamp < bound;
                       })));
}

template <typename Timestamped>
size_t UpperTimestampBound(const std::vector<Timestamped>& values,
                           double timestamp) {
  return static_cast<size_t>(std::distance(
      values.begin(),
      std::upper_bound(values.begin(), values.end(), timestamp,
                       [](double bound, const Timestamped& value) {
                         return bound < value.timestamp;
                       })));
}

class RenderSnapshotBuilder {
 public:
  explicit RenderSnapshotBuilder(const SnapshotBuildInput& input)
      : input_(input),
        snapshot_(std::make_shared<RenderSnapshot>()),
        content_vertices_(std::make_shared<std::vector<float>>()),
        lower_(input.candles.begin()),
        upper_(input.candles.end()),
        minimum_candle_(input.candles.begin()),
        maximum_candle_(input.candles.begin()) {}

  std::shared_ptr<const RenderSnapshot> Build() {
    if (ReuseContent()) {
      return snapshot_;
    }
    InitializeSnapshot();
    if (!HasDrawableContent()) {
      return snapshot_;
    }

    FindVisibleRange();
    SetVisibleRangeMetadata();
    ComputeSeriesWindows();
    CalculateYRange();
    CalculateAdditionalPaneRanges();
    BuildRsiLegends();
    AddExtrema();
    AddTicks();
    ReserveGeometry();
    AddRsiBackgroundGeometry();
    AddGridGeometry();
    AddSeriesGeometry();
    AddAdditionalSeriesGeometry();
    AddPaneSeparators();
    AddCurrentPriceGeometry();
    snapshot_->content_vertices = std::move(content_vertices_);
    AddCrosshair();
    return snapshot_;
  }

 private:
  using CandleIterator = std::vector<Candle>::const_iterator;

  // Content geometry changes only with content_revision. When the previous
  // snapshot was built from the same content, copy it (the vertex buffer
  // itself is shared, never copied) and rebuild only the crosshair overlay.
  bool ReuseContent() {
    const std::shared_ptr<const RenderSnapshot>& previous = input_.previous;
    if (!previous || previous->content_revision != input_.content_revision ||
        !previous->content_vertices) {
      return false;
    }
    *snapshot_ = *previous;
    snapshot_->revision = input_.revision;
    snapshot_->overlay_vertices.clear();
    // Reset crosshair-derived fields; AddCrosshair repopulates them when the
    // crosshair is active.
    snapshot_->crosshair_visible = false;
    snapshot_->crosshair_price = 0.0;
    snapshot_->crosshair_x = 0.0f;
    snapshot_->crosshair_y = 0.0f;
    snapshot_->selected_candle = Candle{};
    snapshot_->selected_change = 0.0;
    snapshot_->selected_change_percent = 0.0;
    snapshot_->selected_amplitude_percent = 0.0;
    snapshot_->selected_percentages_valid = false;
    snapshot_->active_pane_index = 0;
    for (RsiLegend& legend : snapshot_->rsi_legends) {
      legend.value = legend.latest_value;
      legend.has_value = legend.has_latest_value;
    }
    pane_y_min_.clear();
    pane_y_max_.clear();
    pane_y_min_.reserve(snapshot_->panes.size());
    pane_y_max_.reserve(snapshot_->panes.size());
    for (const PaneSnapshot& pane : snapshot_->panes) {
      pane_y_min_.push_back(pane.visible_y_min);
      pane_y_max_.push_back(pane.visible_y_max);
    }
    AddCrosshair();
    return true;
  }

  void InitializeSnapshot() {
    snapshot_->revision = input_.revision;
    snapshot_->content_revision = input_.content_revision;
    snapshot_->width = input_.width;
    snapshot_->height = input_.height;
    snapshot_->config = input_.config;
    snapshot_->visible_x_min = input_.visible_x_min;
    snapshot_->visible_x_max = input_.visible_x_max;
    const double visible_x_span = input_.visible_x_max - input_.visible_x_min;
    snapshot_->horizontal_scale =
        input_.viewport_initialized && visible_x_span > 0.0
            ? input_.horizontal_scale_base_span / visible_x_span
            : 1.0;
    snapshot_->total_candle_count = input_.candles.size();
    snapshot_->y_axis_scale = 1.0 / input_.y_range_multiplier;

    const std::vector<Rect> pane_rects = ComputePaneRects(
        input_.config, input_.panes, input_.width, input_.height);
    const size_t pane_count = pane_rects.size();
    snapshot_->panes.reserve(pane_count);
    for (size_t index = 0; index < pane_count; ++index) {
      const PaneConfig& pane = PaneConfigAt(input_.panes, index);
      PaneSnapshot pane_snapshot;
      pane_snapshot.pane_id = pane.pane_id;
      pane_snapshot.price_scale_id = pane.price_scale_id;
      pane_snapshot.plot = pane_rects[index];
      pane_snapshot.height_weight = pane.height_weight;
      pane_snapshot.scale_visible = pane.scale_visible;
      pane_snapshot.volume_format = pane.volume_format;
      pane_snapshot.rsi_scale = std::any_of(
          input_.additional_series.begin(), input_.additional_series.end(),
          [&](const SeriesData& series) {
            return series.pane_index == index &&
                   series.config.source == SeriesSource::kOhlcvRsi;
          });
      pane_snapshot.precision = pane.precision;
      snapshot_->panes.push_back(std::move(pane_snapshot));
    }
    snapshot_->plot = snapshot_->panes.front().plot;
    pane_y_min_.assign(pane_count, 0.0);
    pane_y_max_.assign(pane_count, 1.0);
  }

  bool HasDrawableContent() {
    if (snapshot_->plot.Width() >= 1.0f && snapshot_->plot.Height() >= 1.0f &&
        !input_.candles.empty()) {
      return true;
    }
    snapshot_->visible_y_min = 0.0;
    snapshot_->visible_y_max = 1.0;
    return false;
  }

  void FindVisibleRange() {
    if (input_.config.logical_spacing) {
      const double last_index = static_cast<double>(input_.candles.size() - 1);
      const size_t lower_index = static_cast<size_t>(
          std::max(0.0, std::min(last_index, std::ceil(input_.visible_x_min))));
      const size_t upper_index =
          static_cast<size_t>(std::max(
              0.0, std::min(last_index, std::floor(input_.visible_x_max)))) +
          1;
      lower_ =
          input_.candles.begin() + static_cast<std::ptrdiff_t>(lower_index);
      upper_ =
          input_.candles.begin() + static_cast<std::ptrdiff_t>(upper_index);
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

  void SetVisibleRangeMetadata() {
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

  void CalculateYRange() {
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
      const double extend_value = 5.0 * input_.config.min_move;
      raw_min -= extend_value;
      raw_max += extend_value;
    }
    if (!(raw_max > raw_min)) {
      raw_min =
          std::nextafter(raw_min, -std::numeric_limits<double>::infinity());
      raw_max =
          std::nextafter(raw_max, std::numeric_limits<double>::infinity());
    }

    const double raw_range = raw_max - raw_min;
    const double inner_scale = 1.0 - input_.config.y_scale_margin_top -
                               input_.config.y_scale_margin_bottom;
    const double auto_y_min =
        raw_min - raw_range * input_.config.y_scale_margin_bottom / inner_scale;
    const double auto_y_max =
        raw_max + raw_range * input_.config.y_scale_margin_top / inner_scale;
    const double y_center = auto_y_min + (auto_y_max - auto_y_min) * 0.5;
    const double y_range =
        (auto_y_max - auto_y_min) * input_.y_range_multiplier;
    y_min_ = y_center - y_range * 0.5;
    y_max_ = y_center + y_range * 0.5;
    snapshot_->visible_y_min = y_min_;
    snapshot_->visible_y_max = y_max_;
    pane_y_min_[0] = y_min_;
    pane_y_max_[0] = y_max_;
    snapshot_->panes[0].visible_y_min = y_min_;
    snapshot_->panes[0].visible_y_max = y_max_;
    snapshot_->panes[0].y_axis_scale = snapshot_->y_axis_scale;
  }

  std::optional<size_t> MainIndexForTimestamp(double timestamp) const {
    auto found =
        std::lower_bound(input_.candles.begin(), input_.candles.end(),
                         timestamp, [](const Candle& candle, double value) {
                           return candle.timestamp < value;
                         });
    if (found == input_.candles.end() || found->timestamp != timestamp) {
      return std::nullopt;
    }
    return static_cast<size_t>(std::distance(input_.candles.begin(), found));
  }

  float ProjectTimestamp(double timestamp, const Rect& plot) const {
    double domain = timestamp;
    if (input_.config.logical_spacing) {
      const std::optional<size_t> index = MainIndexForTimestamp(timestamp);
      if (!index.has_value()) {
        return std::numeric_limits<float>::quiet_NaN();
      }
      domain = static_cast<double>(*index);
    }
    return plot.left +
           static_cast<float>((domain - input_.visible_x_min) /
                              (input_.visible_x_max - input_.visible_x_min)) *
               plot.Width();
  }

  const std::vector<Candle>* SourceCandles(const SeriesData& series) const {
    if (series.source_series_index == kMainSeriesStateIndex) {
      return &input_.candles;
    }
    return series.source_series_index < input_.additional_series.size()
               ? &input_.additional_series[series.source_series_index].candles
               : nullptr;
  }

  // Computes the visible data window of every additional series once per
  // snapshot. In time mode the bounds are the visible timestamps; in logical
  // mode they are the timestamps bracketing the visible main candles, so a
  // pair of binary searches per series replaces a full store scan.
  void ComputeSeriesWindows() {
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

  // Returns true when `timestamp` exactly matches a visible main candle,
  // advancing `cursor` monotonically. Requires samples iterated in ascending
  // timestamp order; amortized O(1) per sample.
  bool VisibleMainTimestamp(double timestamp, size_t& cursor) const {
    const size_t last = snapshot_->last_visible_index;
    while (cursor <= last && input_.candles[cursor].timestamp < timestamp) {
      ++cursor;
    }
    return cursor <= last && input_.candles[cursor].timestamp == timestamp;
  }

  // Calls `callback(const Timestamped&)` for every visible sample of
  // `values` inside `window`. In logical mode samples that do not match a
  // visible main candle are skipped, mirroring the x projection, which maps
  // them to NaN. `filter_main` must be false for windows taken directly from
  // the main store, where membership holds by construction.
  template <typename Timestamped, typename Callback>
  void VisitVisibleSeriesSamples(const SeriesWindow& window,
                                 const std::vector<Timestamped>& values,
                                 bool filter_main, Callback&& callback) const {
    size_t cursor = snapshot_->first_visible_index;
    for (size_t index = window.first; index < window.last; ++index) {
      const Timestamped& sample = values[index];
      if (filter_main && !VisibleMainTimestamp(sample.timestamp, cursor)) {
        continue;
      }
      callback(sample);
    }
  }

  // Iterates the candle-like data of a series: its own candles, or the
  // source candles of a derived volume series.
  template <typename Callback>
  void VisitVisibleSeriesCandles(size_t series_index,
                                 Callback&& callback) const {
    const SeriesData& series = input_.additional_series[series_index];
    const SeriesWindow& window = series_windows_[series_index];
    const bool logical = input_.config.logical_spacing;
    if (series.config.type == SeriesType::kHistogram &&
        series.config.source == SeriesSource::kOhlcvVolume) {
      const std::vector<Candle>* source = SourceCandles(series);
      if (source == nullptr) {
        return;
      }
      VisitVisibleSeriesSamples(window, *source,
                                logical && source != &input_.candles,
                                std::forward<Callback>(callback));
      return;
    }
    if (series.config.type == SeriesType::kHistogram) {
      return;
    }
    VisitVisibleSeriesSamples(window, series.candles, logical,
                              std::forward<Callback>(callback));
  }

  template <typename Callback>
  void VisitLineGapAnchors(const SeriesData& series, const SeriesWindow& window,
                           Callback&& callback) const {
    if (!IsLineLikeSeries(series.config.type) || window.first != window.last ||
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

  void IncludeAdditionalSeriesRange(size_t pane_index, double& minimum,
                                    double& maximum) const {
    for (size_t index = 0; index < input_.additional_series.size(); ++index) {
      const SeriesData& series = input_.additional_series[index];
      if (!series.config.visible || series.pane_index != pane_index) {
        continue;
      }
      const SeriesWindow& window = series_windows_[index];
      if (series.config.type == SeriesType::kHistogram) {
        minimum = std::min(minimum, 0.0);
        if (series.config.source == SeriesSource::kOhlcvVolume) {
          VisitVisibleSeriesCandles(index, [&](const Candle& candle) {
            maximum = std::max(maximum, candle.volume);
          });
        } else {
          VisitVisibleSeriesSamples(window, series.histogram,
                                    input_.config.logical_spacing,
                                    [&](const HistogramPoint& point) {
                                      minimum = std::min(minimum, point.value);
                                      maximum = std::max(maximum, point.value);
                                    });
        }
      } else {
        const auto include_candle = [&](const Candle& candle) {
          if (IsLineLikeSeries(series.config.type)) {
            const double value = CandleValue(candle, series.config.line_source);
            minimum = std::min(minimum, value);
            maximum = std::max(maximum, value);
          } else {
            minimum = std::min(minimum, candle.low);
            maximum = std::max(maximum, candle.high);
          }
        };
        VisitVisibleSeriesSamples(window, series.candles,
                                  input_.config.logical_spacing,
                                  include_candle);
        VisitLineGapAnchors(series, window, include_candle);
      }
    }
  }

  void CalculateAdditionalPaneRanges() {
    for (size_t pane_index = 1; pane_index < snapshot_->panes.size();
         ++pane_index) {
      if (snapshot_->panes[pane_index].rsi_scale) {
        pane_y_min_[pane_index] = 0.0;
        pane_y_max_[pane_index] = 100.0;
        snapshot_->panes[pane_index].visible_y_min = 0.0;
        snapshot_->panes[pane_index].visible_y_max = 100.0;
        snapshot_->panes[pane_index].y_axis_scale = 1.0;
        continue;
      }
      bool has_value = false;
      double raw_min = std::numeric_limits<double>::infinity();
      double raw_max = -std::numeric_limits<double>::infinity();
      for (size_t index = 0; index < input_.additional_series.size(); ++index) {
        const SeriesData& series = input_.additional_series[index];
        if (!series.config.visible || series.pane_index != pane_index) {
          continue;
        }
        const SeriesWindow& window = series_windows_[index];
        if (series.config.type == SeriesType::kHistogram) {
          if (series.config.source == SeriesSource::kOhlcvVolume) {
            VisitVisibleSeriesCandles(index, [&](const Candle& candle) {
              has_value = true;
              raw_min = std::min(raw_min, 0.0);
              raw_max = std::max(raw_max, candle.volume);
            });
          } else {
            VisitVisibleSeriesSamples(
                window, series.histogram, input_.config.logical_spacing,
                [&](const HistogramPoint& point) {
                  has_value = true;
                  raw_min = std::min({raw_min, 0.0, point.value});
                  raw_max = std::max(raw_max, point.value);
                });
          }
        } else {
          const auto include_candle = [&](const Candle& candle) {
            has_value = true;
            if (IsLineLikeSeries(series.config.type)) {
              const double value =
                  CandleValue(candle, series.config.line_source);
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
      const PaneConfig& pane = PaneConfigAt(input_.panes, pane_index);
      if (!has_value) {
        raw_min = 0.0;
        raw_max = pane.volume_format ? 1.0 : pane.min_move * 10.0;
      }
      if (!(raw_max > raw_min)) {
        raw_max = raw_min + std::max(pane.min_move * 5.0, 1.0);
      }
      const double inner =
          1.0 - pane.scale_margin_top - pane.scale_margin_bottom;
      const double raw_range = raw_max - raw_min;
      const double auto_min =
          raw_min - raw_range * pane.scale_margin_bottom / inner;
      const double auto_max =
          raw_max + raw_range * pane.scale_margin_top / inner;
      const double center = (auto_min + auto_max) * 0.5;
      const double range = (auto_max - auto_min) * pane.y_range_multiplier;
      pane_y_min_[pane_index] = center - range * 0.5;
      pane_y_max_[pane_index] = center + range * 0.5;
      snapshot_->panes[pane_index].visible_y_min = pane_y_min_[pane_index];
      snapshot_->panes[pane_index].visible_y_max = pane_y_max_[pane_index];
      snapshot_->panes[pane_index].y_axis_scale = 1.0 / pane.y_range_multiplier;
    }
  }

  double CandleX(size_t index) const {
    return input_.config.logical_spacing ? static_cast<double>(index)
                                         : input_.candles[index].timestamp;
  }

  float ProjectX(double value) const {
    return snapshot_->plot.left +
           static_cast<float>((value - input_.visible_x_min) /
                              (input_.visible_x_max - input_.visible_x_min)) *
               snapshot_->plot.Width();
  }

  float ProjectY(double value) const {
    return snapshot_->plot.bottom -
           static_cast<float>((value - y_min_) / (y_max_ - y_min_)) *
               snapshot_->plot.Height();
  }

  void AddExtremum(PriceExtremum& extremum, CandleIterator candle,
                   double value) {
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
    extremum.label_on_right =
        x <= (snapshot_->plot.left + snapshot_->plot.right) * 0.5f;
  }

  void AddExtrema() {
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

  void AddTicks() {
    const int x_target =
        std::max(2, static_cast<int>(snapshot_->plot.Width() /
                                     (72.0f * input_.config.display_scale)));
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
        if (value > input_.visible_x_max + x_step * 1e-9) {
          break;
        }
        snapshot_->x_ticks.push_back(AxisTick{value, ProjectX(value)});
      }
    }

    const int y_target = std::max(
        2, static_cast<int>(snapshot_->plot.Height() /
                            (kYAxisTickSpacing * input_.config.display_scale)));
    const double y_step =
        NiceStep(y_max_ - y_min_, y_target, input_.config.min_move);
    const double first_y = std::ceil(y_min_ / y_step) * y_step;
    for (int i = 0; i < kMaxTickCount; ++i) {
      const double value = first_y + static_cast<double>(i) * y_step;
      if (value > y_max_ + y_step * 1e-9) {
        break;
      }
      snapshot_->y_ticks.push_back(AxisTick{value, ProjectY(value)});
    }
    snapshot_->panes[0].y_tick_offset = snapshot_->pane_y_ticks.size();
    snapshot_->pane_y_ticks.insert(snapshot_->pane_y_ticks.end(),
                                   snapshot_->y_ticks.begin(),
                                   snapshot_->y_ticks.end());
    snapshot_->panes[0].y_tick_count = snapshot_->y_ticks.size();

    for (size_t pane_index = 1; pane_index < snapshot_->panes.size();
         ++pane_index) {
      PaneSnapshot& pane = snapshot_->panes[pane_index];
      pane.y_tick_offset = snapshot_->pane_y_ticks.size();
      const PaneConfig& config = PaneConfigAt(input_.panes, pane_index);
      const int target = std::max(
          2,
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
        if (value > pane_y_max_[pane_index] + step * 1e-9) {
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
      if (pane.rsi_scale) {
        // Keep the generated 0...100 ticks, including boundary labels that
        // extend into neighboring panes, and add each RSI series' configured
        // levels without duplicating their dashed grid geometry.
        for (const SeriesData& series : input_.additional_series) {
          if (series.pane_index != pane_index ||
              series.config.source != SeriesSource::kOhlcvRsi) {
            continue;
          }
          for (double value :
               {series.config.rsi_oversold, series.config.rsi_overbought}) {
            const auto begin = snapshot_->pane_y_ticks.begin() +
                               static_cast<std::ptrdiff_t>(pane.y_tick_offset);
            const bool exists =
                std::any_of(begin, snapshot_->pane_y_ticks.end(),
                            [&](const AxisTick& tick) {
                              return std::abs(tick.value - value) < 1e-9;
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
                  [](const AxisTick& first, const AxisTick& second) {
                    return first.value < second.value;
                  });
      }
      pane.y_tick_count = snapshot_->pane_y_ticks.size() - pane.y_tick_offset;
    }
  }

  void ReserveGeometry() {
    const SeriesGeometryInput series_input = BuildSeriesGeometryInput();
    size_t float_count =
        (snapshot_->x_ticks.size() + snapshot_->pane_y_ticks.size()) *
            kFloatsPerQuad +
        SeriesGeometryFloatCapacity(series_input);
    // Pane separators.
    float_count += snapshot_->panes.size() * kFloatsPerQuad;
    // Current price dashed line.
    if (input_.config.show_current_price) {
      float_count += SegmentCount(snapshot_->plot.left, snapshot_->plot.right,
                                  6.0f * input_.config.display_scale) *
                     kFloatsPerQuad;
    }
    for (size_t index = 0; index < input_.additional_series.size(); ++index) {
      const SeriesData& series = input_.additional_series[index];
      if (!series.config.visible ||
          series.pane_index >= snapshot_->panes.size()) {
        continue;
      }
      const SeriesWindow& window = series_windows_[index];
      if (series.config.source == SeriesSource::kOhlcvRsi) {
        const Rect& pane_plot = snapshot_->panes[series.pane_index].plot;
        const float step = 7.0f * input_.config.display_scale;
        float_count +=
            (1 + 2 * SegmentCount(pane_plot.left, pane_plot.right, step)) *
            kFloatsPerQuad;
      }
      if (series.config.type == SeriesType::kHistogram) {
        float_count += (window.last - window.first) * kFloatsPerQuad;
        continue;
      }
      ChartConfig config = input_.config;
      config.series_type = series.config.type;
      config.bar_line_width = series.config.line_width;
      config.line_width = series.config.line_width;
      size_t first = window.first;
      size_t last = window.last;
      if (IsLineLikeSeries(series.config.type)) {
        if (first > 0) {
          --first;
        }
        if (last < series.candles.size()) {
          ++last;
        }
      }
      float_count += SeriesGeometryFloatCapacity(SeriesGeometryInput{
          config,
          series.candles,
          first,
          last,
          snapshot_->panes[series.pane_index].plot,
          input_.visible_x_min,
          input_.visible_x_max,
          pane_y_min_[series.pane_index],
          pane_y_max_[series.pane_index],
          input_.config.logical_spacing ? &input_.candles : nullptr,
      });
    }
    content_vertices_->reserve(float_count);

    size_t overlay_float_count = 0;
    if (input_.crosshair_active && input_.config.crosshair_enabled) {
      if (input_.config.crosshair_dashed) {
        const float dash_step = 7.0f * input_.config.display_scale;
        overlay_float_count =
            (SegmentCount(snapshot_->panes.front().plot.top,
                          snapshot_->panes.back().plot.bottom, dash_step) +
             SegmentCount(snapshot_->plot.left, snapshot_->plot.right,
                          dash_step)) *
            kFloatsPerQuad;
      } else {
        overlay_float_count = 2 * kFloatsPerQuad;
      }
    }
    snapshot_->overlay_vertices.reserve(overlay_float_count);
  }

  void AddGridGeometry() {
    const Color grid =
        WithAlpha(input_.config.grid, input_.config.grid_opacity);
    for (const AxisTick& tick : snapshot_->x_ticks) {
      AppendQuad(*content_vertices_, tick.position - 0.5f,
                 snapshot_->panes.front().plot.top, tick.position + 0.5f,
                 snapshot_->panes.back().plot.bottom, grid);
    }
    for (const PaneSnapshot& pane : snapshot_->panes) {
      for (size_t index = 0; index < pane.y_tick_count; ++index) {
        const AxisTick& tick =
            snapshot_->pane_y_ticks[pane.y_tick_offset + index];
        if (tick.grid_visible) {
          AppendQuad(*content_vertices_, pane.plot.left, tick.position - 0.5f,
                     pane.plot.right, tick.position + 0.5f, grid);
        }
      }
    }
  }

  void AddRsiBackgroundGeometry() {
    for (const SeriesData& series : input_.additional_series) {
      if (!series.config.visible ||
          series.config.source != SeriesSource::kOhlcvRsi ||
          series.pane_index >= snapshot_->panes.size()) {
        continue;
      }
      const size_t pane_index = series.pane_index;
      const Rect& plot = snapshot_->panes[pane_index].plot;
      const float overbought_y =
          ProjectPaneY(pane_index, series.config.rsi_overbought);
      const float oversold_y =
          ProjectPaneY(pane_index, series.config.rsi_oversold);
      AppendClippedQuad(*content_vertices_, plot.left, overbought_y, plot.right,
                        oversold_y, plot, series.config.rsi_band);
      EmitDashedHorizontal(*content_vertices_, overbought_y, plot.left,
                           plot.right, input_.config.display_scale,
                           series.config.rsi_level_line);
      EmitDashedHorizontal(*content_vertices_, oversold_y, plot.left,
                           plot.right, input_.config.display_scale,
                           series.config.rsi_level_line);
    }
  }

  SeriesGeometryInput BuildSeriesGeometryInput() const {
    size_t first =
        static_cast<size_t>(std::distance(input_.candles.cbegin(), lower_));
    size_t end =
        static_cast<size_t>(std::distance(input_.candles.cbegin(), upper_));
    if (IsLineLikeSeries(input_.config.series_type)) {
      if (first > 0) {
        --first;
      }
      if (end < input_.candles.size()) {
        ++end;
      }
    }
    return SeriesGeometryInput{
        input_.config,
        input_.candles,
        first,
        end,
        snapshot_->plot,
        input_.visible_x_min,
        input_.visible_x_max,
        y_min_,
        y_max_,
    };
  }

  void AddSeriesGeometry() {
    AppendSeriesGeometry(BuildSeriesGeometryInput(), *content_vertices_);
  }

  float ProjectPaneY(size_t pane_index, double value) const {
    const Rect& plot = snapshot_->panes[pane_index].plot;
    return plot.bottom - static_cast<float>((value - pane_y_min_[pane_index]) /
                                            (pane_y_max_[pane_index] -
                                             pane_y_min_[pane_index])) *
                             plot.Height();
  }

  void AddHistogramBar(size_t pane_index, double timestamp, double value,
                       const Color& color) {
    const Rect& plot = snapshot_->panes[pane_index].plot;
    const float x = ProjectTimestamp(timestamp, plot);
    if (!std::isfinite(x)) {
      return;
    }
    const double domain_span = input_.visible_x_max - input_.visible_x_min;
    const double slot_domain =
        input_.config.logical_spacing
            ? 1.0
            : NominalResolutionMilliseconds(input_.config.resolution);
    const float slot_width =
        static_cast<float>(slot_domain / domain_span) * plot.Width();
    const float width = std::clamp(slot_width * 0.7f, 1.0f, 28.0f);
    if (x + width * 0.5f < plot.left || x - width * 0.5f > plot.right) {
      return;
    }
    const float zero_y =
        std::clamp(ProjectPaneY(pane_index, 0.0), plot.top, plot.bottom);
    const float value_y =
        std::clamp(ProjectPaneY(pane_index, value), plot.top, plot.bottom);
    float top = std::min(zero_y, value_y);
    float bottom = std::max(zero_y, value_y);
    if (bottom - top < 1.0f) {
      top = std::max(plot.top, bottom - 1.0f);
    }
    AppendClippedQuad(*content_vertices_, x - width * 0.5f, top,
                      x + width * 0.5f, bottom, plot, color);
  }

  void AddAdditionalSeriesGeometry() {
    for (size_t index = 0; index < input_.additional_series.size(); ++index) {
      const SeriesData& series = input_.additional_series[index];
      if (!series.config.visible) {
        continue;
      }
      const size_t pane_index = series.pane_index;
      if (pane_index >= snapshot_->panes.size()) {
        continue;
      }
      const SeriesWindow& window = series_windows_[index];
      if (series.config.type == SeriesType::kHistogram) {
        if (series.config.source == SeriesSource::kOhlcvVolume) {
          VisitVisibleSeriesCandles(index, [&](const Candle& candle) {
            AddHistogramBar(pane_index, candle.timestamp, candle.volume,
                            candle.close >= candle.open ? series.config.up
                                                        : series.config.down);
          });
        } else {
          VisitVisibleSeriesSamples(
              window, series.histogram, input_.config.logical_spacing,
              [&](const HistogramPoint& point) {
                AddHistogramBar(pane_index, point.timestamp, point.value,
                                series.config.color);
              });
        }
        continue;
      }
      if (series.candles.empty() || (window.first >= window.last &&
                                     !IsLineLikeSeries(series.config.type))) {
        continue;
      }
      ChartConfig config = input_.config;
      config.series_type = series.config.type;
      config.up = series.config.up;
      config.down = series.config.down;
      config.bar_line_width = series.config.line_width;
      config.line_width = series.config.line_width;
      config.line = series.config.color;
      config.line_gradient_top = series.config.line_gradient_top;
      config.line_gradient_bottom = series.config.line_gradient_bottom;
      config.line_gradient_enabled = series.config.line_gradient_enabled;
      config.area_fill_top = series.config.area_fill_top;
      config.area_fill_bottom = series.config.area_fill_bottom;
      config.line_source = series.config.line_source;
      config.line_gap_threshold_ms = series.config.line_gap_threshold_ms;
      size_t first = window.first;
      size_t last = window.last;
      if (IsLineLikeSeries(series.config.type)) {
        if (first > 0) {
          --first;
        }
        if (last < series.candles.size()) {
          ++last;
        }
      }
      AppendSeriesGeometry(
          SeriesGeometryInput{
              config,
              series.candles,
              first,
              last,
              snapshot_->panes[pane_index].plot,
              input_.visible_x_min,
              input_.visible_x_max,
              pane_y_min_[pane_index],
              pane_y_max_[pane_index],
              input_.config.logical_spacing ? &input_.candles : nullptr,
          },
          *content_vertices_);
    }
  }

  void AddPaneSeparators() {
    if (snapshot_->panes.size() < 2) {
      return;
    }
    const Color color = WithAlpha(
        input_.config.grid, std::min(1.0f, input_.config.grid_opacity +
                                               kPaneSeparatorOpacityBoost));
    for (size_t index = 0; index + 1 < snapshot_->panes.size(); ++index) {
      const float y = snapshot_->panes[index].plot.bottom +
                      input_.config.display_scale * 0.5f;
      AppendQuad(*content_vertices_, snapshot_->panes[index].plot.left,
                 y - input_.config.display_scale * 0.5f,
                 snapshot_->panes[index].plot.right,
                 y + input_.config.display_scale * 0.5f, color);
    }
  }

  void AddCurrentPriceGeometry() {
    const Candle& current = input_.candles.back();
    if (!input_.config.show_current_price) {
      return;
    }

    const double current_value =
        IsLineLikeSeries(input_.config.series_type)
            ? CandleValue(current, input_.config.line_source)
            : current.close;
    snapshot_->current_price = current_value;
    const bool current_price_up = current.close >= current.open;
    snapshot_->current_price_color =
        current_price_up ? input_.config.current_price_line_up
                         : input_.config.current_price_line_down;
    snapshot_->current_price_label_color =
        current_price_up ? input_.config.current_price_label_up
                         : input_.config.current_price_label_down;

    const bool price_in_range =
        current_value >= y_min_ && current_value <= y_max_;
    if (price_in_range || input_.config.pin_current_price_to_edge) {
      snapshot_->current_price_visible = true;
      snapshot_->current_price_y = current_value > y_max_ ? snapshot_->plot.top
                                   : current_value < y_min_
                                       ? snapshot_->plot.bottom
                                       : ProjectY(current_value);
    }
    if (price_in_range) {
      const float dash = 3.0f * input_.config.display_scale;
      const float gap = 3.0f * input_.config.display_scale;
      float x = snapshot_->plot.left;
      const size_t segment_count =
          SegmentCount(snapshot_->plot.left, snapshot_->plot.right, dash + gap);
      for (size_t segment = 0; segment < segment_count; ++segment) {
        AppendQuad(*content_vertices_, x, snapshot_->current_price_y - 0.5f,
                   std::min(x + dash, snapshot_->plot.right),
                   snapshot_->current_price_y + 0.5f,
                   snapshot_->current_price_color);
        x += dash + gap;
      }
    }
  }

  void BuildRsiLegends() {
    snapshot_->rsi_legends.clear();
    for (const SeriesData& series : input_.additional_series) {
      if (!series.config.visible ||
          series.config.source != SeriesSource::kOhlcvRsi ||
          series.pane_index >= snapshot_->panes.size()) {
        continue;
      }
      RsiLegend legend;
      legend.pane_id = series.config.pane_id;
      legend.pane_index = series.pane_index;
      legend.period = series.config.rsi_period;
      legend.text_color = series.config.rsi_text_color;
      legend.value_color = series.config.color;
      legend.text_color_set = series.config.rsi_text_color_set;
      if (!series.candles.empty()) {
        legend.latest_value = series.candles.back().close;
        legend.value = legend.latest_value;
        legend.has_latest_value = true;
        legend.has_value = true;
      }
      snapshot_->rsi_legends.push_back(std::move(legend));
    }
  }

  void SelectRsiLegendValues(double timestamp) {
    size_t legend_index = 0;
    for (const SeriesData& series : input_.additional_series) {
      if (!series.config.visible ||
          series.config.source != SeriesSource::kOhlcvRsi ||
          series.pane_index >= snapshot_->panes.size()) {
        continue;
      }
      RsiLegend& legend = snapshot_->rsi_legends[legend_index++];
      const auto point =
          std::lower_bound(series.candles.begin(), series.candles.end(),
                           timestamp, [](const Candle& candle, double value) {
                             return candle.timestamp < value;
                           });
      if (point != series.candles.end() && point->timestamp == timestamp) {
        legend.value = point->close;
        legend.has_value = true;
      } else {
        legend.value = 0.0;
        legend.has_value = false;
      }
    }
  }

  void AddCrosshair() {
    if (!input_.crosshair_active || !input_.config.crosshair_enabled) {
      return;
    }

    const float touch_x = std::clamp(
        input_.crosshair_touch_x, snapshot_->plot.left, snapshot_->plot.right);
    size_t active_pane = snapshot_->panes.size() - 1;
    for (size_t index = 0; index < snapshot_->panes.size(); ++index) {
      if (input_.crosshair_touch_y <= snapshot_->panes[index].plot.bottom) {
        active_pane = index;
        break;
      }
    }
    snapshot_->active_pane_index = active_pane;
    const Rect& active_plot = snapshot_->panes[active_pane].plot;
    const float touch_y = std::clamp(input_.crosshair_touch_y, active_plot.top,
                                     active_plot.bottom);
    const double touch_x_domain =
        input_.visible_x_min +
        static_cast<double>((touch_x - snapshot_->plot.left) /
                            snapshot_->plot.Width()) *
            (input_.visible_x_max - input_.visible_x_min);
    auto nearest = input_.candles.begin();
    size_t nearest_index = 0;
    if (input_.config.logical_spacing) {
      nearest_index = static_cast<size_t>(
          std::max(0.0, std::min(static_cast<double>(input_.candles.size() - 1),
                                 std::round(touch_x_domain))));
      nearest =
          input_.candles.begin() + static_cast<std::ptrdiff_t>(nearest_index);
    } else {
      nearest = std::lower_bound(input_.candles.begin(), input_.candles.end(),
                                 touch_x_domain,
                                 [](const Candle& candle, double value) {
                                   return candle.timestamp < value;
                                 });
      if (nearest == input_.candles.end()) {
        nearest = input_.candles.end() - 1;
      }
      if (nearest != input_.candles.begin()) {
        const auto previous = nearest - 1;
        if (touch_x_domain - previous->timestamp <
            nearest->timestamp - touch_x_domain) {
          nearest = previous;
        }
      }
      nearest_index =
          static_cast<size_t>(std::distance(input_.candles.begin(), nearest));
    }

    snapshot_->crosshair_visible = true;
    snapshot_->selected_candle = *nearest;
    SelectRsiLegendValues(nearest->timestamp);
    snapshot_->crosshair_x =
        std::clamp(ProjectX(CandleX(nearest_index)), snapshot_->plot.left,
                   snapshot_->plot.right);
    snapshot_->crosshair_y = touch_y;
    snapshot_->crosshair_price =
        pane_y_max_[active_pane] -
        static_cast<double>((touch_y - active_plot.top) /
                            active_plot.Height()) *
            (pane_y_max_[active_pane] - pane_y_min_[active_pane]);
    snapshot_->selected_change = nearest->close - nearest->open;
    if (nearest->open != 0.0) {
      const double denominator = std::abs(nearest->open);
      snapshot_->selected_change_percent =
          snapshot_->selected_change / denominator * 100.0;
      snapshot_->selected_amplitude_percent =
          (nearest->high - nearest->low) / denominator * 100.0;
      snapshot_->selected_percentages_valid = true;
    }

    const Color line_color =
        WithAlpha(input_.config.crosshair, input_.config.crosshair_opacity);
    if (input_.config.crosshair_dashed) {
      EmitDashedVertical(snapshot_->overlay_vertices, snapshot_->crosshair_x,
                         snapshot_->panes.front().plot.top,
                         snapshot_->panes.back().plot.bottom,
                         input_.config.display_scale, line_color);
      EmitDashedHorizontal(snapshot_->overlay_vertices, touch_y,
                           active_plot.left, active_plot.right,
                           input_.config.display_scale, line_color);
    } else {
      AppendQuad(snapshot_->overlay_vertices, snapshot_->crosshair_x - 0.5f,
                 snapshot_->plot.top, snapshot_->crosshair_x + 0.5f,
                 snapshot_->panes.back().plot.bottom, line_color);
      AppendQuad(snapshot_->overlay_vertices, active_plot.left, touch_y - 0.5f,
                 active_plot.right, touch_y + 0.5f, line_color);
    }
  }

  const SnapshotBuildInput& input_;
  std::shared_ptr<RenderSnapshot> snapshot_;
  std::shared_ptr<std::vector<float>> content_vertices_;
  CandleIterator lower_;
  CandleIterator upper_;
  CandleIterator minimum_candle_;
  CandleIterator maximum_candle_;
  double visible_minimum_value_ = 0.0;
  double visible_maximum_value_ = 0.0;
  double y_min_ = 0.0;
  double y_max_ = 1.0;
  std::vector<double> pane_y_min_;
  std::vector<double> pane_y_max_;
  std::vector<SeriesWindow> series_windows_;
};

}  // namespace

std::shared_ptr<const RenderSnapshot> BuildRenderSnapshot(
    const SnapshotBuildInput& input) {
  return RenderSnapshotBuilder(input).Build();
}

}  // namespace trading_charts::internal
