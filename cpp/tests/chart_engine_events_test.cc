// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <array>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <iterator>
#include <limits>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/indicator_series.h"
#include "cpp/internal/render_snapshot_builder.h"
#include "cpp/tests/chart_engine_test_helpers.h"
#include "cpp/tests/chart_engine_test_suites.h"

namespace trading_charts::test {

namespace {

void TestViewportAndOverlayMutationContract() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 3;
  engine.SetConfig(config);
  engine.SetSize(400.0F, 300.0F);
  const double history[] = {
      0.0,      10.0, 12.0, 9.0,      11.0, 1.0,  60000.0,  11.0, 13.0,
      10.0,     12.0, 1.0,  120000.0, 12.0, 14.0, 11.0,     13.0, 1.0,
      180000.0, 13.0, 15.0, 12.0,     14.0, 1.0,  240000.0, 14.0, 16.0,
      13.0,     15.0, 1.0,  300000.0, 15.0, 17.0, 14.0,     16.0, 1.0,
  };
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);

  ExpectNoRenderMutation(engine, [&] { assert(!engine.Pan(0.0F)); });
  ExpectContentMutation(engine, [&] { assert(engine.Pan(80.0F)); });
  ExpectContentMutation(engine, [&] { assert(engine.Zoom(1.5, 200.0F)); });
  ExpectContentMutation(engine, [&] { engine.ZoomAtRightEdge(1.2); });
  ExpectContentMutation(engine, [&] { assert(engine.ScaleY(20.0F)); });
  ExpectContentMutation(engine,
                        [&] { assert(engine.ScaleYAt(-10.0F, 100.0F)); });
  ExpectContentMutation(engine, [&] { engine.ResetViewport(); });
  ExpectContentMutation(engine, [&] { engine.FitContent(); });

  ExpectOverlayMutation(engine,
                        [&] { engine.SetCrosshair(true, 120.0F, 100.0F); });
  ExpectNoRenderMutation(engine,
                         [&] { engine.SetCrosshair(true, 120.0F, 100.0F); });
  ExpectOverlayMutation(engine, [&] { assert(engine.Pan(0.0F)); });

  engine.SetCrosshair(true, 120.0F, 100.0F);
  ExpectOverlayMutation(engine, [&] { assert(engine.Zoom(1.0, 200.0F)); });
  engine.SetCrosshair(true, 120.0F, 100.0F);
  ExpectOverlayMutation(engine, [&] { assert(engine.ScaleYAt(0.0F, 100.0F)); });

  ExpectNoRenderMutation(engine, [&] {
    assert(!engine.Pan(std::numeric_limits<float>::quiet_NaN()));
  });
  ExpectNoRenderMutation(engine, [&] { assert(!engine.Zoom(0.0, 200.0F)); });
  ExpectNoRenderMutation(engine, [&] { engine.ZoomAtRightEdge(0.0); });
}

void TestCrosshairUsesAutoscaleInverse() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {0.0, 1.0004, 1.0005, 1.0004, 1.00045, 1.0};
  assert(engine.SetHistory(history, 6) == UpdateStatus::kApplied);
  const auto initial = engine.Snapshot();
  ExpectNear(initial->y_axis_scale, 1.0);

  engine.SetCrosshair(true, 400.0f, initial->current_price_y);
  const auto snapshot = engine.Snapshot();
  ExpectNear(snapshot->crosshair_price, 1.00045);
}

void TestYAxisScaleDirectionLimitsAndCrosshair() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {0.0, 10.0, 20.0, 10.0, 15.0, 1.0};
  assert(engine.SetHistory(history, 6) == UpdateStatus::kApplied);

  const auto initial = engine.Snapshot();
  const double initial_span = initial->visible_y_max - initial->visible_y_min;
  const double initial_center =
      (initial->visible_y_max + initial->visible_y_min) * 0.5;
  const float half_scale_drag =
      static_cast<float>(-initial->plot.Height() * std::log(2.0));
  engine.ScaleY(half_scale_drag);

  const auto zoomed = engine.Snapshot();
  ExpectNear(zoomed->y_axis_scale, 2.0, 1e-6);
  ExpectNear(zoomed->visible_y_max - zoomed->visible_y_min, initial_span * 0.5,
             1e-6);
  ExpectNear((zoomed->visible_y_max + zoomed->visible_y_min) * 0.5,
             initial_center, 1e-9);

  const double target_price = initial_center;
  const float target_y =
      zoomed->plot.bottom -
      static_cast<float>((target_price - zoomed->visible_y_min) /
                         (zoomed->visible_y_max - zoomed->visible_y_min)) *
          zoomed->plot.Height();
  engine.SetCrosshair(true, 400.0f, target_y);
  ExpectNear(engine.Snapshot()->crosshair_price, target_price, 1e-6);
  engine.ScaleY(0.0f);
  assert(!engine.Snapshot()->crosshair_visible);

  engine.ResetViewport();
  assert(engine.ScaleY(-initial->plot.Height() * 100.0f));
  const auto minimum = engine.Snapshot();
  ExpectNear(minimum->visible_y_max - minimum->visible_y_min,
             initial_span * 0.1, 1e-6);
  assert(!engine.ScaleY(-initial->plot.Height()));

  engine.ResetViewport();
  assert(engine.ScaleY(initial->plot.Height() * 100.0f));
  const auto maximum = engine.Snapshot();
  ExpectNear(maximum->visible_y_max - maximum->visible_y_min,
             initial_span * 10.0, 1e-6);
  assert(!engine.ScaleY(initial->plot.Height()));
}

void TestCrosshairStatisticsAndLineStyles() {
  ChartEngine engine;
  ChartConfig config;
  config.show_x_axis = false;
  config.show_y_axis = false;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);

  const double bullish[] = {0.0, 10.0, 15.0, 8.0, 12.0, 5.0};
  assert(engine.SetHistory(bullish, 6) == UpdateStatus::kApplied);
  const auto base = engine.Snapshot();
  engine.SetCrosshair(true, 400.0f, 220.0f);
  const auto solid = engine.Snapshot();
  ExpectNear(solid->selected_change, 2.0);
  ExpectNear(solid->selected_change_percent, 20.0);
  ExpectNear(solid->selected_amplitude_percent, 70.0);
  assert(solid->selected_percentages_valid);
  constexpr size_t kSolidCrosshairVertexFloatCount = size_t{2} * 6 * 6;
  assert(solid->overlay_vertices.size() == kSolidCrosshairVertexFloatCount);
  // Crosshair-only updates reuse the content geometry without copying it.
  assert(solid->content_vertices == base->content_vertices);
  assert(solid->content_revision == base->content_revision);
  assert(solid->revision > base->revision);

  engine.SetCrosshair(false, 0.0f, 0.0f);
  config.crosshair_dashed = true;
  config.display_scale = 2.0f;
  engine.SetConfig(config);
  engine.Snapshot();
  engine.SetCrosshair(true, 400.0f, 220.0f);
  const auto dashed = engine.Snapshot();
  assert(dashed->overlay_vertices.size() > kSolidCrosshairVertexFloatCount);
  for (size_t offset = 0; offset < dashed->overlay_vertices.size();
       offset += 6) {
    assert(dashed->overlay_vertices[offset] >= dashed->plot.left - 0.5f);
    assert(dashed->overlay_vertices[offset] <= dashed->plot.right + 0.5f);
    assert(dashed->overlay_vertices[offset + 1] >= dashed->plot.top - 0.5f);
    assert(dashed->overlay_vertices[offset + 1] <= dashed->plot.bottom + 0.5f);
  }

  const double bearish[] = {0.0, 10.0, 11.0, 7.0, 8.0, 5.0};
  assert(engine.SetHistory(bearish, 6) == UpdateStatus::kApplied);
  engine.SetCrosshair(true, 400.0f, 220.0f);
  const auto down = engine.Snapshot();
  ExpectNear(down->selected_change, -2.0);
  ExpectNear(down->selected_change_percent, -20.0);
  ExpectNear(down->selected_amplitude_percent, 40.0);
  assert(down->selected_percentages_valid);

  const double zero_open[] = {0.0, 0.0, 2.0, 0.0, 1.0, 5.0};
  assert(engine.SetHistory(zero_open, 6) == UpdateStatus::kApplied);
  engine.SetCrosshair(true, 400.0f, 220.0f);
  const auto zero = engine.Snapshot();
  ExpectNear(zero->selected_change, 1.0);
  assert(!zero->selected_percentages_valid);
}

void TestCrosshairHitTesting() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0, 60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
  };
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  engine.SetCrosshair(true, 400.0f, 220.0f);
  const auto snapshot = engine.Snapshot();
  assert(snapshot->crosshair_visible);
  assert(snapshot->crosshair_x >= snapshot->plot.left);
  assert(snapshot->crosshair_x <= snapshot->plot.right);
  assert(snapshot->crosshair_price >= snapshot->visible_y_min);
  assert(snapshot->crosshair_price <= snapshot->visible_y_max);
}

void TestCrosshairRevisionKeepsStaticContentRevision() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0, 60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
  };
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  const auto baseline = engine.Snapshot();
  const auto cached_baseline = engine.Snapshot();
  assert(cached_baseline == baseline);

  engine.SetCrosshair(true, 300.0f, 200.0f);
  const auto activated = engine.Snapshot();
  assert(activated->revision > baseline->revision);
  assert(activated->content_revision == baseline->content_revision);
  assert(engine.Snapshot() == activated);

  engine.SetCrosshair(true, 500.0f, 250.0f);
  const auto moved = engine.Snapshot();
  assert(moved->revision > activated->revision);
  assert(moved->content_revision == activated->content_revision);

  const double candle[] = {60000.0, 11.0, 14.0, 10.0, 13.0, 2.0};
  assert(engine.UpdateCandle(candle, 6) == UpdateStatus::kApplied);
  const auto content_changed = engine.Snapshot();
  assert(content_changed->revision > moved->revision);
  assert(content_changed->content_revision > moved->content_revision);
}

void TestIndicatorLegendVisibleWindow() {
  ChartConfig config;
  const std::vector<Candle> candles = {{0, 10, 11, 9, 10, 1},
                                       {60'000, 12, 12, 10, 11, 0},
                                       {120'000, 12, 13, 11, 13, 3},
                                       {600'000, 14, 15, 14, 15, 4}};
  const std::vector<PaneConfig> panes{PaneConfig{}};
  const std::vector<PriceLine> lines;
  std::vector<trading_charts::SeriesData> series(3);
  for (size_t i = 0; i < 2; ++i) {
    auto& average = series[i];
    average.pane_index = 0;
    average.config.type = SeriesType::kLine;
    average.config.source = SeriesSource::kOhlcvSma;
    average.config.moving_average_period = static_cast<std::uint32_t>(i + 1);
    trading_charts::internal::RebuildDerivedSeries(average, &candles, 0);
  }
  auto& volume = series.back();
  volume.pane_index = 0;
  volume.config.type = SeriesType::kHistogram;
  volume.config.source = SeriesSource::kOhlcvVolume;
  volume.source_binding.kind = trading_charts::SeriesSourceBindingKind::kMain;
  trading_charts::internal::SnapshotBuildInput input{config, candles, panes,
                                                     series, lines};
  input.width = 600;
  input.height = 400;
  input.viewport_initialized = true;
  for (const bool logical : {false, true}) {
    config.logical_spacing = logical;
    input.visible_x_min = 0;
    input.visible_x_max = logical ? 1 : 60'000;
    const auto frame = trading_charts::internal::BuildRenderSnapshot(input);
    assert(frame->last_visible_index == 1 &&
           frame->indicator_legends.size() == 3);
    const auto& legends = frame->indicator_legends;
    assert(legends[0].period == 1 && legends[1].period == 2);
    ExpectNear(legends[0].values[0].value, 11);
    ExpectNear(legends[1].values[0].value, 10.5);
    assert(legends[2].values[0].has_value);
    ExpectNear(legends[2].values[0].value, 0);
    ExpectColor(legends[2].values[0].color, volume.config.down);

    input.previous = frame;
    input.crosshair_active = true;
    input.crosshair_touch_x = frame->plot.left;
    input.crosshair_touch_y = frame->plot.top;
    const auto selected = trading_charts::internal::BuildRenderSnapshot(input);
    assert(selected->content_vertices == frame->content_vertices);
    assert(!selected->indicator_legends[1].values[0].has_value);
    ExpectColor(selected->indicator_legends[2].values[0].color,
                volume.config.up);
    input.previous = selected;
    input.crosshair_active = false;
    const auto restored = trading_charts::internal::BuildRenderSnapshot(input);
    ExpectColor(restored->indicator_legends[2].values[0].color,
                volume.config.down);
    ExpectNear(restored->indicator_legends[1].values[0].value, 10.5);
    input.previous.reset();
  }
  config.logical_spacing = false;
  input.visible_x_min = 180'000;
  input.visible_x_max = 300'000;
  const auto gap = trading_charts::internal::BuildRenderSnapshot(input);
  assert(!gap->has_visible_candles);
  for (const auto& legend : gap->indicator_legends) {
    assert(!legend.values[0].has_value);
  }

  volume.source_binding.kind =
      trading_charts::SeriesSourceBindingKind::kAdditional;
  volume.source_binding.additional_series_index = series.size();
  auto& source = series.emplace_back();
  source.pane_index = 0;
  source.config.visible = false;
  source.candles = {candles.front(), candles.back()};
  input.visible_x_min = 0;
  input.visible_x_max = 60'000;
  const auto missing = trading_charts::internal::BuildRenderSnapshot(input);
  assert(missing->has_visible_candles);
  assert(!missing->indicator_legends.back().values[0].has_value);
}

void TestCrosshairSelectsEveryVisibleAdditionalSeries() {
  ChartEngine engine;
  engine.SetSize(600.0f, 420.0f);
  PaneConfig main;
  PaneConfig rsi_pane;
  rsi_pane.pane_id = "rsi";
  rsi_pane.price_scale_id = "rsi";
  PaneConfig macd_pane;
  macd_pane.pane_id = "macd";
  macd_pane.price_scale_id = "macd";
  engine.SetPanes({main, rsi_pane, macd_pane}, true);

  SeriesConfig candles;
  candles.series_id = "comparison";
  candles.type = SeriesType::kCandlestick;
  assert(engine.AddSeries(candles) == UpdateStatus::kApplied);
  const double comparison[] = {
      0.0, 5.0, 7.0, 4.0, 6.0, 10.0, 180'000.0, 8.0, 10.0, 7.0, 9.0, 11.0,
  };
  assert(engine.SetSeriesData("comparison", comparison, std::size(comparison),
                              false) == UpdateStatus::kApplied);

  SeriesConfig line;
  line.series_id = "missing-line";
  line.type = SeriesType::kLine;
  assert(engine.AddSeries(line) == UpdateStatus::kApplied);
  const double line_values[] = {0.0, 1.0, 2.0, 0.0, 1.5, 0.0};
  assert(engine.SetSeriesData("missing-line", line_values,
                              std::size(line_values),
                              false) == UpdateStatus::kApplied);

  SeriesConfig volume;
  volume.series_id = "volume";
  volume.type = SeriesType::kHistogram;
  volume.source = SeriesSource::kOhlcvVolume;
  volume.source_series_id = "main";
  assert(engine.AddSeries(volume) == UpdateStatus::kApplied);

  SeriesConfig rsi;
  rsi.series_id = "rsi";
  rsi.pane_id = "rsi";
  rsi.price_scale_id = "rsi";
  rsi.type = SeriesType::kLine;
  rsi.source = SeriesSource::kOhlcvRsi;
  rsi.source_series_id = "main";
  rsi.rsi_period = 1;
  assert(engine.AddSeries(rsi) == UpdateStatus::kApplied);

  SeriesConfig macd;
  macd.series_id = "macd";
  macd.pane_id = "macd";
  macd.price_scale_id = "macd";
  macd.type = SeriesType::kLine;
  macd.source = SeriesSource::kOhlcvMacd;
  macd.source_series_id = "main";
  macd.macd_fast_period = 1;
  macd.macd_slow_period = 2;
  macd.macd_signal_period = 1;
  assert(engine.AddSeries(macd) == UpdateStatus::kApplied);

  SeriesConfig hidden = line;
  hidden.series_id = "hidden";
  hidden.visible = false;
  assert(engine.AddSeries(hidden) == UpdateStatus::kApplied);

  const double history[] = {
      0.0,       1.0, 1.0, 1.0, 1.0, 10.0, 60'000.0,  2.0, 2.0, 2.0, 2.0, 20.0,
      120'000.0, 3.0, 3.0, 3.0, 3.0, 30.0, 180'000.0, 4.0, 4.0, 4.0, 4.0, 40.0,
  };
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  const auto content = engine.Snapshot();
  engine.SetCrosshair(true, content->plot.right, content->plot.top);
  const auto selected = engine.Snapshot();
  assert(selected->selected_candle.timestamp == 180'000.0);
  assert(selected->crosshair_series_values.size() == 5);

  const auto& selected_candles = selected->crosshair_series_values[0];
  assert(selected_candles.series_id == "comparison");
  assert(selected_candles.kind == CrosshairSeriesValueKind::kOhlc);
  assert(selected_candles.has_value);
  ExpectNear(selected_candles.candle.close, 9.0);

  const auto& selected_line = selected->crosshair_series_values[1];
  assert(selected_line.series_id == "missing-line");
  assert(selected_line.kind == CrosshairSeriesValueKind::kScalar);
  assert(!selected_line.has_value);

  const auto& selected_volume = selected->crosshair_series_values[2];
  assert(selected_volume.source_type == SeriesSource::kOhlcvVolume);
  assert(selected_volume.has_value);
  ExpectNear(selected_volume.value, 40.0);

  const auto& selected_rsi = selected->crosshair_series_values[3];
  assert(selected_rsi.source_type == SeriesSource::kOhlcvRsi);
  assert(selected_rsi.has_value);

  const auto& selected_macd = selected->crosshair_series_values[4];
  assert(selected_macd.kind == CrosshairSeriesValueKind::kMacd);
  assert(selected_macd.has_macd);
  assert(selected_macd.has_signal);
  assert(selected_macd.has_histogram);
  assert(selected->content_revision == content->content_revision);
  assert(selected->content_vertices == content->content_vertices);
}

void TestCrosshairOnlySnapshotReusesContent() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 5;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  std::vector<double> history;
  for (int i = 0; i < 18; ++i) {
    const double open = 100.0 + i;
    history.insert(history.end(), {
                                      static_cast<double>(i) * 60000.0,
                                      open,
                                      open + 2.0,
                                      open - 1.0,
                                      open + 1.0,
                                      1.0,
                                  });
  }
  assert(engine.SetHistory(history.data(), history.size()) ==
         UpdateStatus::kApplied);
  const auto base = engine.Snapshot();

  engine.SetCrosshair(true, 400.0f, 220.0f);
  const auto first = engine.Snapshot();
  assert(first->content_vertices == base->content_vertices);
  assert(first->content_revision == base->content_revision);
  assert(first->revision > base->revision);
  assert(!first->overlay_vertices.empty());
  assert(first->crosshair_visible);

  engine.SetCrosshair(true, 300.0f, 200.0f);
  const auto second = engine.Snapshot();
  assert(second->content_vertices == first->content_vertices);
  assert(second->revision > first->revision);

  engine.SetCrosshair(false, 0.0f, 0.0f);
  const auto cleared = engine.Snapshot();
  assert(cleared->content_vertices == first->content_vertices);
  assert(cleared->overlay_vertices.empty());
  assert(!cleared->crosshair_visible);

  // A content mutation tessellates a fresh content buffer.
  assert(engine.Pan(40.0f));
  const auto panned = engine.Snapshot();
  assert(panned->content_revision > first->content_revision);
  assert(panned->content_vertices != first->content_vertices);
}

}  // namespace

void RunEventsTests() {
  TestViewportAndOverlayMutationContract();
  TestCrosshairUsesAutoscaleInverse();
  TestYAxisScaleDirectionLimitsAndCrosshair();
  TestCrosshairStatisticsAndLineStyles();
  TestCrosshairHitTesting();
  TestCrosshairRevisionKeepsStaticContentRevision();
  TestIndicatorLegendVisibleWindow();
  TestCrosshairSelectsEveryVisibleAdditionalSeries();
  TestCrosshairOnlySnapshotReusesContent();
}

}  // namespace trading_charts::test
