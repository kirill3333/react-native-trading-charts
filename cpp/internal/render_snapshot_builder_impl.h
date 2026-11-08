// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_RENDER_SNAPSHOT_BUILDER_IMPL_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_RENDER_SNAPSHOT_BUILDER_IMPL_H_

#include <algorithm>
#include <cstddef>
#include <iterator>
#include <memory>
#include <optional>
#include <utility>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/render_snapshot_builder.h"
#include "cpp/internal/series_geometry.h"

namespace trading_charts::internal {

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

inline bool IsSeriesInPane(const SeriesData& series, size_t pane_index) {
  return series.pane_index.has_value() && *series.pane_index == pane_index;
}

inline std::optional<size_t> ValidPaneIndex(const SeriesData& series,
                                            size_t pane_count) {
  if (!series.pane_index.has_value() || *series.pane_index >= pane_count) {
    return std::nullopt;
  }
  return series.pane_index;
}

inline constexpr float kOnePixelLineHalfWidth = 0.5f;

inline Color WithAlpha(Color color, float value) {
  color.a *= value;
  return color;
}

void EmitDashedVertical(std::vector<float>& out, float x, float top,
                        float bottom, float display_scale, const Color& color);

void EmitDashedHorizontal(std::vector<float>& out, float y, float left,
                          float right, float display_scale, const Color& color);

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
  std::shared_ptr<const RenderSnapshot> Build();

 private:
  using CandleIterator = std::vector<Candle>::const_iterator;
  bool ReuseContent();
  void InitializeSnapshot();
  bool HasDrawableContent();
  void FindVisibleRange();
  void SetVisibleRangeMetadata();
  void CalculateYRange();
  std::optional<size_t> MainIndexForTimestamp(double timestamp) const;
  float ProjectTimestamp(double timestamp, const Rect& plot) const;
  const std::vector<Candle>* SourceCandles(const SeriesData& series) const;
  void ComputeSeriesWindows();
  template <typename Timestamped>
  SeriesWindow VisibleWindowFor(const std::vector<Timestamped>& values) const {
    if (values.empty() ||
        (!snapshot_->has_visible_candles && input_.config.logical_spacing)) {
      return {};
    }
    double bound_min = input_.visible_x_min;
    double bound_max = input_.visible_x_max;
    if (input_.config.logical_spacing) {
      bound_min = input_.candles[snapshot_->first_visible_index].timestamp;
      bound_max = input_.candles[snapshot_->last_visible_index].timestamp;
    }
    return SeriesWindow{LowerTimestampBound(values, bound_min),
                        UpperTimestampBound(values, bound_max)};
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
                           Callback&& callback) const;
  void IncludeAdditionalSeriesRange(size_t pane_index, double& minimum,
                                    double& maximum) const;
  void CalculateAdditionalPaneRanges();
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
                   double value);
  void AddExtrema();
  void AddTicks();
  template <typename Callback>
  void VisitKdjLines(size_t index, size_t pane, Callback&& visit) const;
  void ReserveGeometry();
  void AddGridGeometry();
  void AddRsiBackgroundGeometry();
  SeriesGeometryInput BuildSeriesGeometryInput() const;
  void AddSeriesGeometry();
  float ProjectPaneY(size_t pane_index, double value) const {
    const Rect& plot = snapshot_->panes[pane_index].plot;
    return plot.bottom - static_cast<float>((value - pane_y_min_[pane_index]) /
                                            (pane_y_max_[pane_index] -
                                             pane_y_min_[pane_index])) *
                             plot.Height();
  }

  void AddHistogramBar(size_t pane_index, double timestamp, double value,
                       const Color& color);

  Color MacdHistogramColor(const SeriesData& series, size_t index) const {
    const double value = series.histogram[index].value;
    if (index == 0) {
      return value >= 0.0 ? series.config.macd_positive_increasing
                          : series.config.macd_negative_decreasing;
    }
    const double previous = series.histogram[index - 1].value;
    if (value >= 0.0) {
      return value > previous ? series.config.macd_positive_increasing
                              : series.config.macd_positive_decreasing;
    }
    return value > previous ? series.config.macd_negative_increasing
                            : series.config.macd_negative_decreasing;
  }

  template <typename Callback>
  void VisitVisibleHistogram(size_t series_index, Callback&& callback) const {
    const SeriesData& series = input_.additional_series[series_index];
    if (series.config.source == SeriesSource::kOhlcvVolume) {
      VisitVisibleSeriesCandles(series_index, [&](const Candle& candle) {
        callback(candle.timestamp, candle.volume,
                 candle.close >= candle.open ? series.config.up
                                             : series.config.down);
      });
      return;
    }
    const SeriesWindow window = series.config.source == SeriesSource::kOhlcvMacd
                                    ? VisibleWindowFor(series.histogram)
                                    : series_windows_[series_index];
    VisitVisibleSeriesSamples(
        window, series.histogram, input_.config.logical_spacing,
        [&](const HistogramPoint& point) {
          const Color color =
              series.config.source == SeriesSource::kOhlcvMacd
                  ? MacdHistogramColor(
                        series,
                        static_cast<size_t>(&point - series.histogram.data()))
                  : series.config.color;
          callback(point.timestamp, point.value, color);
        });
  }

  void AddLineComponent(const SeriesData& series,
                        const std::vector<Candle>& values,
                        const SeriesWindow& window, bool signal);
  SeriesGeometryInput BuildSarGeometryInput(size_t index, size_t pane) const;
  void AddBollSeriesGeometry(size_t index, bool fill);
  void AddBollFills();
  void AddAdditionalSeriesGeometry();
  void AddPaneSeparators();
  void BuildPriceLines();
  void AddPriceLineGeometry();
  void SetLineEndpoint();
  void AddCurrentPriceGeometry();
  void BuildMacdLegend(const SeriesData& series,
                       std::optional<double> timestamp,
                       IndicatorLegend& legend) const;
  void BuildIndicatorLegends();
  void SelectCrosshairSeriesValues(double timestamp);
  void AddCrosshair();

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

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_RENDER_SNAPSHOT_BUILDER_IMPL_H_
