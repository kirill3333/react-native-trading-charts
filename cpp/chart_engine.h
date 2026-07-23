// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_CHART_ENGINE_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_CHART_ENGINE_H_

#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace trading_charts {

// Positional input widths used by the native bridges.
inline constexpr size_t kCandleValueCount = 6;
inline constexpr size_t kTradeValueCount = 3;

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

enum class SeriesType : std::uint8_t {
  kCandlestick,
  kBar,
};

struct ChartConfig {
  double timeframe_ms = 60000.0;
  int initial_visible_count = 100;
  double default_scale = 1.0;
  double default_y_scale = 1.0;
  float display_scale = 1.0f;
  SeriesType series_type = SeriesType::kCandlestick;
  float bar_line_width = 1.0f;

  Color background{16.0f / 255.0f, 12.0f / 255.0f, 24.0f / 255.0f, 1.0f};
  Color grid{41.0f / 255.0f, 36.0f / 255.0f, 49.0f / 255.0f, 1.0f};
  Color axis_text{151.0f / 255.0f, 145.0f / 255.0f, 165.0f / 255.0f, 1.0f};
  Color up{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f, 1.0f};
  Color down{1.0f, 59.0f / 255.0f, 100.0f / 255.0f, 1.0f};
  Color crosshair{168.0f / 255.0f, 162.0f / 255.0f, 179.0f / 255.0f, 1.0f};
  Color tooltip_background{27.0f / 255.0f, 23.0f / 255.0f, 35.0f / 255.0f,
                           1.0f};
  Color tooltip_text{245.0f / 255.0f, 242.0f / 255.0f, 250.0f / 255.0f, 1.0f};
  Color current_price_line_up{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f,
                              1.0f};
  Color current_price_line_down{1.0f, 59.0f / 255.0f, 100.0f / 255.0f, 1.0f};
  Color current_price_label_up{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f,
                               1.0f};
  Color current_price_label_down{1.0f, 59.0f / 255.0f, 100.0f / 255.0f, 1.0f};
  float grid_opacity = 0.75f;
  float crosshair_opacity = 0.85f;

  bool show_x_axis = true;
  float x_axis_height = 26.0f;
  std::string x_locale = "en-GB";
  std::string x_time_zone = "UTC";
  bool show_seconds = false;
  bool logical_spacing = false;

  bool show_y_axis = true;
  bool y_axis_on_right = true;
  float y_axis_width = 64.0f;
  double y_scale_margin_top = 0.2;
  double y_scale_margin_bottom = 0.1;
  bool compact_values = false;
  int precision = 2;
  double min_move = 0.01;
  std::string y_locale = "en-GB";
  std::string currency_symbol;
  bool use_grouping = true;

  bool allow_pan = true;
  bool allow_zoom = true;
  bool allow_y_axis_scale = true;
  bool show_current_price = true;
  bool show_current_price_label = true;
  bool pin_current_price_to_edge = true;
  bool show_price_extremes = true;
  bool crosshair_enabled = true;
  bool show_tooltip = true;
  bool crosshair_dashed = false;
  float tooltip_background_opacity = 1.0f;
  std::string tooltip_label_open = "Open";
  std::string tooltip_label_close = "Close";
  std::string tooltip_label_high = "High";
  std::string tooltip_label_low = "Low";
  std::string tooltip_label_amplitude = "Amplitude";
  std::string tooltip_label_change_percent = "Change %";
  std::string tooltip_label_change = "Change";
  std::string tooltip_label_volume = "Volume";
};

struct Rect {
  float left = 0.0f;
  float top = 0.0f;
  float right = 0.0f;
  float bottom = 0.0f;

  float Width() const { return right - left; }
  float Height() const { return bottom - top; }
};

struct AxisTick {
  double value = 0.0;
  float position = 0.0f;
};

struct PriceExtremum {
  bool visible = false;
  double value = 0.0;
  float x = 0.0f;
  float y = 0.0f;
  bool label_on_right = true;
};

// Immutable render state published to the platform GPU and text overlays.
// All coordinates are expressed in native view coordinates.
struct RenderSnapshot {
  uint64_t revision = 0;
  uint64_t content_revision = 0;
  double visible_x_min = 0.0;
  double visible_x_max = 1.0;
  double horizontal_scale = 1.0;
  size_t first_visible_index = 0;
  size_t last_visible_index = 0;
  size_t total_candle_count = 0;
  double visible_y_min = 0.0;
  double visible_y_max = 1.0;
  double y_axis_scale = 1.0;
  double current_price = 0.0;
  double crosshair_price = 0.0;
  double selected_change = 0.0;
  double selected_change_percent = 0.0;
  double selected_amplitude_percent = 0.0;
  std::vector<float> vertices;
  std::vector<AxisTick> x_ticks;
  std::vector<AxisTick> y_ticks;
  PriceExtremum visible_maximum;
  PriceExtremum visible_minimum;
  Candle selected_candle;
  ChartConfig config;
  float width = 0.0f;
  float height = 0.0f;
  float current_price_y = 0.0f;
  float crosshair_x = 0.0f;
  float crosshair_y = 0.0f;
  Rect plot;
  Color current_price_color;
  Color current_price_label_color;
  bool has_visible_candles = false;
  bool current_price_visible = false;
  bool crosshair_visible = false;
  bool selected_percentages_valid = false;
};

enum class UpdateStatus : std::uint8_t {
  kApplied,
  kIgnoredOldTimestamp,
  kInvalidInput,
};

// Owns the candle store, viewport, gesture state, and cached render snapshot.
//
// ChartEngine is thread-safe. Public methods serialize access internally, and
// published RenderSnapshot instances remain immutable for their full lifetime.
class ChartEngine {
 public:
  ChartEngine();

  void SetConfig(const ChartConfig& config);
  void SetSize(float width, float height);

  // Replaces history from packed [time, open, high, low, close, volume]
  // records. `values` may be null only when `value_count` is zero. Timestamps
  // are milliseconds and must be strictly increasing and bucket-aligned.
  UpdateStatus SetHistory(const double* values, size_t value_count);

  // Prepends packed candle records that strictly precede existing history.
  UpdateStatus PrependHistory(const double* values, size_t value_count);

  // Inserts or replaces one packed candle record.
  UpdateStatus UpdateCandle(const double* values, size_t value_count);

  // Aggregates one packed [timestamp, price, size] trade. Older trades are
  // ignored, and empty time buckets are never synthesized.
  UpdateStatus UpdateTrade(const double* values, size_t value_count);

  // Aggregates packed trade records in their supplied order.
  UpdateStatus UpdateTrades(const double* values, size_t value_count);
  void Clear();

  bool Pan(float delta_pixels);
  bool Zoom(double scale, float focus_x);
  void ZoomAtRightEdge(double scale);
  bool ScaleY(float delta_pixels);
  void ResetViewport();
  void FitContent();
  void SetCrosshair(bool active, float x, float y);

  size_t CandleCount() const;

  // Returns a value-initialized candle when `index` is outside the store.
  Candle CandleAt(size_t index) const;
  std::vector<Candle> Candles() const;

  // Returns the cached immutable snapshot when render-relevant state has not
  // changed since the previous call.
  std::shared_ptr<const RenderSnapshot> Snapshot();

 private:
  mutable std::mutex mutex_;
  ChartConfig config_;
  std::vector<Candle> candles_;
  float width_ = 0.0f;
  float height_ = 0.0f;
  double visible_x_min_ = 0.0;
  double visible_x_max_ = 1.0;
  double horizontal_scale_base_span_ = 1.0;
  bool viewport_initialized_ = false;
  double y_range_multiplier_ = 1.0;
  bool crosshair_active_ = false;
  float crosshair_touch_x_ = 0.0f;
  float crosshair_touch_y_ = 0.0f;
  std::optional<double> last_trade_timestamp_;
  uint64_t revision_ = 0;
  uint64_t content_revision_ = 0;
  bool dirty_ = true;
  std::shared_ptr<const RenderSnapshot> snapshot_;

  // Methods suffixed with Locked require `mutex_` to be held by the caller.
  void MarkDirtyLocked();
  void MarkCrosshairDirtyLocked();
  double XDomainUnitLocked() const;
  double CandleXLocked(size_t index) const;
  double DataXMinLocked() const;
  double DataXMaxLocked() const;
  void ResetViewportLocked();
  void FitContentLocked();
  void ClampViewportLocked();
  bool IsAtLiveEdgeLocked() const;
  UpdateStatus UpdateTradeLocked(double timestamp, double price, double size);
};

}  // namespace trading_charts

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_CHART_ENGINE_H_
