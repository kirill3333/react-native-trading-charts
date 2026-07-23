// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/render_snapshot_builder.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <limits>
#include <memory>
#include <vector>

#include "cpp/internal/series_geometry.h"
#include "cpp/internal/triangle_geometry.h"

namespace trading_charts::internal {
namespace {

constexpr int kMaxTickCount = 256;

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

class RenderSnapshotBuilder {
 public:
  explicit RenderSnapshotBuilder(const SnapshotBuildInput& input)
      : input_(input),
        snapshot_(std::make_shared<RenderSnapshot>()),
        lower_(input.candles.begin()),
        upper_(input.candles.end()),
        minimum_candle_(input.candles.begin()),
        maximum_candle_(input.candles.begin()) {}

  std::shared_ptr<const RenderSnapshot> Build() {
    InitializeSnapshot();
    if (!HasDrawableContent()) {
      return snapshot_;
    }

    FindVisibleRange();
    SetVisibleRangeMetadata();
    CalculateYRange();
    AddExtrema();
    AddTicks();
    ReserveGeometry();
    AddGridGeometry();
    AddSeriesGeometry();
    AddCurrentPriceGeometry();
    AddCrosshairGeometry();
    return snapshot_;
  }

 private:
  using CandleIterator = std::vector<Candle>::const_iterator;

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

    const float y_lane =
        input_.config.show_y_axis ? input_.config.y_axis_width : 0.0f;
    const float x_lane =
        input_.config.show_x_axis ? input_.config.x_axis_height : 0.0f;
    snapshot_->plot.left =
        input_.config.show_y_axis && !input_.config.y_axis_on_right ? y_lane
                                                                    : 0.0f;
    snapshot_->plot.right =
        input_.width -
        (input_.config.show_y_axis && input_.config.y_axis_on_right ? y_lane
                                                                    : 0.0f);
    snapshot_->plot.top = kTopInset;
    snapshot_->plot.bottom = input_.height - x_lane;
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
    if (lower_ == upper_) {
      lower_ = input_.candles.begin();
      upper_ = input_.candles.end();
    }
  }

  void SetVisibleRangeMetadata() {
    snapshot_->first_visible_index =
        static_cast<size_t>(std::distance(input_.candles.begin(), lower_));
    snapshot_->last_visible_index =
        static_cast<size_t>(std::distance(input_.candles.begin(), upper_) - 1);
    snapshot_->has_visible_candles = true;

    if (input_.config.logical_spacing) {
      snapshot_->visible_x_min = lower_->timestamp;
      snapshot_->visible_x_max = (upper_ - 1)->timestamp;
      if (!(snapshot_->visible_x_max > snapshot_->visible_x_min)) {
        snapshot_->visible_x_max =
            snapshot_->visible_x_min + input_.config.timeframe_ms;
      }
    }
  }

  void CalculateYRange() {
    minimum_candle_ = lower_;
    maximum_candle_ = lower_;
    double raw_min = lower_->low;
    double raw_max = lower_->high;
    for (auto it = lower_; it != upper_; ++it) {
      if (it->low < raw_min) {
        raw_min = it->low;
        minimum_candle_ = it;
      }
      if (it->high > raw_max) {
        raw_max = it->high;
        maximum_candle_ = it;
      }
    }
    visible_minimum_value_ = raw_min;
    visible_maximum_value_ = raw_max;
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

    const int y_target =
        std::max(2, static_cast<int>(snapshot_->plot.Height() /
                                     (44.0f * input_.config.display_scale)));
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
  }

  void ReserveGeometry() {
    const SeriesGeometryInput series_input = BuildSeriesGeometryInput();
    snapshot_->vertices.reserve(
        (snapshot_->x_ticks.size() + snapshot_->y_ticks.size()) *
            kVerticesPerQuad * kFloatsPerVertex +
        SeriesGeometryFloatCapacity(series_input));
  }

  void AddGridGeometry() {
    const Color grid =
        WithAlpha(input_.config.grid, input_.config.grid_opacity);
    for (const AxisTick& tick : snapshot_->x_ticks) {
      AppendQuad(snapshot_->vertices, tick.position - 0.5f, snapshot_->plot.top,
                 tick.position + 0.5f, snapshot_->plot.bottom, grid);
    }
    for (const AxisTick& tick : snapshot_->y_ticks) {
      AppendQuad(snapshot_->vertices, snapshot_->plot.left,
                 tick.position - 0.5f, snapshot_->plot.right,
                 tick.position + 0.5f, grid);
    }
  }

  SeriesGeometryInput BuildSeriesGeometryInput() const {
    return SeriesGeometryInput{
        input_.config,
        input_.candles,
        static_cast<size_t>(std::distance(input_.candles.cbegin(), lower_)),
        static_cast<size_t>(std::distance(input_.candles.cbegin(), upper_)),
        snapshot_->plot,
        input_.visible_x_min,
        input_.visible_x_max,
        y_min_,
        y_max_,
    };
  }

  void AddSeriesGeometry() {
    AppendSeriesGeometry(BuildSeriesGeometryInput(), snapshot_->vertices);
  }

  void AddCurrentPriceGeometry() {
    const Candle& current = input_.candles.back();
    if (!input_.config.show_current_price) {
      return;
    }

    snapshot_->current_price = current.close;
    const bool current_price_up = current.close >= current.open;
    snapshot_->current_price_color =
        current_price_up ? input_.config.current_price_line_up
                         : input_.config.current_price_line_down;
    snapshot_->current_price_label_color =
        current_price_up ? input_.config.current_price_label_up
                         : input_.config.current_price_label_down;

    const bool price_in_range =
        current.close >= y_min_ && current.close <= y_max_;
    if (price_in_range || input_.config.pin_current_price_to_edge) {
      snapshot_->current_price_visible = true;
      snapshot_->current_price_y = current.close > y_max_ ? snapshot_->plot.top
                                   : current.close < y_min_
                                       ? snapshot_->plot.bottom
                                       : ProjectY(current.close);
    }
    if (price_in_range) {
      float x = snapshot_->plot.left;
      const size_t segment_count =
          SegmentCount(snapshot_->plot.left, snapshot_->plot.right, 6.0f);
      for (size_t segment = 0; segment < segment_count; ++segment) {
        AppendQuad(snapshot_->vertices, x, snapshot_->current_price_y - 0.5f,
                   std::min(x + 3.0f, snapshot_->plot.right),
                   snapshot_->current_price_y + 0.5f,
                   snapshot_->current_price_color);
        x += 6.0f;
      }
    }
  }

  void AddCrosshairGeometry() {
    if (!input_.crosshair_active || !input_.config.crosshair_enabled) {
      return;
    }

    const float touch_x = std::clamp(
        input_.crosshair_touch_x, snapshot_->plot.left, snapshot_->plot.right);
    const float touch_y = std::clamp(
        input_.crosshair_touch_y, snapshot_->plot.top, snapshot_->plot.bottom);
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
    snapshot_->crosshair_x =
        std::clamp(ProjectX(CandleX(nearest_index)), snapshot_->plot.left,
                   snapshot_->plot.right);
    snapshot_->crosshair_y = touch_y;
    snapshot_->crosshair_price =
        y_max_ - static_cast<double>((touch_y - snapshot_->plot.top) /
                                     snapshot_->plot.Height()) *
                     (y_max_ - y_min_);
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
      EmitDashedVertical(snapshot_->vertices, snapshot_->crosshair_x,
                         snapshot_->plot.top, snapshot_->plot.bottom,
                         input_.config.display_scale, line_color);
      EmitDashedHorizontal(snapshot_->vertices, touch_y, snapshot_->plot.left,
                           snapshot_->plot.right, input_.config.display_scale,
                           line_color);
    } else {
      AppendQuad(snapshot_->vertices, snapshot_->crosshair_x - 0.5f,
                 snapshot_->plot.top, snapshot_->crosshair_x + 0.5f,
                 snapshot_->plot.bottom, line_color);
      AppendQuad(snapshot_->vertices, snapshot_->plot.left, touch_y - 0.5f,
                 snapshot_->plot.right, touch_y + 0.5f, line_color);
    }
  }

  const SnapshotBuildInput& input_;
  std::shared_ptr<RenderSnapshot> snapshot_;
  CandleIterator lower_;
  CandleIterator upper_;
  CandleIterator minimum_candle_;
  CandleIterator maximum_candle_;
  double visible_minimum_value_ = 0.0;
  double visible_maximum_value_ = 0.0;
  double y_min_ = 0.0;
  double y_max_ = 1.0;
};

}  // namespace

std::shared_ptr<const RenderSnapshot> BuildRenderSnapshot(
    const SnapshotBuildInput& input) {
  return RenderSnapshotBuilder(input).Build();
}

}  // namespace trading_charts::internal
