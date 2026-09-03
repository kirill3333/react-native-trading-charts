// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_CHART_ENGINE_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_CHART_ENGINE_H_

#include <array>
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
  kCandlestick = 0,
  kBar = 1,
  kHollowCandlestick = 2,
  kHistogram = 3,
  kLine = 4,
  kArea = 5,
};

inline bool IsLineLikeSeries(SeriesType type) {
  return type == SeriesType::kLine || type == SeriesType::kArea;
}

enum class OhlcValueSource : std::uint8_t {
  kOpen = 0,
  kHigh = 1,
  kLow = 2,
  kClose = 3,
};

inline double CandleValue(const Candle& candle, OhlcValueSource source) {
  switch (source) {
    case OhlcValueSource::kOpen:
      return candle.open;
    case OhlcValueSource::kHigh:
      return candle.high;
    case OhlcValueSource::kLow:
      return candle.low;
    case OhlcValueSource::kClose:
      return candle.close;
  }
  return candle.close;
}

struct HistogramPoint {
  double timestamp = 0.0;
  double value = 0.0;
};

enum class SeriesSource : std::uint8_t {
  kData = 0,
  kOhlcvVolume = 1,
  kOhlcvRsi = 2,
  kOhlcvSma = 3,
  kOhlcvEma = 4,
  kOhlcvMacd = 5,
};

inline bool IsMovingAverageSource(SeriesSource source) {
  return source == SeriesSource::kOhlcvSma || source == SeriesSource::kOhlcvEma;
}

inline bool IsDerivedOhlcvSource(SeriesSource source) {
  return source == SeriesSource::kOhlcvVolume ||
         source == SeriesSource::kOhlcvRsi ||
         source == SeriesSource::kOhlcvMacd || IsMovingAverageSource(source);
}

struct PaneConfig {
  std::string pane_id = "main";
  std::string price_scale_id = "main";
  double height_weight = 1.0;
  double configured_height_weight = 1.0;
  float min_height = 48.0f;
  double scale_margin_top = 0.2;
  double scale_margin_bottom = 0.1;
  bool scale_visible = true;
  bool volume_format = false;
  int precision = 2;
  double min_move = 0.01;
  double y_range_multiplier = 1.0;
};

struct SeriesConfig {
  std::string series_id;
  std::string pane_id = "main";
  std::string price_scale_id = "main";
  std::string source_series_id;
  SeriesType type = SeriesType::kCandlestick;
  SeriesSource source = SeriesSource::kData;
  Color color{151.0f / 255.0f, 145.0f / 255.0f, 165.0f / 255.0f, 1.0f};
  Color up{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f, 1.0f};
  Color down{1.0f, 59.0f / 255.0f, 100.0f / 255.0f, 1.0f};
  Color line_gradient_top{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f,
                          1.0f};
  Color line_gradient_bottom{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f,
                             1.0f};
  Color area_fill_top{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f,
                      64.0f / 255.0f};
  Color area_fill_bottom{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f,
                         0.0f};
  float line_width = 1.0f;
  double line_gap_threshold_ms = 0.0;
  OhlcValueSource line_source = OhlcValueSource::kClose;
  bool line_gradient_enabled = false;
  bool line_dashed = false;
  bool visible = true;
  bool declarative = false;
  std::uint32_t moving_average_period = 1;
  std::uint32_t rsi_period = 14;
  double rsi_oversold = 30.0;
  double rsi_overbought = 70.0;
  Color rsi_text_color{151.0f / 255.0f, 145.0f / 255.0f, 165.0f / 255.0f, 1.0f};
  bool rsi_text_color_set = false;
  Color rsi_level_line{151.0f / 255.0f, 145.0f / 255.0f, 165.0f / 255.0f, 0.5f};
  Color rsi_band{151.0f / 255.0f, 145.0f / 255.0f, 165.0f / 255.0f,
                 20.0f / 255.0f};
  std::uint32_t macd_fast_period = 12;
  std::uint32_t macd_slow_period = 26;
  std::uint32_t macd_signal_period = 9;
  float macd_signal_line_width = 1.0f;
  Color macd_signal_color{151.0f / 255.0f, 145.0f / 255.0f, 165.0f / 255.0f,
                          1.0f};
  Color macd_signal_gradient_top{151.0f / 255.0f, 145.0f / 255.0f,
                                 165.0f / 255.0f, 1.0f};
  Color macd_signal_gradient_bottom{151.0f / 255.0f, 145.0f / 255.0f,
                                    165.0f / 255.0f, 1.0f};
  bool macd_signal_gradient_enabled = false;
  bool macd_signal_line_dashed = false;
  Color macd_positive_increasing = up;
  Color macd_positive_decreasing{up.r, up.g, up.b, 0.5f};
  Color macd_negative_increasing{down.r, down.g, down.b, 0.5f};
  Color macd_negative_decreasing = down;
  Color macd_zero_line{151.0f / 255.0f, 145.0f / 255.0f, 165.0f / 255.0f, 1.0f};
  Color macd_text_color{151.0f / 255.0f, 145.0f / 255.0f, 165.0f / 255.0f,
                        1.0f};
  bool macd_text_color_set = false;
};

struct RsiSmoothingState {
  double average_gain = 0.0;
  double average_loss = 0.0;
};

struct MacdSmoothingState {
  double fast = 0.0;
  double slow = 0.0;
  double signal = 0.0;
  double fast_sum = 0.0;
  double slow_sum = 0.0;
  double signal_sum = 0.0;
  std::uint32_t signal_count = 0;
  bool fast_ready = false;
  bool slow_ready = false;
  bool signal_ready = false;
};

enum class SeriesSourceBindingKind : std::uint8_t {
  kUnavailable = 0,
  kMain = 1,
  kAdditional = 2,
};

struct SeriesSourceBinding {
  SeriesSourceBindingKind kind = SeriesSourceBindingKind::kUnavailable;
  size_t additional_series_index = 0;
};

struct SeriesData {
  SeriesConfig config;
  std::vector<Candle> candles;
  std::vector<HistogramPoint> histogram;
  std::vector<Candle> signal_candles;
  // SMA stores the rolling window sum; EMA stores the published EMA value.
  std::vector<double> moving_average_states;
  std::vector<RsiSmoothingState> rsi_states;
  std::vector<MacdSmoothingState> macd_states;
  std::optional<size_t> pane_index;
  SeriesSourceBinding source_binding;
};

enum class ResolutionUnit : std::uint8_t {
  kFixed = 0,
  kSecond = 1,
  kMinute = 2,
  kHour = 3,
  kDay = 4,
  kWeek = 5,
  kMonth = 6,
};

struct Resolution {
  ResolutionUnit unit = ResolutionUnit::kMinute;
  std::uint32_t multiplier = 1;
  std::int64_t fixed_duration_ms = 60000;
};

enum class BucketOrigin : std::uint8_t {
  kEpoch = 0,
  kSession = 1,
  kTimestamp = 2,
};

enum class OutsideSessionPolicy : std::uint8_t {
  kIgnore = 0,
  kReject = 1,
};

enum class CandleTimestampPolicy : std::uint8_t {
  kBucketStart = 0,
  kTradingDateUtc = 1,
};

struct CivilDate {
  int year = 1970;
  int month = 1;
  int day = 1;
};

struct TimeZoneTransition {
  std::int64_t at_utc_ms = 0;
  int offset_seconds = 0;
};

struct TradingSessionConfig {
  // ISO weekdays, bit 0 = Monday and bit 6 = Sunday. Overrides ignore this.
  std::uint8_t weekday_mask = 0;
  int start_seconds = 0;
  int end_seconds = 0;
  int start_day_offset = 0;
  int end_day_offset = 0;
};

struct TradingCalendarOverrideConfig {
  CivilDate date;
  std::vector<TradingSessionConfig> sessions;
};

struct TradingCalendarConfig {
  std::string time_zone = "UTC";
  std::vector<TimeZoneTransition> transitions{{0, 0}};
  std::int64_t transition_range_start_ms = 0;
  std::int64_t transition_range_end_ms = 4133980800000LL;  // 2101-01-01.
  std::vector<TradingSessionConfig> sessions;
  std::vector<CivilDate> holidays;
  std::vector<TradingCalendarOverrideConfig> overrides;
  int week_starts_on = 1;  // ISO Monday=1, Sunday=7.
  bool configured = false;
};

struct TradeAggregationConfig {
  BucketOrigin bucket_origin = BucketOrigin::kEpoch;
  std::int64_t origin_timestamp_ms = 0;
  OutsideSessionPolicy outside_session = OutsideSessionPolicy::kIgnore;
  CandleTimestampPolicy candle_timestamp = CandleTimestampPolicy::kBucketStart;
  TradingCalendarConfig calendar;
};

struct ChartConfig {
  Resolution resolution;
  TradeAggregationConfig trade_aggregation;
  int initial_visible_count = 100;
  double default_scale = 1.0;
  double default_y_scale = 1.0;
  float display_scale = 1.0f;
  SeriesType series_type = SeriesType::kCandlestick;
  float candle_radius = 0.0f;
  float bar_line_width = 1.0f;
  float line_width = 1.5f;
  double line_gap_threshold_ms = 0.0;
  OhlcValueSource line_source = OhlcValueSource::kClose;
  bool line_gradient_enabled = false;
  bool line_dashed = false;

  Color background{16.0f / 255.0f, 12.0f / 255.0f, 24.0f / 255.0f, 1.0f};
  Color grid{41.0f / 255.0f, 36.0f / 255.0f, 49.0f / 255.0f, 1.0f};
  Color axis_text{151.0f / 255.0f, 145.0f / 255.0f, 165.0f / 255.0f, 1.0f};
  Color up{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f, 1.0f};
  Color down{1.0f, 59.0f / 255.0f, 100.0f / 255.0f, 1.0f};
  Color line{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f, 1.0f};
  Color line_gradient_top{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f,
                          1.0f};
  Color line_gradient_bottom{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f,
                             1.0f};
  Color area_fill_top{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f,
                      64.0f / 255.0f};
  Color area_fill_bottom{56.0f / 255.0f, 217.0f / 255.0f, 138.0f / 255.0f,
                         0.0f};
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
  bool grid_visible = true;
};

struct PriceExtremum {
  bool visible = false;
  double value = 0.0;
  float x = 0.0f;
  float y = 0.0f;
  bool label_on_right = true;
};

struct PriceLine {
  std::string id;
  double price = 0.0;
  std::string label;
  std::string color_hex;
  Color color;
};

struct PriceLineSnapshot {
  std::string id;
  double price = 0.0;
  std::string label;
  Color color;
  float y = 0.0f;
};

struct YAxisValue {
  std::string pane_id;
  std::string price_scale_id;
  double price = 0.0;
  size_t pane_index = 0;
};

struct PaneSnapshot {
  std::string pane_id;
  std::string price_scale_id;
  Rect plot;
  double height_weight = 1.0;
  double visible_y_min = 0.0;
  double visible_y_max = 1.0;
  double y_axis_scale = 1.0;
  size_t y_tick_offset = 0;
  size_t y_tick_count = 0;
  bool scale_visible = true;
  bool volume_format = false;
  bool rsi_scale = false;
  int precision = 2;
};

enum class IndicatorKind : std::uint8_t {
  kRsi = 0,
  kMacd = 1,
};

struct IndicatorLegendValue {
  double value = 0.0;
  double latest_value = 0.0;
  Color color;
  bool has_value = false;
  bool has_latest_value = false;
};

struct IndicatorLegend {
  std::string pane_id;
  size_t pane_index = 0;
  IndicatorKind kind = IndicatorKind::kRsi;
  std::uint32_t period = 14;
  std::uint32_t fast_period = 12;
  std::uint32_t slow_period = 26;
  std::uint32_t signal_period = 9;
  OhlcValueSource value_source = OhlcValueSource::kClose;
  Color text_color;
  bool text_color_set = false;
  size_t value_count = 0;
  std::array<IndicatorLegendValue, 3> values;
};

enum class CrosshairSeriesValueKind : std::uint8_t {
  kOhlc = 0,
  kScalar = 1,
  kMacd = 2,
};

struct CrosshairSeriesValue {
  std::string series_id;
  std::string pane_id;
  std::string price_scale_id;
  CrosshairSeriesValueKind kind = CrosshairSeriesValueKind::kScalar;
  SeriesType series_type = SeriesType::kLine;
  SeriesSource source_type = SeriesSource::kData;
  Candle candle;
  double value = 0.0;
  double macd = 0.0;
  double signal = 0.0;
  double histogram = 0.0;
  bool has_value = false;
  bool has_macd = false;
  bool has_signal = false;
  bool has_histogram = false;
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
  // Content geometry (grid, series, pane separators, current price) changes
  // only with content_revision and is shared between consecutive snapshots
  // without copying. Null when there is no drawable content.
  std::shared_ptr<const std::vector<float>> content_vertices;
  // Overlay geometry (crosshair) is rebuilt with every revision.
  std::vector<float> overlay_vertices;
  std::vector<AxisTick> x_ticks;
  std::vector<AxisTick> y_ticks;
  std::vector<AxisTick> pane_y_ticks;
  std::vector<PaneSnapshot> panes;
  std::vector<IndicatorLegend> indicator_legends;
  std::vector<CrosshairSeriesValue> crosshair_series_values;
  std::vector<PriceLineSnapshot> price_lines;
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
  size_t active_pane_index = 0;
};

enum class UpdateStatus : std::uint8_t {
  kApplied,
  kIgnoredOldTimestamp,
  kInvalidInput,
  kIgnoredOutsideSession,
};

// Owns the candle store, viewport, gesture state, and cached render snapshot.
//
// ChartEngine is thread-safe. Public methods serialize access internally, and
// published RenderSnapshot instances remain immutable for their full lifetime.
class ChartEngine {
 public:
  ChartEngine();

  void SetConfig(const ChartConfig& config);
  void SetTradingCalendar(const TradingCalendarConfig& calendar);
  void SetPanes(const std::vector<PaneConfig>& panes, bool resizable);
  UpdateStatus AddSeries(const SeriesConfig& config);
  bool RemoveSeries(const std::string& series_id);
  UpdateStatus SetSeriesData(const std::string& series_id, const double* values,
                             size_t value_count, bool histogram);
  UpdateStatus PrependSeriesData(const std::string& series_id,
                                 const double* values, size_t value_count,
                                 bool histogram);
  UpdateStatus UpdateSeriesData(const std::string& series_id,
                                const double* values, size_t value_count,
                                bool histogram);
  bool SetPaneHeight(const std::string& pane_id, double height_weight);
  bool SetPriceLine(const PriceLine& price_line);
  bool RemovePriceLine(const std::string& price_line_id);
  bool ClearPriceLines();
  std::vector<PriceLine> PriceLines() const;
  size_t PriceLineCount() const;
  PriceLine PriceLineAt(size_t index) const;
  bool ResizePaneSeparator(size_t separator_index, float delta_pixels);
  std::optional<size_t> SeparatorAt(float y, float hit_slop) const;
  void SetSize(float width, float height);

  // Replaces history from packed [time, open, high, low, close, volume]
  // records. `values` may be null only when `value_count` is zero. Timestamps
  // are milliseconds and must be strictly increasing. Ready-candle feeds own
  // their timestamp semantics; trade aggregation alignment does not apply.
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
  // Programmatic zoom anchored at the live edge. Intentionally not gated by
  // `allow_zoom`, which only restricts the pinch gesture.
  void ZoomAtRightEdge(double scale);
  bool ScaleY(float delta_pixels);
  bool ScaleYAt(float delta_pixels, float y);
  void ResetViewport();
  void FitContent();
  void SetCrosshair(bool active, float x, float y);
  std::optional<YAxisValue> YAxisValueAt(float y);

  size_t CandleCount() const;

  // Current render revision. Cheaper than Snapshot() when the caller only
  // needs to know whether render-relevant state changed.
  uint64_t Revision() const;

  // Returns a value-initialized candle when `index` is outside the store.
  Candle CandleAt(size_t index) const;
  std::vector<Candle> Candles() const;

  // Returns the cached immutable snapshot when render-relevant state has not
  // changed since the previous call.
  std::shared_ptr<const RenderSnapshot> Snapshot();

 private:
  friend class ChartEngineTestAccess;

  enum class MutationKind : std::uint8_t {
    kNone,
    kOverlay,
    kContent,
  };

  enum class TradeApplyStatus : std::uint8_t {
    kApplied,
    kIgnoredOldTimestamp,
    kIgnoredOutsideSession,
  };

  // Owns the engine lock and publishes the strongest render mutation recorded
  // during its lifetime. Destruction happens before the lock is released, so
  // early returns and exceptions cannot leave the snapshot cache stale.
  class MutationScope {
   public:
    explicit MutationScope(ChartEngine& engine);
    ~MutationScope() noexcept;

    MutationScope(const MutationScope&) = delete;
    MutationScope& operator=(const MutationScope&) = delete;

    void ContentChanged() noexcept;
    void OverlayChanged() noexcept;

   private:
    ChartEngine& engine_;
    std::unique_lock<std::mutex> lock_;
    MutationKind kind_ = MutationKind::kNone;
  };

  mutable std::mutex mutex_;
  ChartConfig config_;
  std::vector<Candle> candles_;
  std::vector<PaneConfig> panes_{PaneConfig{}};
  std::vector<SeriesData> additional_series_;
  std::vector<PriceLine> price_lines_;
  bool panes_resizable_ = false;
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
  void ResetViewportLocked(MutationScope& mutation);
  void FitContentLocked(MutationScope& mutation);
  size_t PaneIndexAtYLocked(float y) const;
  size_t PaneIndexAtYLocked(float y, const std::vector<Rect>& rects) const;
  std::vector<Rect> PaneRectsLocked() const;
  // Nullable borrowed lookups. Returned pointers remain valid only while the
  // caller holds `mutex_` and does not mutate `additional_series_`.
  SeriesData* FindSeriesLocked(const std::string& series_id);
  const SeriesData* FindSeriesLocked(const std::string& series_id) const;
  void RebuildSeriesIndicesLocked(MutationScope& mutation);
  // A null result is expected while a declarative derived series is waiting
  // for a later source declaration. Invalid resolved indices assert in debug.
  const std::vector<Candle>* SourceCandlesLocked(
      const SeriesData& series) const;
  void RefreshDerivedDependentsLocked(const std::string& source_series_id,
                                      size_t first_changed_source_index,
                                      MutationScope& mutation);
  void RebuildAllDerivedSeriesLocked(MutationScope& mutation);
  bool PaneHasRsiLocked(size_t pane_index) const;
  bool PaneHasMacdLocked(size_t pane_index) const;
  void ClampViewportValuesLocked(double* visible_x_min,
                                 double* visible_x_max) const;
  bool IsAtLiveEdgeLocked() const;
  bool ValidateTradeSequenceLocked(const double* values,
                                   size_t value_count) const;
  TradeApplyStatus ApplyValidatedTradeLocked(double timestamp, double price,
                                             double size,
                                             MutationScope& mutation);
};

}  // namespace trading_charts

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_CHART_ENGINE_H_
