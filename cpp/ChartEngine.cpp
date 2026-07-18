#include "ChartEngine.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>

namespace tradingcharts {
namespace {

constexpr size_t kFloatsPerVertex = 6;
constexpr size_t kMaxVisibleCandles = 16384;
constexpr float kTopInset = 8.0f;
constexpr double kMinYRangeMultiplier = 0.1;
constexpr double kMaxYRangeMultiplier = 10.0;

bool finite(double value) {
  return std::isfinite(value);
}

bool alignedTimestamp(double timestamp, double timeframeMs) {
  if (!(timestamp >= 0.0) || !(timeframeMs >= 1.0)) return false;
  return std::fmod(timestamp, timeframeMs) == 0.0;
}

void emitVertex(std::vector<float>& out, float x, float y, const Color& color) {
  out.push_back(x);
  out.push_back(y);
  out.push_back(color.r);
  out.push_back(color.g);
  out.push_back(color.b);
  out.push_back(color.a);
}

void emitQuad(std::vector<float>& out,
              float left,
              float top,
              float right,
              float bottom,
              const Color& color) {
  if (!(right > left) || !(bottom > top)) return;
  emitVertex(out, left, top, color);
  emitVertex(out, right, top, color);
  emitVertex(out, right, bottom, color);
  emitVertex(out, left, top, color);
  emitVertex(out, right, bottom, color);
  emitVertex(out, left, bottom, color);
}

double niceStep(double range, int targetCount, double minimum) {
  if (!(range > 0.0) || targetCount <= 0) return std::max(minimum, 1.0);
  const double raw = std::max(range / static_cast<double>(targetCount), minimum);
  const double power = std::pow(10.0, std::floor(std::log10(raw)));
  const double fraction = raw / power;
  double nice = 10.0;
  if (fraction <= 1.0) nice = 1.0;
  else if (fraction <= 2.0) nice = 2.0;
  else if (fraction <= 2.5) nice = 2.5;
  else if (fraction <= 5.0) nice = 5.0;
  return std::max(nice * power, minimum);
}

double timeStep(double span, int targetCount) {
  constexpr std::array<double, 19> candidates = {
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
  const double desired = span / static_cast<double>(std::max(targetCount, 1));
  for (double candidate : candidates) {
    if (candidate >= desired) return candidate;
  }
  return niceStep(span, targetCount, 1.0);
}

Color alpha(Color color, float value) {
  color.a *= value;
  return color;
}

}  // namespace

ChartEngine::ChartEngine() = default;

bool ChartEngine::validCandle(const Candle& candle) {
  return finite(candle.timestamp) && candle.timestamp >= 0.0 && finite(candle.open) && finite(candle.high) &&
      finite(candle.low) && finite(candle.close) && finite(candle.volume) &&
      candle.volume >= 0.0 && candle.high >= std::max(candle.open, candle.close) &&
      candle.low <= std::min(candle.open, candle.close);
}

Candle ChartEngine::candleFromValues(const double* values) {
  return Candle{values[0], values[1], values[2], values[3], values[4], values[5]};
}

void ChartEngine::markDirtyLocked() {
  ++revision_;
  dirty_ = true;
}

void ChartEngine::setConfig(const ChartConfig& config) {
  std::lock_guard<std::mutex> lock(mutex_);
  const bool viewportDefaultsChanged =
      config_.initialVisibleCount != config.initialVisibleCount ||
      config_.timeframeMs != config.timeframeMs ||
      config_.logicalSpacing != config.logicalSpacing;
  config_ = config;
  config_.timeframeMs = std::max(std::round(config_.timeframeMs), 1.0);
  config_.initialVisibleCount = std::max(config_.initialVisibleCount, 1);
  if (!finite(config_.displayScale) || !(config_.displayScale > 0.0f)) {
    config_.displayScale = 1.0f;
  }
  config_.xAxisHeight = std::max(config_.xAxisHeight, 1.0f);
  config_.yAxisWidth = std::max(config_.yAxisWidth, 1.0f);
  config_.precision = std::max(0, std::min(config_.precision, 12));
  if (!finite(config_.minMove) || !(config_.minMove > 0.0)) {
    config_.minMove = 0.01;
  }
  if (!finite(config_.yScaleMarginTop) || config_.yScaleMarginTop < 0.0 ||
      !finite(config_.yScaleMarginBottom) || config_.yScaleMarginBottom < 0.0 ||
      config_.yScaleMarginTop + config_.yScaleMarginBottom >= 1.0) {
    config_.yScaleMarginTop = 0.2;
    config_.yScaleMarginBottom = 0.1;
  }
  if (viewportDefaultsChanged && !candles_.empty()) resetViewportLocked();
  markDirtyLocked();
}

double ChartEngine::xDomainUnitLocked() const {
  return config_.logicalSpacing ? 1.0 : config_.timeframeMs;
}

double ChartEngine::candleXLocked(size_t index) const {
  return config_.logicalSpacing ? static_cast<double>(index) : candles_[index].timestamp;
}

double ChartEngine::dataXMinLocked() const {
  return candleXLocked(0) - xDomainUnitLocked() * 0.5;
}

double ChartEngine::dataXMaxLocked() const {
  return candleXLocked(candles_.size() - 1) + xDomainUnitLocked() * 2.5;
}

void ChartEngine::setSize(float width, float height) {
  std::lock_guard<std::mutex> lock(mutex_);
  const float nextWidth = std::max(width, 0.0f);
  const float nextHeight = std::max(height, 0.0f);
  if (nextWidth == width_ && nextHeight == height_) return;
  width_ = nextWidth;
  height_ = nextHeight;
  markDirtyLocked();
}

UpdateStatus ChartEngine::setHistory(const double* values, size_t valueCount) {
  if (valueCount == 0) {
    clear();
    return UpdateStatus::Applied;
  }
  if (values == nullptr || valueCount % 6 != 0) return UpdateStatus::InvalidInput;

  std::vector<Candle> next;
  next.reserve(valueCount / 6);
  double previous = -std::numeric_limits<double>::infinity();
  for (size_t i = 0; i < valueCount; i += 6) {
    Candle candle = candleFromValues(values + i);
    if (!validCandle(candle) || candle.timestamp <= previous) {
      return UpdateStatus::InvalidInput;
    }
    previous = candle.timestamp;
    next.push_back(candle);
  }

  std::lock_guard<std::mutex> lock(mutex_);
  for (const Candle& candle : next) {
    if (!alignedTimestamp(candle.timestamp, config_.timeframeMs)) {
      return UpdateStatus::InvalidInput;
    }
  }
  candles_ = std::move(next);
  lastTradeTimestamp_ = candles_.empty() ? -1.0 : candles_.back().timestamp;
  crosshairActive_ = false;
  resetViewportLocked();
  markDirtyLocked();
  return UpdateStatus::Applied;
}

UpdateStatus ChartEngine::prependHistory(const double* values, size_t valueCount) {
  if (valueCount == 0) return UpdateStatus::Applied;
  if (values == nullptr || valueCount % 6 != 0) return UpdateStatus::InvalidInput;

  std::vector<Candle> older;
  older.reserve(valueCount / 6);
  double previous = -std::numeric_limits<double>::infinity();
  for (size_t i = 0; i < valueCount; i += 6) {
    Candle candle = candleFromValues(values + i);
    if (!validCandle(candle) || candle.timestamp <= previous) {
      return UpdateStatus::InvalidInput;
    }
    previous = candle.timestamp;
    older.push_back(candle);
  }

  std::lock_guard<std::mutex> lock(mutex_);
  for (const Candle& candle : older) {
    if (!alignedTimestamp(candle.timestamp, config_.timeframeMs)) {
      return UpdateStatus::InvalidInput;
    }
  }
  if (!candles_.empty() && older.back().timestamp >= candles_.front().timestamp) {
    return UpdateStatus::InvalidInput;
  }
  if (candles_.empty()) {
    candles_ = std::move(older);
    lastTradeTimestamp_ = candles_.back().timestamp;
    resetViewportLocked();
  } else {
    if (config_.logicalSpacing && viewportInitialized_) {
      const double shift = static_cast<double>(older.size());
      visibleXMin_ += shift;
      visibleXMax_ += shift;
    }
    candles_.insert(candles_.begin(), older.begin(), older.end());
    clampViewportLocked();
  }
  crosshairActive_ = false;
  markDirtyLocked();
  return UpdateStatus::Applied;
}

UpdateStatus ChartEngine::updateCandle(const double* values, size_t valueCount) {
  if (values == nullptr || valueCount != 6) return UpdateStatus::InvalidInput;
  const Candle candle = candleFromValues(values);
  if (!validCandle(candle)) return UpdateStatus::InvalidInput;

  std::lock_guard<std::mutex> lock(mutex_);
  if (!alignedTimestamp(candle.timestamp, config_.timeframeMs)) {
    return UpdateStatus::InvalidInput;
  }
  if (candles_.empty()) {
    candles_.push_back(candle);
    lastTradeTimestamp_ = candle.timestamp;
    resetViewportLocked();
  } else if (candle.timestamp == candles_.back().timestamp) {
    candles_.back() = candle;
    lastTradeTimestamp_ = std::max(lastTradeTimestamp_, candle.timestamp);
  } else if (candle.timestamp > candles_.back().timestamp) {
    const double oldLast = candleXLocked(candles_.size() - 1);
    const bool followLiveEdge = isAtLiveEdgeLocked();
    candles_.push_back(candle);
    lastTradeTimestamp_ = candle.timestamp;
    if (followLiveEdge) {
      const double delta = candleXLocked(candles_.size() - 1) - oldLast;
      visibleXMin_ += delta;
      visibleXMax_ += delta;
      clampViewportLocked();
    }
  } else {
    return UpdateStatus::IgnoredOldTimestamp;
  }
  markDirtyLocked();
  return UpdateStatus::Applied;
}

UpdateStatus ChartEngine::updateTradeLocked(double timestamp, double price, double size) {
  if (!finite(timestamp) || timestamp < 0.0 || !finite(price) || !finite(size) || size < 0.0) {
    return UpdateStatus::InvalidInput;
  }
  if (lastTradeTimestamp_ >= 0.0 && timestamp < lastTradeTimestamp_) {
    return UpdateStatus::IgnoredOldTimestamp;
  }

  const double bucket = std::floor(timestamp / config_.timeframeMs) * config_.timeframeMs;
  if (candles_.empty()) {
    candles_.push_back(Candle{bucket, price, price, price, price, size});
    lastTradeTimestamp_ = timestamp;
    resetViewportLocked();
    return UpdateStatus::Applied;
  }

  Candle& last = candles_.back();
  if (bucket < last.timestamp) return UpdateStatus::IgnoredOldTimestamp;
  if (bucket == last.timestamp) {
    last.high = std::max(last.high, price);
    last.low = std::min(last.low, price);
    last.close = price;
    last.volume += size;
  } else {
    const double oldLast = candleXLocked(candles_.size() - 1);
    const bool followLiveEdge = isAtLiveEdgeLocked();
    candles_.push_back(Candle{bucket, price, price, price, price, size});
    if (followLiveEdge) {
      const double delta = candleXLocked(candles_.size() - 1) - oldLast;
      visibleXMin_ += delta;
      visibleXMax_ += delta;
      clampViewportLocked();
    }
  }
  lastTradeTimestamp_ = timestamp;
  return UpdateStatus::Applied;
}

UpdateStatus ChartEngine::updateTrade(const double* values, size_t valueCount) {
  if (values == nullptr || valueCount != 3) return UpdateStatus::InvalidInput;
  std::lock_guard<std::mutex> lock(mutex_);
  const UpdateStatus status = updateTradeLocked(values[0], values[1], values[2]);
  if (status == UpdateStatus::Applied) markDirtyLocked();
  return status;
}

UpdateStatus ChartEngine::updateTrades(const double* values, size_t valueCount) {
  if (valueCount == 0) return UpdateStatus::Applied;
  if (values == nullptr || valueCount % 3 != 0) return UpdateStatus::InvalidInput;
  std::lock_guard<std::mutex> lock(mutex_);
  for (size_t i = 0; i < valueCount; i += 3) {
    if (!finite(values[i]) || values[i] < 0.0 || !finite(values[i + 1]) ||
        !finite(values[i + 2]) || values[i + 2] < 0.0) {
      return UpdateStatus::InvalidInput;
    }
  }
  UpdateStatus result = UpdateStatus::Applied;
  bool changed = false;
  for (size_t i = 0; i < valueCount; i += 3) {
    const UpdateStatus status = updateTradeLocked(values[i], values[i + 1], values[i + 2]);
    if (status == UpdateStatus::InvalidInput) return status;
    if (status == UpdateStatus::IgnoredOldTimestamp) result = status;
    if (status == UpdateStatus::Applied) changed = true;
  }
  if (changed) markDirtyLocked();
  return result;
}

void ChartEngine::clear() {
  std::lock_guard<std::mutex> lock(mutex_);
  candles_.clear();
  lastTradeTimestamp_ = -1.0;
  crosshairActive_ = false;
  viewportInitialized_ = false;
  yRangeMultiplier_ = 1.0;
  visibleXMin_ = 0.0;
  visibleXMax_ = 1.0;
  markDirtyLocked();
}

void ChartEngine::resetViewportLocked() {
  yRangeMultiplier_ = 1.0;
  if (candles_.empty()) {
    viewportInitialized_ = false;
    visibleXMin_ = 0.0;
    visibleXMax_ = 1.0;
    return;
  }
  const size_t count = std::min(
      candles_.size(), static_cast<size_t>(std::max(config_.initialVisibleCount, 1)));
  const size_t begin = candles_.size() - count;
  const double unit = xDomainUnitLocked();
  visibleXMin_ = candleXLocked(begin) - unit * 0.5;
  visibleXMax_ = candleXLocked(candles_.size() - 1) + unit * 2.5;
  if (!(visibleXMax_ > visibleXMin_)) visibleXMax_ = visibleXMin_ + unit * 3.0;
  viewportInitialized_ = true;
  clampViewportLocked();
}

void ChartEngine::fitContentLocked() {
  yRangeMultiplier_ = 1.0;
  if (candles_.empty()) {
    viewportInitialized_ = false;
    visibleXMin_ = 0.0;
    visibleXMax_ = 1.0;
    return;
  }
  const double unit = xDomainUnitLocked();
  visibleXMin_ = dataXMinLocked();
  visibleXMax_ = dataXMaxLocked();
  if (!(visibleXMax_ > visibleXMin_)) {
    visibleXMax_ = visibleXMin_ + unit * 3.0;
  }
  viewportInitialized_ = true;
  clampViewportLocked();
}

void ChartEngine::clampViewportLocked() {
  if (candles_.empty() || !viewportInitialized_) return;
  const double dataMin = dataXMinLocked();
  const double dataMax = dataXMaxLocked();
  const double minimumSpan = xDomainUnitLocked() * 3.0;
  const double fullSpan = std::max(dataMax - dataMin, minimumSpan);
  double span = std::max(visibleXMax_ - visibleXMin_, minimumSpan);
  span = std::min(span, fullSpan);
  visibleXMin_ = std::max(visibleXMin_, dataMin);
  visibleXMax_ = visibleXMin_ + span;
  if (visibleXMax_ > dataMax) {
    visibleXMax_ = dataMax;
    visibleXMin_ = dataMax - span;
  }
}

bool ChartEngine::isAtLiveEdgeLocked() const {
  if (candles_.empty() || !viewportInitialized_) return false;
  const double dataMax = dataXMaxLocked();
  const float axisWidth = config_.showYAxis ? config_.yAxisWidth : 0.0f;
  const double plotWidth = std::max(static_cast<double>(width_ - axisWidth), 1.0);
  const double domainPerPixel = (visibleXMax_ - visibleXMin_) / plotWidth;
  const double tolerance = std::max(domainPerPixel, 1.0);
  return visibleXMax_ >= dataMax - tolerance;
}

bool ChartEngine::pan(float deltaPixels) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!config_.allowPan || !viewportInitialized_ || width_ <= 0.0f ||
      candles_.empty() || !std::isfinite(deltaPixels)) {
    return false;
  }
  const double previousXMin = visibleXMin_;
  const double previousXMax = visibleXMax_;
  const bool crosshairChanged = crosshairActive_;
  const float axisWidth = config_.showYAxis ? config_.yAxisWidth : 0.0f;
  const float plotWidth = std::max(width_ - axisWidth, 1.0f);
  const double delta = -static_cast<double>(deltaPixels) / plotWidth *
      (visibleXMax_ - visibleXMin_);
  visibleXMin_ += delta;
  visibleXMax_ += delta;
  crosshairActive_ = false;
  clampViewportLocked();
  const bool viewportChanged =
      visibleXMin_ != previousXMin || visibleXMax_ != previousXMax;
  if (viewportChanged || crosshairChanged) markDirtyLocked();
  return viewportChanged;
}

void ChartEngine::zoom(double scale, float focusX) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!config_.allowZoom || !viewportInitialized_ || !(scale > 0.0) || candles_.empty()) return;
  const float left = config_.showYAxis && !config_.yAxisOnRight ? config_.yAxisWidth : 0.0f;
  const float right = width_ - (config_.showYAxis && config_.yAxisOnRight ? config_.yAxisWidth : 0.0f);
  const float plotWidth = std::max(right - left, 1.0f);
  const double normalized = std::clamp(
      static_cast<double>((focusX - left) / plotWidth), 0.0, 1.0);
  const double oldSpan = visibleXMax_ - visibleXMin_;
  const double focus = visibleXMin_ + normalized * oldSpan;
  const double newSpan = oldSpan / scale;
  visibleXMin_ = focus - normalized * newSpan;
  visibleXMax_ = visibleXMin_ + newSpan;
  crosshairActive_ = false;
  clampViewportLocked();
  markDirtyLocked();
}

void ChartEngine::zoomAtRightEdge(double scale) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!viewportInitialized_ || !(scale > 0.0) || !finite(scale) || candles_.empty()) {
    return;
  }
  const double oldSpan = visibleXMax_ - visibleXMin_;
  const double newSpan = oldSpan / scale;
  visibleXMin_ = visibleXMax_ - newSpan;
  crosshairActive_ = false;
  clampViewportLocked();
  markDirtyLocked();
}

void ChartEngine::scaleY(float deltaPixels) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!config_.allowZoom || !config_.showYAxis || !viewportInitialized_ ||
      height_ <= 0.0f || candles_.empty() || !std::isfinite(deltaPixels)) {
    return;
  }
  const float axisHeight = config_.showXAxis ? config_.xAxisHeight : 0.0f;
  const float plotHeight = std::max(height_ - axisHeight - kTopInset, 1.0f);
  const double next = std::clamp(
      yRangeMultiplier_ * std::exp(static_cast<double>(deltaPixels) / plotHeight),
      kMinYRangeMultiplier, kMaxYRangeMultiplier);
  const bool crosshairChanged = crosshairActive_;
  crosshairActive_ = false;
  if (next == yRangeMultiplier_ && !crosshairChanged) return;
  yRangeMultiplier_ = next;
  markDirtyLocked();
}

void ChartEngine::resetViewport() {
  std::lock_guard<std::mutex> lock(mutex_);
  crosshairActive_ = false;
  resetViewportLocked();
  markDirtyLocked();
}

void ChartEngine::fitContent() {
  std::lock_guard<std::mutex> lock(mutex_);
  crosshairActive_ = false;
  fitContentLocked();
  markDirtyLocked();
}

void ChartEngine::setCrosshair(bool active, float x, float y) {
  std::lock_guard<std::mutex> lock(mutex_);
  const bool next = active && config_.crosshairEnabled && !candles_.empty();
  if (crosshairActive_ == next && (!next || (x == crosshairTouchX_ && y == crosshairTouchY_))) return;
  crosshairActive_ = next;
  crosshairTouchX_ = x;
  crosshairTouchY_ = y;
  markDirtyLocked();
}

size_t ChartEngine::candleCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return candles_.size();
}

Candle ChartEngine::candleAt(size_t index) const {
  std::lock_guard<std::mutex> lock(mutex_);
  return index < candles_.size() ? candles_[index] : Candle{};
}

std::shared_ptr<const RenderSnapshot> ChartEngine::snapshot() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!dirty_ && snapshot_) return snapshot_;
  snapshot_ = buildSnapshotLocked();
  dirty_ = false;
  return snapshot_;
}

std::shared_ptr<const RenderSnapshot> ChartEngine::buildSnapshotLocked() const {
  auto result = std::make_shared<RenderSnapshot>();
  result->revision = revision_;
  result->width = width_;
  result->height = height_;
  result->config = config_;
  result->visibleXMin = visibleXMin_;
  result->visibleXMax = visibleXMax_;
  result->totalCandleCount = candles_.size();

  const float yLane = config_.showYAxis ? config_.yAxisWidth : 0.0f;
  const float xLane = config_.showXAxis ? config_.xAxisHeight : 0.0f;
  result->plot.left = config_.showYAxis && !config_.yAxisOnRight ? yLane : 0.0f;
  result->plot.right = width_ - (config_.showYAxis && config_.yAxisOnRight ? yLane : 0.0f);
  result->plot.top = kTopInset;
  result->plot.bottom = height_ - xLane;
  if (result->plot.width() < 1.0f || result->plot.height() < 1.0f || candles_.empty()) {
    result->visibleYMin = 0.0;
    result->visibleYMax = 1.0;
    return result;
  }

  auto lower = candles_.begin();
  auto upper = candles_.end();
  if (config_.logicalSpacing) {
    const double lastIndex = static_cast<double>(candles_.size() - 1);
    const size_t lowerIndex = static_cast<size_t>(std::max(
        0.0, std::min(lastIndex, std::ceil(visibleXMin_))));
    const size_t upperIndex = static_cast<size_t>(std::max(
        0.0, std::min(lastIndex, std::floor(visibleXMax_)))) + 1;
    lower = candles_.begin() + static_cast<std::ptrdiff_t>(lowerIndex);
    upper = candles_.begin() + static_cast<std::ptrdiff_t>(upperIndex);
  } else {
    lower = std::lower_bound(
        candles_.begin(), candles_.end(), visibleXMin_,
        [](const Candle& candle, double value) { return candle.timestamp < value; });
    upper = std::upper_bound(
        candles_.begin(), candles_.end(), visibleXMax_,
        [](double value, const Candle& candle) { return value < candle.timestamp; });
  }
  if (lower == upper) {
    lower = candles_.begin();
    upper = candles_.end();
  }

  result->firstVisibleIndex = static_cast<size_t>(
      std::distance(candles_.begin(), lower));
  result->lastVisibleIndex = static_cast<size_t>(
      std::distance(candles_.begin(), upper) - 1);
  result->hasVisibleCandles = true;

  if (config_.logicalSpacing) {
    result->visibleXMin = lower->timestamp;
    result->visibleXMax = (upper - 1)->timestamp;
    if (!(result->visibleXMax > result->visibleXMin)) {
      result->visibleXMax = result->visibleXMin + config_.timeframeMs;
    }
  }

  double rawMin = lower->low;
  double rawMax = lower->high;
  for (auto it = lower; it != upper; ++it) {
    rawMin = std::min(rawMin, it->low);
    rawMax = std::max(rawMax, it->high);
  }
  if (!(rawMax > rawMin)) {
    const double extendValue = 5.0 * config_.minMove;
    rawMin -= extendValue;
    rawMax += extendValue;
  }
  if (!(rawMax > rawMin)) {
    rawMin = std::nextafter(rawMin, -std::numeric_limits<double>::infinity());
    rawMax = std::nextafter(rawMax, std::numeric_limits<double>::infinity());
  }

  const double rawRange = rawMax - rawMin;
  const double innerScale = 1.0 - config_.yScaleMarginTop - config_.yScaleMarginBottom;
  const double autoYMin = rawMin - rawRange * config_.yScaleMarginBottom / innerScale;
  const double autoYMax = rawMax + rawRange * config_.yScaleMarginTop / innerScale;
  const double yCenter = autoYMin + (autoYMax - autoYMin) * 0.5;
  const double yRange = (autoYMax - autoYMin) * yRangeMultiplier_;
  const double yMin = yCenter - yRange * 0.5;
  const double yMax = yCenter + yRange * 0.5;
  result->visibleYMin = yMin;
  result->visibleYMax = yMax;

  const auto projectX = [&](double value) {
    return result->plot.left + static_cast<float>(
        (value - visibleXMin_) / (visibleXMax_ - visibleXMin_)) * result->plot.width();
  };
  const auto projectY = [&](double value) {
    return result->plot.bottom - static_cast<float>((value - yMin) / (yMax - yMin)) *
        result->plot.height();
  };

  const int xTarget = std::max(
      2, static_cast<int>(result->plot.width() / (72.0f * config_.displayScale)));
  if (config_.logicalSpacing) {
    const double visibleSpan = visibleXMax_ - visibleXMin_;
    const size_t indexStep = std::max<size_t>(
        1, static_cast<size_t>(std::ceil(visibleSpan / xTarget)));
    const double firstVisibleIndex = std::max(0.0, std::ceil(visibleXMin_));
    size_t index = static_cast<size_t>(firstVisibleIndex);
    const size_t remainder = index % indexStep;
    if (remainder != 0) index += indexStep - remainder;
    for (int i = 0; i < 256 && index < candles_.size() &&
         static_cast<double>(index) <= visibleXMax_; ++i, index += indexStep) {
      result->xTicks.push_back(
          AxisTick{candles_[index].timestamp, projectX(static_cast<double>(index))});
    }
  } else {
    const double xStep = timeStep(visibleXMax_ - visibleXMin_, xTarget);
    const double firstX = std::ceil(visibleXMin_ / xStep) * xStep;
    for (int i = 0; i < 256; ++i) {
      const double value = firstX + static_cast<double>(i) * xStep;
      if (value > visibleXMax_ + xStep * 1e-9) break;
      result->xTicks.push_back(AxisTick{value, projectX(value)});
    }
  }

  const int yTarget = std::max(
      2, static_cast<int>(result->plot.height() / (44.0f * config_.displayScale)));
  const double yStep = niceStep(yMax - yMin, yTarget, config_.minMove);
  const double firstY = std::ceil(yMin / yStep) * yStep;
  for (int i = 0; i < 256; ++i) {
    const double value = firstY + static_cast<double>(i) * yStep;
    if (value > yMax + yStep * 1e-9) break;
    result->yTicks.push_back(AxisTick{value, projectY(value)});
  }

  result->vertices.reserve(
      (result->xTicks.size() + result->yTicks.size()) * 6 * kFloatsPerVertex +
      static_cast<size_t>(std::distance(lower, upper)) * 12 * kFloatsPerVertex);

  const Color grid = alpha(config_.grid, 0.75f);
  for (const AxisTick& tick : result->xTicks) {
    emitQuad(result->vertices, tick.position - 0.5f, result->plot.top,
             tick.position + 0.5f, result->plot.bottom, grid);
  }
  for (const AxisTick& tick : result->yTicks) {
    emitQuad(result->vertices, result->plot.left, tick.position - 0.5f,
             result->plot.right, tick.position + 0.5f, grid);
  }

  const size_t visibleCount = static_cast<size_t>(std::distance(lower, upper));
  const size_t stride = std::max<size_t>(1, (visibleCount + kMaxVisibleCandles - 1) /
      kMaxVisibleCandles);
  const double fallbackSlotDomain = xDomainUnitLocked() * static_cast<double>(stride);

  size_t index = static_cast<size_t>(std::distance(candles_.begin(), lower));
  const size_t end = static_cast<size_t>(std::distance(candles_.begin(), upper));
  for (; index < end; index += stride) {
    const Candle& candle = candles_[index];
    double slotDomain = fallbackSlotDomain;
    if (!config_.logicalSpacing) {
      bool hasLocalSpacing = false;
      if (index >= stride) {
        const double previousSpacing = candle.timestamp - candles_[index - stride].timestamp;
        if (previousSpacing > 0.0) {
          slotDomain = previousSpacing;
          hasLocalSpacing = true;
        }
      }
      if (index + stride < candles_.size()) {
        const double nextSpacing = candles_[index + stride].timestamp - candle.timestamp;
        if (nextSpacing > 0.0) {
          slotDomain = hasLocalSpacing ? std::min(slotDomain, nextSpacing) : nextSpacing;
        }
      }
    }
    const float slotWidth =
        static_cast<float>(slotDomain / (visibleXMax_ - visibleXMin_)) *
        result->plot.width();
    const float bodyWidth = std::clamp(slotWidth * 0.7f, 1.0f, 28.0f);
    const float wickWidth = std::clamp(bodyWidth * 0.08f, 1.0f, 2.0f);
    const float x = projectX(candleXLocked(index));
    if (x + bodyWidth < result->plot.left || x - bodyWidth > result->plot.right) continue;
    const Color color = candle.close >= candle.open ? config_.up : config_.down;
    const float wickTop = std::clamp(projectY(candle.high), result->plot.top, result->plot.bottom);
    const float wickBottom = std::clamp(projectY(candle.low), result->plot.top, result->plot.bottom);
    emitQuad(result->vertices, x - wickWidth * 0.5f, wickTop,
             x + wickWidth * 0.5f, std::max(wickBottom, wickTop + 1.0f), color);

    float bodyTop = projectY(std::max(candle.open, candle.close));
    float bodyBottom = projectY(std::min(candle.open, candle.close));
    bodyTop = std::clamp(bodyTop, result->plot.top, result->plot.bottom);
    bodyBottom = std::clamp(bodyBottom, result->plot.top, result->plot.bottom);
    if (bodyBottom - bodyTop < 1.0f) bodyBottom = bodyTop + 1.0f;
    emitQuad(result->vertices,
             std::max(result->plot.left, x - bodyWidth * 0.5f), bodyTop,
             std::min(result->plot.right, x + bodyWidth * 0.5f), bodyBottom, color);
  }

  const Candle& current = candles_.back();
  if (config_.showCurrentPrice && current.close >= yMin && current.close <= yMax) {
    result->currentPriceVisible = true;
    result->currentPrice = current.close;
    result->currentPriceY = projectY(current.close);
    result->currentPriceColor = current.close >= current.open ? config_.up : config_.down;
    for (float x = result->plot.left; x < result->plot.right; x += 6.0f) {
      emitQuad(result->vertices, x, result->currentPriceY - 0.75f,
               std::min(x + 3.0f, result->plot.right), result->currentPriceY + 0.75f,
               result->currentPriceColor);
    }
  }

  if (crosshairActive_ && config_.crosshairEnabled) {
    const float touchX = std::clamp(crosshairTouchX_, result->plot.left, result->plot.right);
    const float touchY = std::clamp(crosshairTouchY_, result->plot.top, result->plot.bottom);
    const double touchXDomain = visibleXMin_ +
        static_cast<double>((touchX - result->plot.left) / result->plot.width()) *
        (visibleXMax_ - visibleXMin_);
    auto nearest = candles_.begin();
    size_t nearestIndex = 0;
    if (config_.logicalSpacing) {
      nearestIndex = static_cast<size_t>(std::max(
          0.0, std::min(static_cast<double>(candles_.size() - 1),
                        std::round(touchXDomain))));
      nearest = candles_.begin() + static_cast<std::ptrdiff_t>(nearestIndex);
    } else {
      nearest = std::lower_bound(
          candles_.begin(), candles_.end(), touchXDomain,
          [](const Candle& candle, double value) { return candle.timestamp < value; });
      if (nearest == candles_.end()) nearest = candles_.end() - 1;
      if (nearest != candles_.begin()) {
        const auto previous = nearest - 1;
        if (touchXDomain - previous->timestamp < nearest->timestamp - touchXDomain) {
          nearest = previous;
        }
      }
      nearestIndex = static_cast<size_t>(std::distance(candles_.begin(), nearest));
    }
    result->crosshairVisible = true;
    result->selectedCandle = *nearest;
    result->crosshairX = std::clamp(
        projectX(candleXLocked(nearestIndex)), result->plot.left, result->plot.right);
    result->crosshairY = touchY;
    result->crosshairPrice = yMax -
        static_cast<double>((touchY - result->plot.top) / result->plot.height()) * (yMax - yMin);
    const Color lineColor = alpha(config_.crosshair, 0.85f);
    emitQuad(result->vertices, result->crosshairX - 0.5f, result->plot.top,
             result->crosshairX + 0.5f, result->plot.bottom, lineColor);
    emitQuad(result->vertices, result->plot.left, touchY - 0.5f,
             result->plot.right, touchY + 0.5f, lineColor);
  }

  return result;
}

}  // namespace tradingcharts
