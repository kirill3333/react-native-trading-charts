// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <memory>
#include <mutex>
#include <optional>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/config_constants.h"
#include "cpp/internal/pane_layout.h"
#include "cpp/internal/trading_time.h"

namespace trading_charts {
namespace {

constexpr double kLeadingDataPaddingInSlots = 0.5;
constexpr double kTrailingDataPaddingInSlots = 2.5;
constexpr double kMinimumViewportSpanInSlots = 3.0;
constexpr double kMinimumPlotLength = 1.0;
constexpr double kMinimumLiveEdgeTolerance = 1.0;

}  // namespace

double ChartEngine::XDomainUnitLocked() const {
  return config_.logical_spacing
             ? 1.0
             : internal::NominalResolutionMilliseconds(config_.resolution);
}

double ChartEngine::CandleXLocked(size_t index) const {
  return config_.logical_spacing ? static_cast<double>(index)
                                 : candles_[index].timestamp;
}

double ChartEngine::DataXMinLocked() const {
  return CandleXLocked(0) - XDomainUnitLocked() * kLeadingDataPaddingInSlots;
}

double ChartEngine::DataXMaxLocked() const {
  return CandleXLocked(candles_.size() - 1) +
         XDomainUnitLocked() * kTrailingDataPaddingInSlots;
}

void ChartEngine::SetSize(float width, float height) {
  MutationScope mutation(*this);
  const float next_width = std::max(width, 0.0F);
  const float next_height = std::max(height, 0.0F);
  if (next_width == width_ && next_height == height_) {
    return;
  }
  mutation.ContentChanged();
  width_ = next_width;
  height_ = next_height;
}

void ChartEngine::ResetViewportLocked(MutationScope& mutation) {
  mutation.ContentChanged();
  y_range_multiplier_ = 1.0 / config_.default_y_scale;
  for (size_t index = 0; index < panes_.size(); ++index) {
    panes_[index].y_range_multiplier = index == 0 ? y_range_multiplier_ : 1.0;
  }
  if (candles_.empty()) {
    viewport_initialized_ = false;
    visible_x_min_ = 0.0;
    visible_x_max_ = 1.0;
    horizontal_scale_base_span_ = 1.0;
    return;
  }
  const double unit = XDomainUnitLocked();
  const size_t visible = std::min(
      candles_.size(), static_cast<size_t>(config_.initial_visible_count));
  const size_t first = candles_.size() - visible;
  visible_x_min_ = CandleXLocked(first) - unit * kLeadingDataPaddingInSlots;
  visible_x_max_ =
      CandleXLocked(candles_.size() - 1) + unit * kTrailingDataPaddingInSlots;
  if (!(visible_x_max_ > visible_x_min_)) {
    visible_x_max_ = visible_x_min_ + unit * kMinimumViewportSpanInSlots;
  }
  horizontal_scale_base_span_ = visible_x_max_ - visible_x_min_;
  visible_x_min_ = visible_x_max_ -
                   (visible_x_max_ - visible_x_min_) / config_.default_scale;
  viewport_initialized_ = true;
  ClampViewportValuesLocked(&visible_x_min_, &visible_x_max_);
}

void ChartEngine::FitContentLocked(MutationScope& mutation) {
  mutation.ContentChanged();
  y_range_multiplier_ = 1.0 / config_.default_y_scale;
  for (size_t index = 0; index < panes_.size(); ++index) {
    panes_[index].y_range_multiplier = index == 0 ? y_range_multiplier_ : 1.0;
  }
  if (candles_.empty()) {
    viewport_initialized_ = false;
    visible_x_min_ = 0.0;
    visible_x_max_ = 1.0;
    return;
  }
  const double unit = XDomainUnitLocked();
  visible_x_min_ = DataXMinLocked();
  visible_x_max_ = DataXMaxLocked();
  if (!(visible_x_max_ > visible_x_min_)) {
    visible_x_max_ = visible_x_min_ + unit * kMinimumViewportSpanInSlots;
  }
  viewport_initialized_ = true;
  ClampViewportValuesLocked(&visible_x_min_, &visible_x_max_);
}

void ChartEngine::ClampViewportValuesLocked(double* visible_x_min,
                                            double* visible_x_max) const {
  if (candles_.empty() || !viewport_initialized_) {
    return;
  }
  const double data_min = DataXMinLocked();
  const double data_max = DataXMaxLocked();
  const double minimum_span = XDomainUnitLocked() * kMinimumViewportSpanInSlots;
  const double full_span = std::max(data_max - data_min, minimum_span);
  double span = std::max(*visible_x_max - *visible_x_min, minimum_span);
  span = std::min(span, full_span);
  *visible_x_min = std::max(*visible_x_min, data_min);
  *visible_x_max = *visible_x_min + span;
  if (*visible_x_max > data_max) {
    *visible_x_max = data_max;
    *visible_x_min = data_max - span;
  }
}

bool ChartEngine::IsAtLiveEdgeLocked() const {
  if (candles_.empty() || !viewport_initialized_) {
    return false;
  }
  const double data_max = DataXMaxLocked();
  const float axis_width = config_.show_y_axis ? config_.y_axis_width : 0.0F;
  const double plot_width =
      std::max(static_cast<double>(width_ - axis_width), kMinimumPlotLength);
  const double domain_per_pixel =
      (visible_x_max_ - visible_x_min_) / plot_width;
  const double tolerance =
      std::max(domain_per_pixel, kMinimumLiveEdgeTolerance);
  return visible_x_max_ >= data_max - tolerance;
}

bool ChartEngine::Pan(float delta_pixels) {
  MutationScope mutation(*this);
  if (!config_.allow_pan || !viewport_initialized_ || width_ <= 0.0F ||
      candles_.empty() || !std::isfinite(delta_pixels)) {
    return false;
  }
  const bool crosshair_changed = crosshair_active_;
  const float axis_width = config_.show_y_axis ? config_.y_axis_width : 0.0F;
  const double plot_width =
      std::max(static_cast<double>(width_ - axis_width), kMinimumPlotLength);
  const double visible_domain_span = visible_x_max_ - visible_x_min_;
  const double domain_delta =
      -static_cast<double>(delta_pixels) / plot_width * visible_domain_span;
  double next_x_min = visible_x_min_ + domain_delta;
  double next_x_max = visible_x_max_ + domain_delta;
  ClampViewportValuesLocked(&next_x_min, &next_x_max);
  const bool viewport_changed =
      next_x_min != visible_x_min_ || next_x_max != visible_x_max_;
  if (viewport_changed) {
    mutation.ContentChanged();
    visible_x_min_ = next_x_min;
    visible_x_max_ = next_x_max;
  } else if (crosshair_changed) {
    mutation.OverlayChanged();
  }
  if (viewport_changed || crosshair_changed) {
    crosshair_active_ = false;
  }
  return viewport_changed || crosshair_changed;
}

bool ChartEngine::Zoom(double scale, float focus_x) {
  MutationScope mutation(*this);
  if (!config_.allow_zoom || !viewport_initialized_ || !(scale > 0.0) ||
      !std::isfinite(scale) || candles_.empty()) {
    return false;
  }
  const bool crosshair_changed = crosshair_active_;
  const float left = config_.show_y_axis && !config_.y_axis_on_right
                         ? config_.y_axis_width
                         : 0.0F;
  const float right = width_ - (config_.show_y_axis && config_.y_axis_on_right
                                    ? config_.y_axis_width
                                    : 0.0F);
  const float plot_width =
      std::max(right - left, static_cast<float>(kMinimumPlotLength));
  const double focus_fraction =
      std::clamp(static_cast<double>((focus_x - left) / plot_width), 0.0, 1.0);
  const double old_span = visible_x_max_ - visible_x_min_;
  const double focus_domain_x = visible_x_min_ + focus_fraction * old_span;
  const double new_span = old_span / scale;
  double next_x_min = focus_domain_x - focus_fraction * new_span;
  double next_x_max = next_x_min + new_span;
  ClampViewportValuesLocked(&next_x_min, &next_x_max);
  const bool viewport_changed =
      next_x_min != visible_x_min_ || next_x_max != visible_x_max_;
  if (viewport_changed) {
    mutation.ContentChanged();
    visible_x_min_ = next_x_min;
    visible_x_max_ = next_x_max;
  } else if (crosshair_changed) {
    mutation.OverlayChanged();
  }
  if (viewport_changed || crosshair_changed) {
    crosshair_active_ = false;
  }
  return viewport_changed || crosshair_changed;
}

void ChartEngine::ZoomAtRightEdge(double scale) {
  MutationScope mutation(*this);
  if (!viewport_initialized_ || !(scale > 0.0) || !std::isfinite(scale) ||
      candles_.empty()) {
    return;
  }
  const double old_span = visible_x_max_ - visible_x_min_;
  const double new_span = old_span / scale;
  double next_x_min = visible_x_max_ - new_span;
  double next_x_max = visible_x_max_;
  ClampViewportValuesLocked(&next_x_min, &next_x_max);
  const bool viewport_changed =
      next_x_min != visible_x_min_ || next_x_max != visible_x_max_;
  if (viewport_changed) {
    mutation.ContentChanged();
    visible_x_min_ = next_x_min;
    visible_x_max_ = next_x_max;
  } else if (crosshair_active_) {
    mutation.OverlayChanged();
  }
  if (viewport_changed || crosshair_active_) {
    crosshair_active_ = false;
  }
}

bool ChartEngine::ScaleY(float delta_pixels) {
  float middle = 0.0F;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    const float axis_height =
        config_.show_x_axis ? config_.x_axis_height : 0.0F;
    const float plot_height = height_ - axis_height - internal::kTopInset;
    middle = internal::kTopInset + plot_height / 2.0F;
  }
  return ScaleYAt(delta_pixels, middle);
}

std::vector<Rect> ChartEngine::PaneRectsLocked() const {
  return internal::ComputePaneRects(config_, panes_, width_, height_);
}

size_t ChartEngine::PaneIndexAtYLocked(float y) const {
  const std::vector<Rect> rects = PaneRectsLocked();
  return PaneIndexAtYLocked(y, rects);
}

size_t ChartEngine::PaneIndexAtYLocked(float y,
                                       const std::vector<Rect>& rects) const {
  for (size_t index = 0; index < rects.size(); ++index) {
    if (y >= rects[index].top && y <= rects[index].bottom) {
      return index;
    }
  }
  return rects.empty() ? 0 : rects.size() - 1;
}

bool ChartEngine::ScaleYAt(float delta_pixels, float y) {
  MutationScope mutation(*this);
  if (!config_.allow_y_axis_scale || !config_.show_y_axis ||
      !viewport_initialized_ || height_ <= 0.0F || candles_.empty() ||
      !std::isfinite(delta_pixels)) {
    return false;
  }
  const std::vector<Rect> rects = PaneRectsLocked();
  const size_t pane_index = PaneIndexAtYLocked(y, rects);
  if (pane_index >= panes_.size()) {
    return false;
  }
  if (PaneHasRsiLocked(pane_index)) {
    return false;
  }
  const double plot_height = std::max(
      static_cast<double>(rects[pane_index].Height()), kMinimumPlotLength);
  const double current = panes_[pane_index].y_range_multiplier;
  const double next = std::clamp(
      current * std::exp(static_cast<double>(delta_pixels) / plot_height),
      internal::kMinYRangeMultiplier, internal::kMaxYRangeMultiplier);
  const bool crosshair_changed = crosshair_active_;
  if (next == current) {
    if (crosshair_changed) {
      mutation.OverlayChanged();
      crosshair_active_ = false;
    }
    return crosshair_changed;
  }
  mutation.ContentChanged();
  crosshair_active_ = false;
  panes_[pane_index].y_range_multiplier = next;
  if (pane_index == 0) {
    y_range_multiplier_ = next;
  }
  return true;
}

std::optional<size_t> ChartEngine::SeparatorAt(float y, float hit_slop) const {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!panes_resizable_ ||
      panes_.size() < internal::kMinimumResizablePaneCount) {
    return std::nullopt;
  }
  const std::vector<Rect> rects = PaneRectsLocked();
  for (size_t index = 0; index + 1 < rects.size(); ++index) {
    if (std::abs(y - rects[index].bottom) <= hit_slop) {
      return index;
    }
  }
  return std::nullopt;
}

bool ChartEngine::ResizePaneSeparator(size_t separator_index,
                                      float delta_pixels) {
  MutationScope mutation(*this);
  if (!panes_resizable_ || separator_index + 1 >= panes_.size() ||
      !std::isfinite(delta_pixels)) {
    return false;
  }
  const std::vector<Rect> rects = PaneRectsLocked();
  const float first_height = rects[separator_index].Height();
  const float second_height = rects[separator_index + 1].Height();
  const float combined_height = first_height + second_height;
  const float requested_first_height = first_height + delta_pixels;
  const float minimum_first_height = panes_[separator_index].min_height;
  const float maximum_first_height =
      combined_height - panes_[separator_index + 1].min_height;
  const float height_limited_by_second_pane =
      std::min(requested_first_height, maximum_first_height);
  const float next_first =
      std::max(minimum_first_height, height_limited_by_second_pane);
  const float next_second = combined_height - next_first;
  if (next_first == first_height || next_second <= 0.0F) {
    return false;
  }
  mutation.ContentChanged();
  panes_[separator_index].height_weight = static_cast<double>(next_first);
  panes_[separator_index + 1].height_weight = static_cast<double>(next_second);
  crosshair_active_ = false;
  return true;
}

void ChartEngine::ResetViewport() {
  MutationScope mutation(*this);
  mutation.ContentChanged();
  crosshair_active_ = false;
  ResetViewportLocked(mutation);
}

void ChartEngine::FitContent() {
  MutationScope mutation(*this);
  mutation.ContentChanged();
  crosshair_active_ = false;
  FitContentLocked(mutation);
}

void ChartEngine::SetCrosshair(bool active, float x, float y) {
  MutationScope mutation(*this);
  const bool next = active && config_.crosshair_enabled && !candles_.empty();
  if (crosshair_active_ == next &&
      (!next || (x == crosshair_touch_x_ && y == crosshair_touch_y_))) {
    return;
  }
  mutation.OverlayChanged();
  crosshair_active_ = next;
  crosshair_touch_x_ = x;
  crosshair_touch_y_ = y;
}

std::optional<YAxisValue> ChartEngine::YAxisValueAt(float y) {
  const std::shared_ptr<const RenderSnapshot> snapshot = Snapshot();
  if (!snapshot || !snapshot->config.show_y_axis || !std::isfinite(y)) {
    return std::nullopt;
  }
  for (size_t pane_index = 0; pane_index < snapshot->panes.size();
       ++pane_index) {
    const PaneSnapshot& pane = snapshot->panes[pane_index];
    if (!pane.scale_visible || y < pane.plot.top || y > pane.plot.bottom ||
        !(pane.visible_y_max > pane.visible_y_min)) {
      continue;
    }
    const double position =
        static_cast<double>(y - pane.plot.top) /
        std::max(static_cast<double>(pane.plot.Height()), 1.0);
    return YAxisValue{
        pane.pane_id,
        pane.price_scale_id,
        pane.visible_y_max -
            position * (pane.visible_y_max - pane.visible_y_min),
        pane_index,
    };
  }
  return std::nullopt;
}

}  // namespace trading_charts
