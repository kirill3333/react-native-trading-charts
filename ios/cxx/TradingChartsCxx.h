// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_IOS_CXX_TRADINGCHARTSCXX_H_
#define REACT_NATIVE_TRADING_CHARTS_IOS_CXX_TRADINGCHARTSCXX_H_

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "cpp/chart_engine.h"

namespace trading_charts::swift_interop {

using PaneVector = std::vector<PaneConfig>;
using SessionVector = std::vector<TradingSessionConfig>;
using TransitionVector = std::vector<TimeZoneTransition>;
using DateVector = std::vector<CivilDate>;
using OverrideVector = std::vector<TradingCalendarOverrideConfig>;

struct YAxisHitResult {
  bool valid = false;
  YAxisValue value;
};

// Copyable value handle imported by Swift. Copies retain the shared engine,
// while all chart semantics remain implemented by ChartEngine.
class ChartEngineHandle {
 public:
  ChartEngineHandle() : engine_(std::make_shared<ChartEngine>()) {}

  void SetConfig(const ChartConfig& config) { engine_->SetConfig(config); }
  void SetPanes(const std::vector<PaneConfig>& panes, bool resizable) {
    engine_->SetPanes(panes, resizable);
  }
  UpdateStatus AddSeries(const SeriesConfig& config) {
    return engine_->AddSeries(config);
  }
  bool RemoveSeries(const std::string& series_id) {
    return engine_->RemoveSeries(series_id);
  }
  UpdateStatus SetSeriesData(const std::string& series_id,
                             const double* values, size_t value_count,
                             bool histogram) {
    return engine_->SetSeriesData(series_id, values, value_count, histogram);
  }
  UpdateStatus PrependSeriesData(const std::string& series_id,
                                 const double* values, size_t value_count,
                                 bool histogram) {
    return engine_->PrependSeriesData(series_id, values, value_count,
                                      histogram);
  }
  UpdateStatus UpdateSeriesData(const std::string& series_id,
                                const double* values, size_t value_count,
                                bool histogram) {
    return engine_->UpdateSeriesData(series_id, values, value_count, histogram);
  }
  bool SetPaneHeight(const std::string& pane_id, double height_weight) {
    return engine_->SetPaneHeight(pane_id, height_weight);
  }
  bool SetPriceLine(const PriceLine& price_line) {
    return engine_->SetPriceLine(price_line);
  }
  bool RemovePriceLine(const std::string& price_line_id) {
    return engine_->RemovePriceLine(price_line_id);
  }
  bool ClearPriceLines() { return engine_->ClearPriceLines(); }
  size_t PriceLineCount() const { return engine_->PriceLineCount(); }
  PriceLine PriceLineAt(size_t index) const {
    return engine_->PriceLineAt(index);
  }
  bool ResizePaneSeparator(size_t separator_index, float delta_pixels) {
    return engine_->ResizePaneSeparator(separator_index, delta_pixels);
  }
  std::int64_t SeparatorAt(float y, float hit_slop) const {
    const auto separator = engine_->SeparatorAt(y, hit_slop);
    return separator.has_value() ? static_cast<std::int64_t>(*separator) : -1;
  }
  void SetSize(float width, float height) { engine_->SetSize(width, height); }

  UpdateStatus SetHistory(const double* values, size_t value_count) {
    return engine_->SetHistory(values, value_count);
  }
  UpdateStatus PrependHistory(const double* values, size_t value_count) {
    return engine_->PrependHistory(values, value_count);
  }
  UpdateStatus UpdateCandle(const double* values, size_t value_count) {
    return engine_->UpdateCandle(values, value_count);
  }
  UpdateStatus UpdateTrade(const double* values, size_t value_count) {
    return engine_->UpdateTrade(values, value_count);
  }
  UpdateStatus UpdateTrades(const double* values, size_t value_count) {
    return engine_->UpdateTrades(values, value_count);
  }
  void Clear() { engine_->Clear(); }

  bool Pan(float delta_pixels) { return engine_->Pan(delta_pixels); }
  bool Zoom(double scale, float focus_x) {
    return engine_->Zoom(scale, focus_x);
  }
  void ZoomAtRightEdge(double scale) { engine_->ZoomAtRightEdge(scale); }
  bool ScaleY(float delta_pixels) { return engine_->ScaleY(delta_pixels); }
  bool ScaleYAt(float delta_pixels, float y) {
    return engine_->ScaleYAt(delta_pixels, y);
  }
  void FitContent() { engine_->FitContent(); }
  void SetCrosshair(bool active, float x, float y) {
    engine_->SetCrosshair(active, x, y);
  }
  YAxisHitResult YAxisValueAt(float y) {
    const auto value = engine_->YAxisValueAt(y);
    return value.has_value() ? YAxisHitResult{true, *value}
                             : YAxisHitResult{};
  }

  size_t CandleCount() const { return engine_->CandleCount(); }
  Candle CandleAt(size_t index) const { return engine_->CandleAt(index); }

  std::shared_ptr<const RenderSnapshot> SnapshotPointer() {
    return engine_->Snapshot();
  }

 private:
  std::shared_ptr<ChartEngine> engine_;
};

// Keeps the immutable RenderSnapshot alive while Swift reads metadata or
// performs the synchronous Metal buffer copy.
class RenderSnapshotHandle {
 public:
  RenderSnapshotHandle() = default;
  explicit RenderSnapshotHandle(std::shared_ptr<const RenderSnapshot> snapshot)
      : snapshot_(std::move(snapshot)) {}

  bool IsValid() const { return static_cast<bool>(snapshot_); }
  uint64_t Revision() const { return snapshot_ ? snapshot_->revision : 0; }
  uint64_t ContentRevision() const {
    return snapshot_ ? snapshot_->content_revision : 0;
  }
  const float* ContentVerticesData() const {
    if (!snapshot_ || !snapshot_->content_vertices ||
        snapshot_->content_vertices->empty()) {
      return nullptr;
    }
    return snapshot_->content_vertices->data();
  }
  size_t ContentVerticesCount() const {
    return snapshot_ && snapshot_->content_vertices
        ? snapshot_->content_vertices->size()
        : 0;
  }
  const float* OverlayVerticesData() const {
    return snapshot_ && !snapshot_->overlay_vertices.empty()
        ? snapshot_->overlay_vertices.data()
        : nullptr;
  }
  size_t OverlayVerticesCount() const {
    return snapshot_ ? snapshot_->overlay_vertices.size() : 0;
  }

  double VisibleXMin() const { return snapshot_->visible_x_min; }
  double VisibleXMax() const { return snapshot_->visible_x_max; }
  double HorizontalScale() const { return snapshot_->horizontal_scale; }
  size_t FirstVisibleIndex() const { return snapshot_->first_visible_index; }
  size_t LastVisibleIndex() const { return snapshot_->last_visible_index; }
  size_t TotalCandleCount() const { return snapshot_->total_candle_count; }
  double VisibleYMin() const { return snapshot_->visible_y_min; }
  double VisibleYMax() const { return snapshot_->visible_y_max; }
  double YAxisScale() const { return snapshot_->y_axis_scale; }
  double CurrentPrice() const { return snapshot_->current_price; }
  double CrosshairPrice() const { return snapshot_->crosshair_price; }
  double SelectedChange() const { return snapshot_->selected_change; }
  double SelectedChangePercent() const {
    return snapshot_->selected_change_percent;
  }
  double SelectedAmplitudePercent() const {
    return snapshot_->selected_amplitude_percent;
  }
  float Width() const { return snapshot_->width; }
  float Height() const { return snapshot_->height; }
  float CurrentPriceY() const { return snapshot_->current_price_y; }
  float CrosshairX() const { return snapshot_->crosshair_x; }
  float CrosshairY() const { return snapshot_->crosshair_y; }
  Rect Plot() const { return snapshot_->plot; }
  Color CurrentPriceColor() const { return snapshot_->current_price_color; }
  Color CurrentPriceLabelColor() const {
    return snapshot_->current_price_label_color;
  }
  bool HasVisibleCandles() const { return snapshot_->has_visible_candles; }
  bool CurrentPriceVisible() const { return snapshot_->current_price_visible; }
  bool CrosshairVisible() const { return snapshot_->crosshair_visible; }
  bool SelectedPercentagesValid() const {
    return snapshot_->selected_percentages_valid;
  }
  size_t ActivePaneIndex() const { return snapshot_->active_pane_index; }
  Candle SelectedCandle() const { return snapshot_->selected_candle; }
  PriceExtremum VisibleMaximum() const { return snapshot_->visible_maximum; }
  PriceExtremum VisibleMinimum() const { return snapshot_->visible_minimum; }

  size_t XTickCount() const { return snapshot_->x_ticks.size(); }
  AxisTick XTickAt(size_t index) const { return snapshot_->x_ticks.at(index); }
  size_t YTickCount() const { return snapshot_->y_ticks.size(); }
  AxisTick YTickAt(size_t index) const { return snapshot_->y_ticks.at(index); }
  size_t PaneYTickCount() const { return snapshot_->pane_y_ticks.size(); }
  AxisTick PaneYTickAt(size_t index) const {
    return snapshot_->pane_y_ticks.at(index);
  }
  size_t PaneCount() const { return snapshot_->panes.size(); }
  PaneSnapshot PaneAt(size_t index) const { return snapshot_->panes.at(index); }
  size_t IndicatorLegendCount() const {
    return snapshot_->indicator_legends.size();
  }
  IndicatorLegend IndicatorLegendAt(size_t index) const {
    return snapshot_->indicator_legends.at(index);
  }
  IndicatorLegendValue IndicatorLegendValueAt(size_t legend_index,
                                               size_t value_index) const {
    return snapshot_->indicator_legends.at(legend_index).values.at(value_index);
  }
  size_t CrosshairSeriesValueCount() const {
    return snapshot_->crosshair_series_values.size();
  }
  CrosshairSeriesValue CrosshairSeriesValueAt(size_t index) const {
    return snapshot_->crosshair_series_values.at(index);
  }
  size_t PriceLineCount() const { return snapshot_->price_lines.size(); }
  PriceLineSnapshot PriceLineAt(size_t index) const {
    return snapshot_->price_lines.at(index);
  }

 private:
  std::shared_ptr<const RenderSnapshot> snapshot_;
};

inline RenderSnapshotHandle Snapshot(ChartEngineHandle& engine) {
  return RenderSnapshotHandle(engine.SnapshotPointer());
}

// Top-level pointer accessors remain available to Swift as explicitly unsafe
// functions. Swift wraps them in non-escaping closures and keeps the handle
// alive for the entire call.
inline const float* ContentVerticesData(const RenderSnapshotHandle& snapshot) {
  return snapshot.ContentVerticesData();
}

inline const float* OverlayVerticesData(const RenderSnapshotHandle& snapshot) {
  return snapshot.OverlayVerticesData();
}

inline void AppendPane(std::vector<PaneConfig>& panes,
                       const PaneConfig& pane) {
  panes.push_back(pane);
}

inline void AppendSession(std::vector<TradingSessionConfig>& sessions,
                          const TradingSessionConfig& session) {
  sessions.push_back(session);
}

inline void AppendTransition(std::vector<TimeZoneTransition>& transitions,
                             const TimeZoneTransition& transition) {
  transitions.push_back(transition);
}

inline void AppendDate(std::vector<CivilDate>& dates, const CivilDate& date) {
  dates.push_back(date);
}

inline void AppendOverride(
    std::vector<TradingCalendarOverrideConfig>& overrides,
    const TradingCalendarOverrideConfig& override_config) {
  overrides.push_back(override_config);
}

}  // namespace trading_charts::swift_interop

#endif  // REACT_NATIVE_TRADING_CHARTS_IOS_CXX_TRADINGCHARTSCXX_H_
