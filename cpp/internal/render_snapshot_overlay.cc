// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdlib>
#include <iterator>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/config_constants.h"
#include "cpp/internal/config_normalization.h"
#include "cpp/internal/render_snapshot_builder.h"
#include "cpp/internal/render_snapshot_builder_impl.h"
#include "cpp/internal/triangle_geometry.h"

namespace trading_charts::internal {

namespace {

constexpr double kPercentageScale = 100.0;

template <typename T>
const T* AtTimestamp(const std::vector<T>& data,
                     std::optional<double> timestamp) {
  if (!timestamp) {
    return nullptr;
  }
  const size_t index = LowerTimestampBound(data, *timestamp);
  return index < data.size() && data[index].timestamp == *timestamp
             ? &data[index]
             : nullptr;
}

IndicatorLegendValue LegendValue(const Candle* candle, double Candle::* field,
                                 Color color) {
  return {candle ? candle->*field : 0.0, color, candle != nullptr};
}

}  // namespace

void RenderSnapshotBuilder::BuildMacdLegend(const SeriesData& series,
                                            std::optional<double> timestamp,
                                            IndicatorLegend& legend) const {
  const SeriesConfig& config = series.config;
  legend.kind = IndicatorKind::kMacd;
  legend.fast_period = config.macd_fast_period;
  legend.slow_period = config.macd_slow_period;
  legend.signal_period = config.macd_signal_period;
  legend.value_source = config.line_source;
  legend.text_color = config.macd_text_color;
  legend.text_color_set = config.macd_text_color_set;
  legend.value_count = legend.values.size();
  const HistogramPoint* point = AtTimestamp(series.histogram, timestamp);
  legend.values[0] = {
      point ? point->value : 0.0,
      point ? MacdHistogramColor(
                  series, static_cast<size_t>(point - series.histogram.data()))
            : config.macd_positive_increasing,
      point != nullptr};
  legend.values[1] = LegendValue(AtTimestamp(series.candles, timestamp),
                                 &Candle::close, config.color);
  legend.values[2] = LegendValue(AtTimestamp(series.signal_candles, timestamp),
                                 &Candle::close, config.macd_signal_color);
}

void RenderSnapshotBuilder::BuildIndicatorLegends() {
  auto& legends = snapshot_->indicator_legends;
  legends.clear();
  std::optional<double> timestamp;
  if (snapshot_->crosshair_visible) {
    timestamp = snapshot_->selected_candle.timestamp;
  } else if (snapshot_->has_visible_candles) {
    timestamp = input_.candles[snapshot_->last_visible_index].timestamp;
  }
  for (const SeriesData& series : input_.additional_series) {
    const SeriesConfig& config = series.config;
    const auto pane = ValidPaneIndex(series, snapshot_->panes.size());
    if (!config.visible || !config.legend_visible || !pane) {
      continue;
    }
    IndicatorLegend legend;
    legend.pane_index = *pane;
    legend.pane_id = config.pane_id;
    legend.value_count = 1;
    switch (config.source) {
      case SeriesSource::kOhlcvBoll: {
        const Candle* candle = AtTimestamp(series.candles, timestamp);
        legend.kind = IndicatorKind::kBoll;
        legend.period = config.boll_period;
        legend.std_dev_multiplier = config.boll_std_dev_multiplier;
        legend.value_count = legend.values.size();
        legend.values = {
            LegendValue(candle, &Candle::high, config.boll_upper.color),
            LegendValue(candle, &Candle::close, config.boll_middle.color),
            LegendValue(candle, &Candle::low, config.boll_lower.color)};
        break;
      }
      case SeriesSource::kOhlcvSma:
      case SeriesSource::kOhlcvEma:
        legend.kind = config.source == SeriesSource::kOhlcvSma
                          ? IndicatorKind::kSma
                          : IndicatorKind::kEma;
        legend.period = config.moving_average_period;
        legend.values[0] = LegendValue(AtTimestamp(series.candles, timestamp),
                                       &Candle::close, config.color);
        break;
      case SeriesSource::kOhlcvVolume: {
        const auto* source = SourceCandles(series);
        const Candle* candle =
            source ? AtTimestamp(*source, timestamp) : nullptr;
        legend.kind = IndicatorKind::kVolume;
        legend.values[0] = LegendValue(
            candle, &Candle::volume,
            candle && candle->close < candle->open ? config.down : config.up);
        break;
      }
      case SeriesSource::kOhlcvKdj: {
        const Candle* point = AtTimestamp(series.candles, timestamp);
        legend.kind = IndicatorKind::kKdj;
        legend.period = config.kdj_period;
        legend.fast_period = config.kdj_m1;
        legend.slow_period = config.kdj_m2;
        legend.value_count = legend.values.size();
        legend.values = {LegendValue(point, &Candle::high, config.kdj_k.color),
                         LegendValue(point, &Candle::close, config.kdj_d.color),
                         LegendValue(point, &Candle::low, config.kdj_j.color)};
        break;
      }
      case SeriesSource::kOhlcvRsi:
      case SeriesSource::kOhlcvWilliamsR:
        legend.kind = config.source == SeriesSource::kOhlcvRsi
                          ? IndicatorKind::kRsi
                          : IndicatorKind::kWilliamsR;
        legend.period = config.source == SeriesSource::kOhlcvRsi
                            ? config.rsi_period
                            : config.williams_period;
        legend.text_color = config.rsi_text_color;
        legend.text_color_set = config.rsi_text_color_set;
        legend.values[0] = LegendValue(AtTimestamp(series.candles, timestamp),
                                       &Candle::close, config.color);
        break;
      case SeriesSource::kOhlcvMacd:
        BuildMacdLegend(series, timestamp, legend);
        break;
      case SeriesSource::kData:
      case SeriesSource::kOhlcvSar:
        continue;
    }
    legends.push_back(std::move(legend));
  }
}

void RenderSnapshotBuilder::SelectCrosshairSeriesValues(double timestamp) {
  snapshot_->crosshair_series_values.clear();
  snapshot_->crosshair_series_values.reserve(input_.additional_series.size());
  for (const SeriesData& series : input_.additional_series) {
    if (!series.config.visible ||
        !ValidPaneIndex(series, snapshot_->panes.size()).has_value()) {
      continue;
    }
    CrosshairSeriesValue selected;
    selected.series_id = series.config.series_id;
    selected.pane_id = series.config.pane_id;
    selected.price_scale_id = series.config.price_scale_id;
    selected.series_type = series.config.type;
    selected.source_type = series.config.source;

    if (series.config.source == SeriesSource::kOhlcvKdj) {
      selected.kind = CrosshairSeriesValueKind::kKdj;
      const auto* point = AtTimestamp(series.candles, timestamp);
      selected.has_value = point != nullptr;
      if (point) {
        selected.k = point->high;
        selected.d = point->close;
        selected.j = point->low;
      }
      snapshot_->crosshair_series_values.push_back(std::move(selected));
      continue;
    }
    if (series.config.source == SeriesSource::kOhlcvBoll) {
      selected.kind = CrosshairSeriesValueKind::kBoll;
      const auto* point = AtTimestamp(series.candles, timestamp);
      selected.has_value = point != nullptr;
      if (selected.has_value) {
        selected.upper = point->high;
        selected.middle = point->close;
        selected.lower = point->low;
      }
      snapshot_->crosshair_series_values.push_back(std::move(selected));
      continue;
    }
    if (series.config.source == SeriesSource::kOhlcvMacd) {
      selected.kind = CrosshairSeriesValueKind::kMacd;
      const auto* macd = AtTimestamp(series.candles, timestamp);
      const auto* signal = AtTimestamp(series.signal_candles, timestamp);
      const auto* histogram = AtTimestamp(series.histogram, timestamp);
      selected.has_macd = macd != nullptr;
      selected.has_signal = signal != nullptr;
      selected.has_histogram = histogram != nullptr;
      selected.macd = macd ? macd->close : 0.0;
      selected.signal = signal ? signal->close : 0.0;
      selected.histogram = histogram ? histogram->value : 0.0;
      snapshot_->crosshair_series_values.push_back(std::move(selected));
      continue;
    }

    if (series.config.source == SeriesSource::kOhlcvVolume) {
      selected.kind = CrosshairSeriesValueKind::kScalar;
      const auto* source = SourceCandles(series);
      const auto* point = source ? AtTimestamp(*source, timestamp) : nullptr;
      selected.has_value = point != nullptr;
      selected.value = point ? point->volume : 0.0;
      snapshot_->crosshair_series_values.push_back(std::move(selected));
      continue;
    }

    if (series.config.type == SeriesType::kHistogram) {
      selected.kind = CrosshairSeriesValueKind::kScalar;
      const auto* point = AtTimestamp(series.histogram, timestamp);
      selected.has_value = point != nullptr;
      selected.value = selected.has_value ? point->value : 0.0;
      snapshot_->crosshair_series_values.push_back(std::move(selected));
      continue;
    }

    const auto* candle = AtTimestamp(series.candles, timestamp);
    selected.has_value = candle != nullptr;
    if (series.config.source == SeriesSource::kData &&
        !IsLineLikeSeries(series.config.type)) {
      selected.kind = CrosshairSeriesValueKind::kOhlc;
      selected.candle = selected.has_value ? *candle : Candle{};
    } else {
      selected.kind = CrosshairSeriesValueKind::kScalar;
      selected.value = selected.has_value
                           ? CandleValue(*candle, series.config.line_source)
                           : 0.0;
    }
    snapshot_->crosshair_series_values.push_back(std::move(selected));
  }
}

void RenderSnapshotBuilder::AddCrosshair() {
  if (!input_.crosshair_active || !input_.config.crosshair_enabled) {
    return;
  }

  const float touch_x = std::clamp(input_.crosshair_touch_x,
                                   snapshot_->plot.left, snapshot_->plot.right);
  size_t active_pane = snapshot_->panes.size() - 1;
  for (size_t index = 0; index < snapshot_->panes.size(); ++index) {
    if (input_.crosshair_touch_y <= snapshot_->panes[index].plot.bottom) {
      active_pane = index;
      break;
    }
  }
  snapshot_->active_pane_index = active_pane;
  const Rect& active_plot = snapshot_->panes[active_pane].plot;
  const float touch_y =
      std::clamp(input_.crosshair_touch_y, active_plot.top, active_plot.bottom);
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
  SelectCrosshairSeriesValues(nearest->timestamp);
  snapshot_->crosshair_x =
      std::clamp(ProjectX(CandleX(nearest_index)), snapshot_->plot.left,
                 snapshot_->plot.right);
  snapshot_->crosshair_y = touch_y;
  snapshot_->crosshair_price =
      pane_y_max_[active_pane] -
      static_cast<double>((touch_y - active_plot.top) / active_plot.Height()) *
          (pane_y_max_[active_pane] - pane_y_min_[active_pane]);
  snapshot_->selected_change = nearest->close - nearest->open;
  if (nearest->open != 0.0) {
    const double denominator = std::abs(nearest->open);
    snapshot_->selected_change_percent =
        snapshot_->selected_change / denominator * kPercentageScale;
    snapshot_->selected_amplitude_percent =
        (nearest->high - nearest->low) / denominator * kPercentageScale;
    snapshot_->selected_percentages_valid = true;
  }

  const Color line_color =
      WithAlpha(input_.config.crosshair, input_.config.crosshair_opacity);
  if (input_.config.crosshair_dashed) {
    EmitDashedVertical(snapshot_->overlay_vertices, snapshot_->crosshair_x,
                       snapshot_->panes.front().plot.top,
                       snapshot_->panes.back().plot.bottom,
                       input_.config.display_scale, line_color);
    EmitDashedHorizontal(snapshot_->overlay_vertices, touch_y, active_plot.left,
                         active_plot.right, input_.config.display_scale,
                         line_color);
  } else {
    AppendQuad(snapshot_->overlay_vertices,
               snapshot_->crosshair_x - kOnePixelLineHalfWidth,
               snapshot_->plot.top,
               snapshot_->crosshair_x + kOnePixelLineHalfWidth,
               snapshot_->panes.back().plot.bottom, line_color);
    AppendQuad(snapshot_->overlay_vertices, active_plot.left,
               touch_y - kOnePixelLineHalfWidth, active_plot.right,
               touch_y + kOnePixelLineHalfWidth, line_color);
  }
}

}  // namespace trading_charts::internal
