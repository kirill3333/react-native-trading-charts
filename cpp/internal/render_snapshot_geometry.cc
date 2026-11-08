// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <initializer_list>
#include <iterator>
#include <limits>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/config_constants.h"
#include "cpp/internal/config_normalization.h"
#include "cpp/internal/render_snapshot_builder.h"
#include "cpp/internal/render_snapshot_builder_impl.h"
#include "cpp/internal/series_geometry.h"
#include "cpp/internal/trading_time.h"
#include "cpp/internal/triangle_geometry.h"

namespace trading_charts::internal {

namespace {

constexpr float kPaneSeparatorOpacityBoost = 0.2f;

constexpr float kDashLength = 4.0f;
constexpr float kDashGap = 3.0f;
constexpr float kPriceLineDashLength = 3.0f;
constexpr float kPriceLineDashGap = 3.0f;

constexpr float kMinimumHistogramPixelHeight = 1.0f;
constexpr size_t kRsiBandQuadCount = 1;
constexpr size_t kRsiBoundaryLineCount = 2;
constexpr size_t kSolidCrosshairLineCount = 2;

bool IsHorizontallyOutsidePlot(float center_x, float half_width,
                               const Rect& plot) {
  const float left_edge = center_x - half_width;
  const float right_edge = center_x + half_width;
  return right_edge < plot.left || left_edge > plot.right;
}

size_t SegmentCount(float start, float end, float step) {
  if (!(end > start) || !(step > 0.0f)) {
    return 0;
  }
  return static_cast<size_t>(std::ceil((end - start) / step));
}

}  // namespace

void EmitDashedHorizontal(std::vector<float>& out, float y, float left,
                          float right, float display_scale,
                          const Color& color) {
  const float dash = kDashLength * display_scale;
  const float gap = kDashGap * display_scale;
  float x = left;
  const size_t segment_count = SegmentCount(left, right, dash + gap);
  for (size_t segment = 0; segment < segment_count; ++segment) {
    AppendQuad(out, x, y - kOnePixelLineHalfWidth, std::min(x + dash, right),
               y + kOnePixelLineHalfWidth, color);
    x += dash + gap;
  }
}

void EmitDashedVertical(std::vector<float>& out, float x, float top,
                        float bottom, float display_scale, const Color& color) {
  const float dash = kDashLength * display_scale;
  const float gap = kDashGap * display_scale;
  float y = top;
  const size_t segment_count = SegmentCount(top, bottom, dash + gap);
  for (size_t segment = 0; segment < segment_count; ++segment) {
    AppendQuad(out, x - kOnePixelLineHalfWidth, y, x + kOnePixelLineHalfWidth,
               std::min(y + dash, bottom), color);
    y += dash + gap;
  }
}

template <typename Callback>
void RenderSnapshotBuilder::VisitKdjLines(size_t index, size_t pane,
                                          Callback&& visit) const {
  const SeriesData& series = input_.additional_series[index];
  const auto& window = series_windows_[index];
  const auto line = [&](const IndicatorLineStyle& style,
                        OhlcValueSource field) {
    ChartConfig config = input_.config;
    config.series_type = SeriesType::kLine;
    config.line_source = field;
    config.line = style.color;
    config.line_width = style.width;
    config.line_dashed = style.dashed;
    config.line_gradient_enabled = style.gradient_enabled;
    config.line_gradient_top = style.gradient_top;
    config.line_gradient_bottom = style.gradient_bottom;
    config.line_gap_threshold_ms = series.config.line_gap_threshold_ms;
    visit(SeriesGeometryInput{
        config, series.candles, window.first > 0 ? window.first - 1 : 0,
        std::min(window.last + 1, series.candles.size()),
        snapshot_->panes[pane].plot, input_.visible_x_min, input_.visible_x_max,
        pane_y_min_[pane], pane_y_max_[pane],
        input_.config.logical_spacing ? &input_.candles : nullptr, true});
  };
  line(series.config.kdj_k, OhlcValueSource::kHigh);
  line(series.config.kdj_d, OhlcValueSource::kClose);
  line(series.config.kdj_j, OhlcValueSource::kLow);
}

void RenderSnapshotBuilder::ReserveGeometry() {
  const SeriesGeometryInput series_input = BuildSeriesGeometryInput();
  size_t float_count =
      (snapshot_->x_ticks.size() + snapshot_->pane_y_ticks.size()) *
          kFloatsPerQuad +
      SeriesGeometryFloatCapacity(series_input);
  // Pane separators.
  float_count += snapshot_->panes.size() * kFloatsPerQuad;
  // Current price dashed line.
  if (input_.config.show_current_price) {
    const float price_line_step = (kPriceLineDashLength + kPriceLineDashGap) *
                                  input_.config.display_scale;
    float_count += SegmentCount(snapshot_->plot.left, snapshot_->plot.right,
                                price_line_step) *
                   kFloatsPerQuad;
  }
  const float dashed_line_step =
      (kDashLength + kDashGap) * input_.config.display_scale;
  for (const PriceLineSnapshot& price_line : snapshot_->price_lines) {
    (void)price_line;
    float_count += SegmentCount(snapshot_->plot.left, snapshot_->plot.right,
                                dashed_line_step) *
                   kFloatsPerQuad;
  }
  for (size_t index = 0; index < input_.additional_series.size(); ++index) {
    const SeriesData& series = input_.additional_series[index];
    const std::optional<size_t> pane_index =
        ValidPaneIndex(series, snapshot_->panes.size());
    if (!series.config.visible || !pane_index.has_value()) {
      continue;
    }
    const size_t resolved_pane_index = *pane_index;
    const SeriesWindow& window = series_windows_[index];
    if (series.config.source == SeriesSource::kOhlcvKdj) {
      VisitKdjLines(index, resolved_pane_index,
                    [&](const SeriesGeometryInput& line) {
                      float_count += SeriesGeometryFloatCapacity(line);
                    });
      continue;
    }
    if (IsFixedOscillator(series.config.source)) {
      const Rect& pane_plot = snapshot_->panes[resolved_pane_index].plot;
      const float step = (kDashLength + kDashGap) * input_.config.display_scale;
      const size_t boundary_segment_count =
          SegmentCount(pane_plot.left, pane_plot.right, step);
      float_count +=
          (kRsiBandQuadCount + kRsiBoundaryLineCount * boundary_segment_count) *
          kFloatsPerQuad;
    }
    if (series.config.source == SeriesSource::kOhlcvMacd) {
      const SeriesWindow signal_window =
          VisibleWindowFor(series.signal_candles);
      const SeriesWindow histogram_window = VisibleWindowFor(series.histogram);
      float_count +=
          (histogram_window.last - histogram_window.first + 1) * kFloatsPerQuad;
      ChartConfig signal_config = input_.config;
      signal_config.series_type = SeriesType::kLine;
      signal_config.line_width = series.config.macd_signal_line_width;
      signal_config.line_dashed = series.config.macd_signal_line_dashed;
      signal_config.line_source = OhlcValueSource::kClose;
      signal_config.line_gap_threshold_ms = series.config.line_gap_threshold_ms;
      size_t signal_first = signal_window.first;
      size_t signal_last = signal_window.last;
      if (signal_first > 0) {
        --signal_first;
      }
      if (signal_last < series.signal_candles.size()) {
        ++signal_last;
      }
      float_count += SeriesGeometryFloatCapacity(SeriesGeometryInput{
          signal_config,
          series.signal_candles,
          signal_first,
          signal_last,
          snapshot_->panes[resolved_pane_index].plot,
          input_.visible_x_min,
          input_.visible_x_max,
          pane_y_min_[resolved_pane_index],
          pane_y_max_[resolved_pane_index],
          input_.config.logical_spacing ? &input_.candles : nullptr,
          true,
      });
    }
    if (series.config.type == SeriesType::kHistogram) {
      float_count += (window.last - window.first) * kFloatsPerQuad;
      continue;
    }
    if (series.config.source == SeriesSource::kOhlcvSar) {
      float_count += SarGeometryFloatCapacity(
          BuildSarGeometryInput(index, resolved_pane_index));
      continue;
    }
    if (series.config.source == SeriesSource::kOhlcvBoll) {
      const size_t first = window.first > 0 ? window.first - 1 : 0;
      const size_t last = std::min(window.last + 1, series.candles.size());
      for (const IndicatorLineStyle* style :
           {&series.config.boll_upper, &series.config.boll_middle,
            &series.config.boll_lower}) {
        ChartConfig line_config = input_.config;
        line_config.series_type = SeriesType::kLine;
        line_config.line_width = style->width;
        line_config.line_dashed = style->dashed;
        float_count += SeriesGeometryFloatCapacity(SeriesGeometryInput{
            line_config, series.candles, first, last,
            snapshot_->panes[resolved_pane_index].plot, input_.visible_x_min,
            input_.visible_x_max, pane_y_min_[resolved_pane_index],
            pane_y_max_[resolved_pane_index],
            input_.config.logical_spacing ? &input_.candles : nullptr, true});
      }
      float_count += (last - first) * kFloatsPerQuad;
      continue;
    }
    ChartConfig config = input_.config;
    config.series_type = series.config.type;
    config.bar_line_width = series.config.line_width;
    config.baseline = series.config.baseline;
    config.line_width = series.config.line_width;
    config.line_dashed = series.config.line_dashed;
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
    float_count += SeriesGeometryFloatCapacity(SeriesGeometryInput{
        config,
        series.candles,
        first,
        last,
        snapshot_->panes[resolved_pane_index].plot,
        input_.visible_x_min,
        input_.visible_x_max,
        pane_y_min_[resolved_pane_index],
        pane_y_max_[resolved_pane_index],
        input_.config.logical_spacing ? &input_.candles : nullptr,
        IsDerivedOhlcvSource(series.config.source),
    });
  }
  content_vertices_->reserve(float_count);

  size_t overlay_float_count = 0;
  if (input_.crosshair_active && input_.config.crosshair_enabled) {
    if (input_.config.crosshair_dashed) {
      const float dash_step =
          (kDashLength + kDashGap) * input_.config.display_scale;
      overlay_float_count =
          (SegmentCount(snapshot_->panes.front().plot.top,
                        snapshot_->panes.back().plot.bottom, dash_step) +
           SegmentCount(snapshot_->plot.left, snapshot_->plot.right,
                        dash_step)) *
          kFloatsPerQuad;
    } else {
      overlay_float_count = kSolidCrosshairLineCount * kFloatsPerQuad;
    }
  }
  snapshot_->overlay_vertices.reserve(overlay_float_count);
}

void RenderSnapshotBuilder::AddGridGeometry() {
  const Color grid = WithAlpha(input_.config.grid, input_.config.grid_opacity);
  for (const AxisTick& tick : snapshot_->x_ticks) {
    AppendQuad(*content_vertices_, tick.position - kOnePixelLineHalfWidth,
               snapshot_->panes.front().plot.top,
               tick.position + kOnePixelLineHalfWidth,
               snapshot_->panes.back().plot.bottom, grid);
  }
  for (const PaneSnapshot& pane : snapshot_->panes) {
    for (size_t index = 0; index < pane.y_tick_count; ++index) {
      const AxisTick& tick =
          snapshot_->pane_y_ticks[pane.y_tick_offset + index];
      if (tick.grid_visible) {
        AppendQuad(*content_vertices_, pane.plot.left,
                   tick.position - kOnePixelLineHalfWidth, pane.plot.right,
                   tick.position + kOnePixelLineHalfWidth, grid);
      }
    }
  }
}

void RenderSnapshotBuilder::AddRsiBackgroundGeometry() {
  for (const SeriesData& series : input_.additional_series) {
    const std::optional<size_t> pane_index =
        ValidPaneIndex(series, snapshot_->panes.size());
    if (!series.config.visible || !IsFixedOscillator(series.config.source) ||
        !pane_index.has_value()) {
      continue;
    }
    const size_t resolved_pane_index = *pane_index;
    const Rect& plot = snapshot_->panes[resolved_pane_index].plot;
    const float overbought_y =
        ProjectPaneY(resolved_pane_index, series.config.Overbought());
    const float oversold_y =
        ProjectPaneY(resolved_pane_index, series.config.Oversold());
    AppendClippedQuad(*content_vertices_, plot.left, overbought_y, plot.right,
                      oversold_y, plot, series.config.rsi_band);
    EmitDashedHorizontal(*content_vertices_, overbought_y, plot.left,
                         plot.right, input_.config.display_scale,
                         series.config.rsi_level_line);
    EmitDashedHorizontal(*content_vertices_, oversold_y, plot.left, plot.right,
                         input_.config.display_scale,
                         series.config.rsi_level_line);
  }
}

SeriesGeometryInput RenderSnapshotBuilder::BuildSeriesGeometryInput() const {
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
      nullptr,
      input_.config.line_rounded,
  };
}

void RenderSnapshotBuilder::AddSeriesGeometry() {
  AppendSeriesGeometry(BuildSeriesGeometryInput(), *content_vertices_);
}

std::optional<size_t> RenderSnapshotBuilder::MainIndexForTimestamp(
    double timestamp) const {
  auto found =
      std::lower_bound(input_.candles.begin(), input_.candles.end(), timestamp,
                       [](const Candle& candle, double value) {
                         return candle.timestamp < value;
                       });
  if (found == input_.candles.end() || found->timestamp != timestamp) {
    return std::nullopt;
  }
  return static_cast<size_t>(std::distance(input_.candles.begin(), found));
}

float RenderSnapshotBuilder::ProjectTimestamp(double timestamp,
                                              const Rect& plot) const {
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

void RenderSnapshotBuilder::AddHistogramBar(size_t pane_index, double timestamp,
                                            double value, const Color& color) {
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
  const float width = std::clamp(slot_width * kBodyWidthToSlotRatio,
                                 kMinimumBodyWidth, kMaximumBodyWidth);
  const float half_width = width / 2.0f;
  if (IsHorizontallyOutsidePlot(x, half_width, plot)) {
    return;
  }
  const float zero_y =
      std::clamp(ProjectPaneY(pane_index, 0.0), plot.top, plot.bottom);
  const float value_y =
      std::clamp(ProjectPaneY(pane_index, value), plot.top, plot.bottom);
  float top = std::min(zero_y, value_y);
  float bottom = std::max(zero_y, value_y);
  if (bottom - top < kMinimumHistogramPixelHeight) {
    top = std::max(plot.top, bottom - kMinimumHistogramPixelHeight);
  }
  AppendClippedQuad(*content_vertices_, x - half_width, top, x + half_width,
                    bottom, plot, color);
}

void RenderSnapshotBuilder::AddLineComponent(const SeriesData& series,
                                             const std::vector<Candle>& values,
                                             const SeriesWindow& window,
                                             bool signal) {
  if (values.empty()) {
    return;
  }
  ChartConfig config = input_.config;
  config.series_type = SeriesType::kLine;
  config.line_width =
      signal ? series.config.macd_signal_line_width : series.config.line_width;
  config.line = signal ? series.config.macd_signal_color : series.config.color;
  config.line_dashed = signal ? series.config.macd_signal_line_dashed
                              : series.config.line_dashed;
  config.line_gradient_top = signal ? series.config.macd_signal_gradient_top
                                    : series.config.line_gradient_top;
  config.line_gradient_bottom = signal
                                    ? series.config.macd_signal_gradient_bottom
                                    : series.config.line_gradient_bottom;
  config.line_gradient_enabled =
      signal ? series.config.macd_signal_gradient_enabled
             : series.config.line_gradient_enabled;
  config.line_source = OhlcValueSource::kClose;
  config.line_gap_threshold_ms = series.config.line_gap_threshold_ms;
  size_t first = window.first;
  size_t last = window.last;
  if (first > 0) {
    --first;
  }
  if (last < values.size()) {
    ++last;
  }
  const std::optional<size_t> pane_index =
      ValidPaneIndex(series, snapshot_->panes.size());
  assert(pane_index.has_value());
  if (!pane_index.has_value()) {
    return;
  }
  const size_t resolved_pane_index = *pane_index;
  AppendSeriesGeometry(
      SeriesGeometryInput{
          config,
          values,
          first,
          last,
          snapshot_->panes[resolved_pane_index].plot,
          input_.visible_x_min,
          input_.visible_x_max,
          pane_y_min_[resolved_pane_index],
          pane_y_max_[resolved_pane_index],
          input_.config.logical_spacing ? &input_.candles : nullptr,
          true,
      },
      *content_vertices_);
}

SeriesGeometryInput RenderSnapshotBuilder::BuildSarGeometryInput(
    size_t index, size_t pane) const {
  const SeriesWindow& window = series_windows_[index];
  return SeriesGeometryInput{
      input_.config,
      input_.additional_series[index].candles,
      window.first,
      window.last,
      snapshot_->panes[pane].plot,
      input_.visible_x_min,
      input_.visible_x_max,
      pane_y_min_[pane],
      pane_y_max_[pane],
      input_.config.logical_spacing ? &input_.candles : nullptr};
}

void RenderSnapshotBuilder::AddBollSeriesGeometry(size_t index, bool fill) {
  const SeriesData& series = input_.additional_series[index];
  const auto pane = ValidPaneIndex(series, snapshot_->panes.size());
  if (!pane.has_value() || !series.config.visible || series.candles.empty()) {
    return;
  }
  const SeriesWindow& window = series_windows_[index];
  const size_t first = window.first > 0 ? window.first - 1 : 0;
  const size_t last = std::min(window.last + 1, series.candles.size());
  ChartConfig config = input_.config;
  config.line_gap_threshold_ms = series.config.line_gap_threshold_ms;
  AppendBollGeometry(
      SeriesGeometryInput{
          config, series.candles, first, last, snapshot_->panes[*pane].plot,
          input_.visible_x_min, input_.visible_x_max, pane_y_min_[*pane],
          pane_y_max_[*pane],
          input_.config.logical_spacing ? &input_.candles : nullptr, true},
      series.config, fill, *content_vertices_);
}

void RenderSnapshotBuilder::AddBollFills() {
  for (size_t index = 0; index < input_.additional_series.size(); ++index) {
    if (input_.additional_series[index].config.source ==
        SeriesSource::kOhlcvBoll) {
      AddBollSeriesGeometry(index, true);
    }
  }
}

void RenderSnapshotBuilder::AddAdditionalSeriesGeometry() {
  for (size_t index = 0; index < input_.additional_series.size(); ++index) {
    const SeriesData& series = input_.additional_series[index];
    if (!series.config.visible) {
      continue;
    }
    const std::optional<size_t> pane_index =
        ValidPaneIndex(series, snapshot_->panes.size());
    if (!pane_index.has_value()) {
      continue;
    }
    const size_t resolved_pane_index = *pane_index;
    const SeriesWindow& window = series_windows_[index];
    if (series.config.source == SeriesSource::kOhlcvKdj) {
      VisitKdjLines(index, resolved_pane_index,
                    [&](const SeriesGeometryInput& line) {
                      AppendSeriesGeometry(line, *content_vertices_);
                    });
      continue;
    }
    if (series.config.source == SeriesSource::kOhlcvSar) {
      AppendSarGeometry(BuildSarGeometryInput(index, resolved_pane_index),
                        series, *content_vertices_);
      continue;
    }
    if (series.config.source == SeriesSource::kOhlcvBoll) {
      AddBollSeriesGeometry(index, false);
      continue;
    }
    if (series.config.source == SeriesSource::kOhlcvMacd) {
      VisitVisibleHistogram(
          index, [&](double timestamp, double value, const Color& color) {
            AddHistogramBar(resolved_pane_index, timestamp, value, color);
          });
      const Rect& plot = snapshot_->panes[resolved_pane_index].plot;
      const float zero_y = std::clamp(ProjectPaneY(resolved_pane_index, 0.0),
                                      plot.top, plot.bottom);
      const float half_zero_line_width = input_.config.display_scale / 2.0f;
      AppendClippedQuad(*content_vertices_, plot.left,
                        zero_y - half_zero_line_width, plot.right,
                        zero_y + half_zero_line_width, plot,
                        series.config.macd_zero_line);
      AddLineComponent(series, series.candles, window, false);
      AddLineComponent(series, series.signal_candles,
                       VisibleWindowFor(series.signal_candles), true);
      continue;
    }
    if (series.config.type == SeriesType::kHistogram) {
      VisitVisibleHistogram(
          index, [&](double timestamp, double value, const Color& color) {
            AddHistogramBar(resolved_pane_index, timestamp, value, color);
          });
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
    config.baseline = series.config.baseline;
    config.line_width = series.config.line_width;
    config.line = series.config.color;
    config.line_dashed = series.config.line_dashed;
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
            snapshot_->panes[resolved_pane_index].plot,
            input_.visible_x_min,
            input_.visible_x_max,
            pane_y_min_[resolved_pane_index],
            pane_y_max_[resolved_pane_index],
            input_.config.logical_spacing ? &input_.candles : nullptr,
            IsDerivedOhlcvSource(series.config.source),
        },
        *content_vertices_);
  }
}

void RenderSnapshotBuilder::AddPaneSeparators() {
  if (snapshot_->panes.size() < kMinimumResizablePaneCount) {
    return;
  }
  const Color color = WithAlpha(
      input_.config.grid,
      std::min(1.0f, input_.config.grid_opacity + kPaneSeparatorOpacityBoost));
  const float half_separator_height = input_.config.display_scale / 2.0f;
  for (size_t index = 0; index + 1 < snapshot_->panes.size(); ++index) {
    const float y = snapshot_->panes[index].plot.bottom + half_separator_height;
    AppendQuad(*content_vertices_, snapshot_->panes[index].plot.left,
               y - half_separator_height, snapshot_->panes[index].plot.right,
               y + half_separator_height, color);
  }
}

void RenderSnapshotBuilder::BuildPriceLines() {
  if (!input_.config.show_y_axis || snapshot_->panes.empty() ||
      !snapshot_->panes.front().scale_visible) {
    return;
  }
  snapshot_->price_lines.reserve(input_.price_lines.size());
  for (const PriceLine& price_line : input_.price_lines) {
    if (price_line.price < y_min_ || price_line.price > y_max_) {
      continue;
    }
    snapshot_->price_lines.push_back(PriceLineSnapshot{
        price_line.id,
        price_line.price,
        price_line.label,
        price_line.color,
        ProjectY(price_line.price),
    });
  }
}

void RenderSnapshotBuilder::AddPriceLineGeometry() {
  for (const PriceLineSnapshot& price_line : snapshot_->price_lines) {
    EmitDashedHorizontal(*content_vertices_, price_line.y, snapshot_->plot.left,
                         snapshot_->plot.right, input_.config.display_scale,
                         price_line.color);
  }
}

void RenderSnapshotBuilder::SetLineEndpoint() {
  if (!IsLineLikeSeries(input_.config.series_type)) {
    return;
  }
  const double x = CandleX(input_.candles.size() - 1);
  const double y =
      CandleValue(input_.candles.back(), input_.config.line_source);
  if (x >= input_.visible_x_min && x <= input_.visible_x_max && y >= y_min_ &&
      y <= y_max_) {
    snapshot_->line_endpoint_visible = true;
    snapshot_->line_endpoint_below_base =
        input_.config.series_type == SeriesType::kBaseline &&
        y < BaselinePrice(input_.config.baseline, y_min_, y_max_);
    snapshot_->line_endpoint_x = ProjectX(x);
    snapshot_->line_endpoint_y = ProjectY(y);
  }
}

void RenderSnapshotBuilder::AddCurrentPriceGeometry() {
  const Candle& current = input_.candles.back();
  if (!input_.config.show_current_price) {
    return;
  }

  const double current_value =
      IsLineLikeSeries(input_.config.series_type)
          ? CandleValue(current, input_.config.line_source)
          : current.close;
  snapshot_->current_price = current_value;
  const bool current_price_up =
      input_.config.series_type == SeriesType::kBaseline
          ? current_value >=
                BaselinePrice(input_.config.baseline, y_min_, y_max_)
          : current.close >= current.open;
  snapshot_->current_price_color = current_price_up
                                       ? input_.config.current_price_line_up
                                       : input_.config.current_price_line_down;
  snapshot_->current_price_label_color =
      current_price_up ? input_.config.current_price_label_up
                       : input_.config.current_price_label_down;

  const bool price_in_range =
      current_value >= y_min_ && current_value <= y_max_;
  if (price_in_range || input_.config.pin_current_price_to_edge) {
    snapshot_->current_price_visible = true;
    const bool price_above_range = current_value > y_max_;
    const bool price_below_range = current_value < y_min_;
    if (price_above_range) {
      snapshot_->current_price_y = snapshot_->plot.top;
    } else if (price_below_range) {
      snapshot_->current_price_y = snapshot_->plot.bottom;
    } else {
      snapshot_->current_price_y = ProjectY(current_value);
    }
  }
  if (price_in_range) {
    const float dash = kPriceLineDashLength * input_.config.display_scale;
    const float gap = kPriceLineDashGap * input_.config.display_scale;
    float x = snapshot_->plot.left;
    const size_t segment_count =
        SegmentCount(snapshot_->plot.left, snapshot_->plot.right, dash + gap);
    for (size_t segment = 0; segment < segment_count; ++segment) {
      AppendQuad(*content_vertices_, x,
                 snapshot_->current_price_y - kOnePixelLineHalfWidth,
                 std::min(x + dash, snapshot_->plot.right),
                 snapshot_->current_price_y + kOnePixelLineHalfWidth,
                 snapshot_->current_price_color);
      x += dash + gap;
    }
  }
}

}  // namespace trading_charts::internal
