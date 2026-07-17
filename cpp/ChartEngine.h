#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace tradingcharts {

struct Color {
  float r = 1.0f;
  float g = 1.0f;
  float b = 1.0f;
  float a = 1.0f;
};

struct Candle {
  double timestamp = 0.0;
  double open = 0.0;
  double high = 0.0;
  double low = 0.0;
  double close = 0.0;
  double volume = 0.0;
};

struct ChartConfig {
  double timeframeMs = 60000.0;
  int initialVisibleCount = 100;
  float displayScale = 1.0f;

  Color background{16.0f / 255.0f, 12.0f / 255.0f, 24.0f / 255.0f, 1.0f};
  Color grid{41.0f / 255.0f, 36.0f / 255.0f, 49.0f / 255.0f, 1.0f};
  Color axisText{151.0f / 255.0f, 145.0f / 255.0f, 165.0f / 255.0f, 1.0f};
  Color up{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f, 1.0f};
  Color down{1.0f, 59.0f / 255.0f, 100.0f / 255.0f, 1.0f};
  Color crosshair{168.0f / 255.0f, 162.0f / 255.0f, 179.0f / 255.0f, 1.0f};
  Color tooltipBackground{27.0f / 255.0f, 23.0f / 255.0f, 35.0f / 255.0f, 1.0f};
  Color tooltipText{245.0f / 255.0f, 242.0f / 255.0f, 250.0f / 255.0f, 1.0f};

  bool showXAxis = true;
  float xAxisHeight = 26.0f;
  std::string xLocale = "en-GB";
  std::string xTimeZone = "UTC";
  bool showSeconds = false;

  bool showYAxis = true;
  bool yAxisOnRight = true;
  float yAxisWidth = 64.0f;
  double yScaleMarginTop = 0.2;
  double yScaleMarginBottom = 0.1;
  bool compactValues = false;
  int precision = 2;
  double minMove = 0.01;
  std::string yLocale = "en-GB";
  std::string currencySymbol;
  bool useGrouping = true;

  bool allowPan = true;
  bool allowZoom = true;
  bool showCurrentPrice = true;
  bool showCurrentPriceLabel = true;
  bool crosshairEnabled = true;
  bool showTooltip = true;
};

struct Rect {
  float left = 0.0f;
  float top = 0.0f;
  float right = 0.0f;
  float bottom = 0.0f;

  float width() const { return right - left; }
  float height() const { return bottom - top; }
};

struct AxisTick {
  double value = 0.0;
  float position = 0.0f;
};

struct RenderSnapshot {
  uint64_t revision = 0;
  float width = 0.0f;
  float height = 0.0f;
  Rect plot;
  ChartConfig config;
  std::vector<float> vertices;
  std::vector<AxisTick> xTicks;
  std::vector<AxisTick> yTicks;
  double visibleXMin = 0.0;
  double visibleXMax = 1.0;
  double visibleYMin = 0.0;
  double visibleYMax = 1.0;

  bool currentPriceVisible = false;
  double currentPrice = 0.0;
  float currentPriceY = 0.0f;
  Color currentPriceColor;

  bool crosshairVisible = false;
  float crosshairX = 0.0f;
  float crosshairY = 0.0f;
  double crosshairPrice = 0.0;
  Candle selectedCandle;
};

enum class UpdateStatus {
  Applied,
  IgnoredOldTimestamp,
  InvalidInput,
};

class ChartEngine {
 public:
  ChartEngine();

  void setConfig(const ChartConfig& config);
  void setSize(float width, float height);

  UpdateStatus setHistory(const double* values, size_t valueCount);
  UpdateStatus updateCandle(const double* values, size_t valueCount);
  UpdateStatus updateTrade(const double* values, size_t valueCount);
  UpdateStatus updateTrades(const double* values, size_t valueCount);
  void clear();

  bool pan(float deltaPixels);
  void zoom(double scale, float focusX);
  void scaleY(float deltaPixels);
  void resetViewport();
  void setCrosshair(bool active, float x, float y);

  size_t candleCount() const;
  Candle candleAt(size_t index) const;
  std::shared_ptr<const RenderSnapshot> snapshot();

 private:
  mutable std::mutex mutex_;
  ChartConfig config_;
  std::vector<Candle> candles_;
  float width_ = 0.0f;
  float height_ = 0.0f;
  double visibleXMin_ = 0.0;
  double visibleXMax_ = 1.0;
  bool viewportInitialized_ = false;
  double yRangeMultiplier_ = 1.0;
  bool crosshairActive_ = false;
  float crosshairTouchX_ = 0.0f;
  float crosshairTouchY_ = 0.0f;
  double lastTradeTimestamp_ = -1.0;
  uint64_t revision_ = 0;
  bool dirty_ = true;
  std::shared_ptr<const RenderSnapshot> snapshot_;

  static bool validCandle(const Candle& candle);
  static Candle candleFromValues(const double* values);
  void markDirtyLocked();
  void resetViewportLocked();
  void clampViewportLocked();
  bool isAtLiveEdgeLocked() const;
  UpdateStatus updateTradeLocked(double timestamp, double price, double size);
  std::shared_ptr<const RenderSnapshot> buildSnapshotLocked() const;
};

}  // namespace tradingcharts
