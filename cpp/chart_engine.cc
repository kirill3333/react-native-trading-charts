// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/chart_engine.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "cpp/internal/render_snapshot_builder.h"

namespace trading_charts {

ChartEngine::ChartEngine() = default;

void ChartEngine::MarkDirtyLocked() {
  ++revision_;
  ++content_revision_;
  dirty_ = true;
}

void ChartEngine::MarkCrosshairDirtyLocked() {
  ++revision_;
  dirty_ = true;
}

bool ChartEngine::SetPriceLine(const PriceLine& price_line) {
  if (price_line.id.empty() || price_line.label.empty() ||
      !std::isfinite(price_line.price)) {
    return false;
  }
  std::lock_guard<std::mutex> lock(mutex_);
  auto found = std::find_if(
      price_lines_.begin(), price_lines_.end(),
      [&](const PriceLine& current) { return current.id == price_line.id; });
  if (found != price_lines_.end()) {
    const bool equal = found->price == price_line.price &&
                       found->label == price_line.label &&
                       found->color_hex == price_line.color_hex &&
                       found->color.r == price_line.color.r &&
                       found->color.g == price_line.color.g &&
                       found->color.b == price_line.color.b &&
                       found->color.a == price_line.color.a;
    if (equal) {
      return false;
    }
    *found = price_line;
  } else {
    price_lines_.push_back(price_line);
  }
  MarkDirtyLocked();
  return true;
}

bool ChartEngine::RemovePriceLine(const std::string& price_line_id) {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto found = std::find_if(
      price_lines_.begin(), price_lines_.end(),
      [&](const PriceLine& current) { return current.id == price_line_id; });
  if (found == price_lines_.end()) {
    return false;
  }
  price_lines_.erase(found);
  MarkDirtyLocked();
  return true;
}

bool ChartEngine::ClearPriceLines() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (price_lines_.empty()) {
    return false;
  }
  price_lines_.clear();
  MarkDirtyLocked();
  return true;
}

std::vector<PriceLine> ChartEngine::PriceLines() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return price_lines_;
}

size_t ChartEngine::PriceLineCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return price_lines_.size();
}

PriceLine ChartEngine::PriceLineAt(size_t index) const {
  std::lock_guard<std::mutex> lock(mutex_);
  return index < price_lines_.size() ? price_lines_[index] : PriceLine{};
}

size_t ChartEngine::CandleCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return candles_.size();
}

uint64_t ChartEngine::Revision() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return revision_;
}

Candle ChartEngine::CandleAt(size_t index) const {
  std::lock_guard<std::mutex> lock(mutex_);
  return index < candles_.size() ? candles_[index] : Candle{};
}

std::vector<Candle> ChartEngine::Candles() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return candles_;
}

std::shared_ptr<const RenderSnapshot> ChartEngine::Snapshot() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!dirty_ && snapshot_) {
    return snapshot_;
  }
  internal::SnapshotBuildInput input{config_, candles_, panes_,
                                     additional_series_, price_lines_};
  input.width = width_;
  input.height = height_;
  input.visible_x_min = visible_x_min_;
  input.visible_x_max = visible_x_max_;
  input.horizontal_scale_base_span = horizontal_scale_base_span_;
  input.y_range_multiplier = y_range_multiplier_;
  input.viewport_initialized = viewport_initialized_;
  input.crosshair_active = crosshair_active_;
  input.crosshair_touch_x = crosshair_touch_x_;
  input.crosshair_touch_y = crosshair_touch_y_;
  input.revision = revision_;
  input.content_revision = content_revision_;
  input.previous = snapshot_;
  snapshot_ = internal::BuildRenderSnapshot(input);
  dirty_ = false;
  return snapshot_;
}

}  // namespace trading_charts
