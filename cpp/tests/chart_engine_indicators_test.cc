// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstdlib>
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
#include "cpp/internal/series_geometry.h"
#include "cpp/tests/chart_engine_test_access.h"
#include "cpp/tests/chart_engine_test_helpers.h"
#include "cpp/tests/chart_engine_test_suites.h"

namespace trading_charts::test {

namespace {

SeriesConfig SarConfig() {
  SeriesConfig config;
  config.series_id = "sar";
  config.source_series_id = "main";
  config.source = SeriesSource::kOhlcvSar;
  config.type = SeriesType::kLine;
  config.declarative = true;
  return config;
}

void TestSarReferenceAndStreaming() {
  // Golden outputs generated with Python TA-Lib 0.6.8, SAR(high, low, .02, .2).
  const std::vector<std::vector<double>> highs = {
      {10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22},
      {22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10},
      {10, 11, 12, 12, 13, 9, 8, 8, 14, 15, 12, 11, 16},
      {10, 10, 10, 10, 10}};
  const std::vector<std::vector<double>> lows = {
      {8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20},
      {20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8},
      {8, 9, 10, 10, 11, 7, 6, 6, 10, 11, 8, 7, 12},
      {10, 10, 10, 10, 10}};
  const std::vector<std::vector<double>> expected = {
      {8, 8.06, 8.2176, 8.504544, 8.94418048, 9.549762432, 10.32379094016,
       11.258460208537603, 12.337106575171585, 13.5364273916407,
       14.82914191331256, 16.06331353065005},
      {22, 21.94, 21.7824, 21.495456, 21.05581952, 20.450237568, 19.67620905984,
       18.741539791462397, 17.662893424828415, 16.4635726083593,
       15.17085808668744, 13.936686469349953},
      {8, 8.06, 8.2176, 8.368896, 13, 13, 12.72, 6, 6, 6.36, 6.7056, 7},
      {10, 10, 10, 10}};
  for (size_t fixture = 0; fixture < highs.size(); ++fixture) {
    trading_charts::SeriesData series;
    series.config = SarConfig();
    std::vector<Candle> source;
    trading_charts::internal::RebuildDerivedSeries(series, &source, 0);
    assert(series.candles.empty());
    for (size_t index = 0; index < highs[fixture].size(); ++index) {
      const double high = highs[fixture][index];
      const double low = lows[fixture][index];
      source.push_back(
          {static_cast<double>(index) * 60'000, low, high, low, high, 1});
      trading_charts::internal::RebuildDerivedSeries(series, &source, index);
      if (index == 0) {
        assert(series.candles.empty() && series.sar_states.empty());
        continue;
      }
      ExpectNear(series.candles.back().close, expected[fixture][index - 1]);
      assert(series.sar_states.back().acceleration <= 0.20);
      assert(!series.sar_states.front().reversal);
      if (fixture == 2) {
        assert(series.sar_states.back().reversal == (index == 5 || index == 8));
      }
      if (fixture < 2 && index >= 10) {
        ExpectNear(series.sar_states.back().acceleration, 0.20);
      }
      // Replace the same candle through both sides of a reversal, then restore
      // it. Each intermediate result must equal an independent full rebuild.
      for (const double change : {-10.0, 10.0, 0.0}) {
        source.back().high = high + std::max(change, 0.0);
        source.back().low = low + std::min(change, 0.0);
        trading_charts::internal::RebuildDerivedSeries(series, &source, index);
        trading_charts::SeriesData rebuilt;
        rebuilt.config = series.config;
        trading_charts::internal::RebuildDerivedSeries(rebuilt, &source, 0);
        assert(series.candles.size() == rebuilt.candles.size());
        for (size_t point = 0; point < series.candles.size(); ++point) {
          ExpectNear(series.candles[point].close, rebuilt.candles[point].close);
          const auto& actual = series.sar_states[point];
          const auto& reference = rebuilt.sar_states[point];
          ExpectNear(actual.next_sar, reference.next_sar);
          ExpectNear(actual.extreme, reference.extreme);
          ExpectNear(actual.acceleration, reference.acceleration);
          assert(actual.rising == reference.rising);
          assert(actual.reversal == reference.reversal);
        }
      }
      ExpectNear(series.candles.back().close, expected[fixture][index - 1]);
    }
    trading_charts::internal::RebuildDerivedSeries(series, nullptr, 0);
    assert(series.candles.empty() && series.sar_states.empty());
  }
}

void TestSarEngineIntegration() {
  for (const bool logical : {false, true}) {
    ChartEngine engine;
    ChartConfig chart;
    chart.logical_spacing = logical;
    chart.show_current_price = false;
    engine.SetConfig(chart);
    engine.SetSize(700, 360);
    SeriesConfig sar = SarConfig();
    assert(engine.AddSeries(sar) == UpdateStatus::kApplied);
    const double history[] = {60'000, 8,  10, 8,       10, 1,  120'000, 9,  11,
                              9,      11, 1,  180'000, 10, 12, 10,      12, 1};
    assert(engine.SetHistory(history, std::size(history)) ==
           UpdateStatus::kApplied);
    const auto check_rebuild = [&] {
      const auto source = engine.Candles();
      trading_charts::SeriesData rebuilt;
      rebuilt.config = sar;
      trading_charts::internal::RebuildDerivedSeries(rebuilt, &source, 0);
      const auto actual =
          trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "sar");
      assert(actual.size() == rebuilt.candles.size());
      for (size_t index = 0; index < actual.size(); ++index) {
        ExpectNear(actual[index].timestamp, rebuilt.candles[index].timestamp);
        ExpectNear(actual[index].close, rebuilt.candles[index].close);
      }
    };
    engine.FitContent();
    auto frame = engine.Snapshot();
    const auto content = frame->content_vertices;
    engine.SetCrosshair(true, frame->plot.right - 1, frame->plot.top + 30);
    frame = engine.Snapshot();
    assert(frame->content_vertices == content);
    assert(frame->crosshair_series_values.size() == 1);
    assert(frame->crosshair_series_values[0].kind ==
           CrosshairSeriesValueKind::kScalar);
    assert(frame->crosshair_series_values[0].source_type ==
           SeriesSource::kOhlcvSar);
    assert(frame->crosshair_series_values[0].has_value);
    ExpectNear(frame->crosshair_series_values[0].value, 8.06);
    engine.SetCrosshair(true, frame->plot.left + 1, frame->plot.top + 30);
    assert(!engine.Snapshot()->crosshair_series_values[0].has_value);
    const double replacement[] = {180'000, 10, 12, 5, 5, 1};
    assert(engine.UpdateCandle(replacement, std::size(replacement)) ==
           UpdateStatus::kApplied);
    check_rebuild();
    const double trades[] = {180'001, 13, 1, 240'001, 14, 1, 300'001, 4, 1};
    assert(engine.UpdateTrades(trades, std::size(trades)) ==
           UpdateStatus::kApplied);
    check_rebuild();
    const double prepend[] = {0, 7, 9, 7, 9, 1};
    assert(engine.PrependHistory(prepend, std::size(prepend)) ==
           UpdateStatus::kApplied);
    check_rebuild();
    sar.sar_step = 0.1;
    assert(engine.AddSeries(sar) == UpdateStatus::kApplied);
    check_rebuild();
    sar.visible = false;
    assert(engine.AddSeries(sar) == UpdateStatus::kApplied);
    assert(engine.Snapshot()->crosshair_series_values.empty());
    engine.Clear();
    check_rebuild();
    assert(engine.SetHistory(history, std::size(history)) ==
           UpdateStatus::kApplied);
    check_rebuild();
    assert(engine.RemoveSeries("sar"));
    sar.sar_step = 0;
    assert(engine.AddSeries(sar) == UpdateStatus::kInvalidInput);
    sar.sar_step = 0.3;
    assert(engine.AddSeries(sar) == UpdateStatus::kInvalidInput);
    sar.sar_maximum = 1.1;
    assert(engine.AddSeries(sar) == UpdateStatus::kInvalidInput);
    sar.sar_maximum = std::numeric_limits<double>::infinity();
    assert(engine.AddSeries(sar) == UpdateStatus::kInvalidInput);
  }
}

void TestSarAutoscaleAndGaps() {
  ChartConfig config;
  config.show_current_price = false;
  const std::vector<Candle> candles = {{0, 90, 100, 90, 100, 1},
                                       {60'000, 100, 110, 100, 110, 1},
                                       {120'000, 110, 120, 110, 120, 1},
                                       {600'000, 120, 130, 120, 130, 1}};
  const std::vector<PaneConfig> panes{PaneConfig{}};
  const std::vector<PriceLine> lines;
  std::vector<trading_charts::SeriesData> series(1);
  series[0].config = SarConfig();
  series[0].pane_index = 0;
  series[0].source_binding.kind =
      trading_charts::SeriesSourceBindingKind::kMain;
  trading_charts::internal::RebuildDerivedSeries(series[0], &candles, 0);
  trading_charts::internal::SnapshotBuildInput input{config, candles, panes,
                                                     series, lines};
  input.width = 800;
  input.height = 500;
  input.viewport_initialized = true;
  for (const bool logical : {false, true}) {
    config.logical_spacing = logical;
    input.visible_x_min = logical ? 2.6 : 570'000;
    input.visible_x_max = logical ? 3.4 : 630'000;
    series[0].config.visible = true;
    const auto visible = trading_charts::internal::BuildRenderSnapshot(input);
    assert(visible->has_visible_candles);
    assert(visible->visible_y_min <= series[0].candles.back().close);
    series[0].config.visible = false;
    const auto hidden = trading_charts::internal::BuildRenderSnapshot(input);
    assert(visible->visible_y_min < hidden->visible_y_min - 1);
    assert(visible->content_vertices->size() >
           hidden->content_vertices->size());
  }
  config.logical_spacing = false;
  input.visible_x_min = 180'000;
  input.visible_x_max = 300'000;
  const auto hidden = trading_charts::internal::BuildRenderSnapshot(input);
  series[0].config.visible = true;
  const auto gap = trading_charts::internal::BuildRenderSnapshot(input);
  assert(!gap->has_visible_candles);
  assert(gap->last_visible_index + 1 == gap->first_visible_index);
  ExpectNear(gap->visible_y_min, hidden->visible_y_min);
  ExpectNear(gap->visible_y_max, hidden->visible_y_max);
  assert(*gap->content_vertices == *hidden->content_vertices);
}

void TestSarGeometry() {
  trading_charts::SeriesData series;
  series.config = SarConfig();
  series.config.up = Color{0, 1, 0, 1};
  series.config.down = Color{1, 0, 0, 1};
  series.config.sar_reversal = Color{0, 0, 1, 1};
  series.candles = {{1, 5, 5, 5, 5, 0}, {2, 5, 5, 5, 5, 0}, {3, 5, 5, 5, 5, 0}};
  series.sar_states.resize(3);
  series.sar_states[1].reversal = true;
  series.sar_states[1].rising = false;
  series.sar_states[2].rising = false;
  for (const float scale : {1.0f, 3.0f}) {
    ChartConfig config;
    config.display_scale = scale;
    trading_charts::internal::SeriesGeometryInput input{
        config, series.candles, 0, 3, {0, 0, 400 * scale, 100 * scale}, 0, 4, 0,
        10};
    std::vector<float> vertices;
    const auto capacity =
        trading_charts::internal::SarGeometryFloatCapacity(input);
    vertices.reserve(capacity);
    trading_charts::internal::AppendSarGeometry(input, series, vertices);
    assert(!vertices.empty() && vertices.size() <= capacity);
    for (size_t offset = 0; offset < vertices.size(); offset += 6) {
      const float x = vertices[offset];
      const float y = vertices[offset + 1];
      const int point = static_cast<int>(std::round(x / (100 * scale)));
      const float dx = x - static_cast<float>(point) * 100 * scale;
      const float dy = y - 50 * scale;
      const float radius = std::sqrt(dx * dx + dy * dy) / scale;
      assert(radius >= 1.49f && radius <= 3.51f);
      assert(vertices[offset + 2] == (point == 3 ? 1.0f : 0.0f));
      assert(vertices[offset + 3] == (point == 1 ? 1.0f : 0.0f));
      assert(vertices[offset + 4] == (point == 2 ? 1.0f : 0.0f));
    }
    // Clip both rings at the plot edges; capacity includes clipped triangles.
    input.visible_x_min = 1;
    input.visible_x_max = 3;
    vertices.clear();
    const auto clipped_capacity =
        trading_charts::internal::SarGeometryFloatCapacity(input);
    vertices.reserve(clipped_capacity);
    trading_charts::internal::AppendSarGeometry(input, series, vertices);
    assert(!vertices.empty() && vertices.size() <= clipped_capacity);
    for (size_t offset = 0; offset < vertices.size(); offset += 6) {
      assert(vertices[offset] >= input.plot.left - 1e-4f &&
             vertices[offset] <= input.plot.right + 1e-4f);
      assert(vertices[offset + 1] >= input.plot.top - 1e-4f &&
             vertices[offset + 1] <= input.plot.bottom + 1e-4f);
    }
    // A viewport beginning after the reversal must not recolor its first point.
    input.first_index = 2;
    vertices.clear();
    trading_charts::internal::AppendSarGeometry(input, series, vertices);
    assert(!vertices.empty());
    for (size_t offset = 0; offset < vertices.size(); offset += 6) {
      assert(vertices[offset + 2] == 1 && vertices[offset + 4] == 0);
    }
    // Empty time gaps have no connecting geometry.
    input.first_index = 1;
    input.end_index = 1;
    vertices.clear();
    trading_charts::internal::AppendSarGeometry(input, series, vertices);
    assert(vertices.empty());
  }
}

void TestBollCalculationAndStreaming() {
  for (const auto value_source :
       {OhlcValueSource::kOpen, OhlcValueSource::kHigh, OhlcValueSource::kLow,
        OhlcValueSource::kClose}) {
    for (const std::uint32_t period : {1U, 3U, 20U}) {
      trading_charts::SeriesData series;
      series.config.source = SeriesSource::kOhlcvBoll;
      series.config.line_source = value_source;
      series.config.boll_period = period;
      series.config.boll_std_dev_multiplier = 1.5;
      std::vector<Candle> source;
      for (size_t index = 0; index < 150; ++index) {
        const double price = 1e9 + static_cast<double>(index % 11) / 16.0;
        source.push_back(Candle{static_cast<double>(index) * 60'000, price,
                                price + 0.25, price - 0.125, price + 0.0625,
                                1});
        for (int replacement = 0; replacement < 2; ++replacement) {
          source.back().close += 0.015625;
          trading_charts::internal::RebuildDerivedSeries(series, &source,
                                                         index);
          trading_charts::SeriesData rebuilt;
          rebuilt.config = series.config;
          trading_charts::internal::RebuildDerivedSeries(rebuilt, &source, 0);
          assert(series.candles.size() == rebuilt.candles.size());
          if (source.size() < period) {
            assert(series.candles.empty());
            continue;
          }
          const Candle& actual = series.candles.back();
          ExpectNear(actual.high, rebuilt.candles.back().high);
          ExpectNear(actual.low, rebuilt.candles.back().low);
          // Independent centered two-pass reference, population variance.
          const double origin = CandleValue(source[index], value_source);
          double mean = 0.0;
          for (size_t sample = index + 1 - period; sample <= index; ++sample) {
            mean += CandleValue(source[sample], value_source) - origin;
          }
          mean /= period;
          double variance = 0.0;
          for (size_t sample = index + 1 - period; sample <= index; ++sample) {
            const double delta =
                CandleValue(source[sample], value_source) - origin - mean;
            variance += delta * delta;
          }
          const double spread = 1.5 * std::sqrt(variance / period);
          assert(std::abs(actual.close - (origin + mean)) < 1e-6);
          assert(std::abs(actual.high - (origin + mean + spread)) < 1e-6);
          assert(std::abs(actual.low - (origin + mean - spread)) < 1e-6);
        }
      }
      trading_charts::internal::RebuildDerivedSeries(series, nullptr, 0);
      assert(series.candles.empty() && series.boll_states.empty());
    }
  }
  trading_charts::SeriesData series;
  series.config.source = SeriesSource::kOhlcvBoll;
  series.config.boll_period = 3;
  std::vector<Candle> source{
      {0, 1, 1, 1, 1, 0}, {1, 2, 2, 2, 2, 0}, {2, 3, 3, 3, 3, 0}};
  trading_charts::internal::RebuildDerivedSeries(series, &source, 0);
  ExpectNear(series.candles.back().close, 2.0);
  ExpectNear(series.candles.back().high, 2.0 + 2.0 * std::sqrt(2.0 / 3.0));
  for (Candle& candle : source) {
    candle.close = 7.0;
  }
  trading_charts::internal::RebuildDerivedSeries(series, &source, 0);
  ExpectNear(series.candles.back().high, 7.0);
  ExpectNear(series.candles.back().low, 7.0);
}

void TestBollEngineIntegration() {
  ChartEngine engine;
  ChartConfig config;
  config.logical_spacing = true;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(700, 360);
  SeriesConfig boll;
  boll.series_id = "boll";
  boll.source_series_id = "main";
  boll.source = SeriesSource::kOhlcvBoll;
  boll.type = SeriesType::kLine;
  boll.boll_period = 3;
  boll.declarative = true;
  assert(engine.AddSeries(boll) == UpdateStatus::kApplied);
  const double history[] = {60'000,  1, 1, 1, 1, 0, 120'000, 2, 2, 2, 2, 0,
                            180'000, 3, 3, 3, 3, 0, 240'000, 4, 4, 4, 4, 0};
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  engine.FitContent();
  auto frame = engine.Snapshot();
  assert(frame->visible_y_max > 3.0 + 2.0 * std::sqrt(2.0 / 3.0));
  const auto content = frame->content_vertices;
  engine.SetCrosshair(true, frame->plot.right - 1, frame->plot.top + 30);
  frame = engine.Snapshot();
  assert(frame->content_vertices == content);
  assert(frame->crosshair_series_values.size() == 1);
  const auto selected = frame->crosshair_series_values.front();
  assert(selected.kind == CrosshairSeriesValueKind::kBoll &&
         selected.has_value);
  ExpectNear(selected.middle, 3.0);
  ExpectNear(selected.upper, 3.0 + 2.0 * std::sqrt(2.0 / 3.0));
  const auto& legend = frame->indicator_legends.at(0);
  assert(legend.kind == IndicatorKind::kBoll && legend.value_count == 3);
  assert(legend.period == 3 && legend.std_dev_multiplier == 2);
  ExpectNear(legend.values[0].value, selected.upper);
  ExpectNear(legend.values[1].value, selected.middle);
  ExpectNear(legend.values[2].value, selected.lower);
  ExpectColor(legend.values[0].color, boll.boll_upper.color);
  ExpectColor(legend.values[1].color, boll.boll_middle.color);
  ExpectColor(legend.values[2].color, boll.boll_lower.color);
  assert(engine.SetSeriesLegendVisible("boll", false));
  auto hidden = engine.Snapshot();
  assert(hidden->indicator_legends.empty() &&
         hidden->content_vertices == content);
  assert(hidden->crosshair_series_values.at(0).has_value);
  assert(!engine.SetSeriesLegendVisible("boll", false));
  assert(engine.Snapshot() == hidden);
  assert(engine.SetSeriesLegendVisible("boll", true));
  assert(engine.Snapshot()->indicator_legends.at(0).values[0].has_value);
  engine.SetCrosshair(true, frame->plot.left + 1, frame->plot.top + 30);
  assert(!engine.Snapshot()->crosshair_series_values.front().has_value);
  const double replacement[] = {240'000, 4, 6, 4, 6, 0};
  assert(engine.UpdateCandle(replacement, std::size(replacement)) ==
         UpdateStatus::kApplied);
  const auto updated =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "boll");
  ExpectNear(updated.back().close, 11.0 / 3.0);
  boll.boll_period = 2;
  assert(engine.AddSeries(boll) == UpdateStatus::kApplied);
  ExpectNear(
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "boll")
          .back()
          .close,
      4.5);
  const double prepended[] = {0, 0, 0, 0, 0, 0};
  assert(engine.PrependHistory(prepended, std::size(prepended)) ==
         UpdateStatus::kApplied);
  assert(trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "boll")
             .size() == 4);
  boll.boll_period = 0;
  assert(engine.AddSeries(boll) == UpdateStatus::kInvalidInput);
  boll.boll_period = 2;
  boll.boll_std_dev_multiplier = std::numeric_limits<double>::infinity();
  assert(engine.AddSeries(boll) == UpdateStatus::kInvalidInput);
  boll.boll_std_dev_multiplier = 2;
  boll.source_series_id = "source";
  boll.series_id = "derived";
  assert(engine.AddSeries(boll) == UpdateStatus::kApplied);
  SeriesConfig source;
  source.series_id = "source";
  assert(engine.AddSeries(source) == UpdateStatus::kApplied);
  assert(engine.SetSeriesData("source", history, std::size(history), false) ==
         UpdateStatus::kApplied);
  assert(
      !trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "derived")
           .empty());
  assert(engine.RemoveSeries("source"));
  assert(!engine.RemoveSeries("derived"));
}

void TestBollGeometry() {
  ChartConfig config;
  config.line_source = OhlcValueSource::kClose;
  SeriesConfig boll;
  boll.boll_fill_top = Color{1, 0, 0, 0.4f};
  boll.boll_fill_bottom = Color{0, 0, 1, 0.1f};
  const std::vector<Candle> candles{{0, 2, 4, 0, 2, 0}, {10, 3, 5, 1, 3, 0}};
  const trading_charts::internal::SeriesGeometryInput input{
      config, candles, 0, 2, {0, 0, 100, 100}, 0, 10, 0, 5, nullptr};
  std::vector<float> vertices;
  trading_charts::internal::AppendBollGeometry(input, boll, true, vertices);
  assert(vertices.size() == 36);
  ExpectNear(vertices[5], 0.4f);
  ExpectNear(vertices[17], 0.1f);
  for (size_t index = 0; index < vertices.size(); index += 6) {
    assert(vertices[index] >= 0 && vertices[index] <= 100);
    assert(vertices[index + 1] >= 0 && vertices[index + 1] <= 100);
  }
  vertices.clear();
  boll.boll_fill_enabled = false;
  trading_charts::internal::AppendBollGeometry(input, boll, true, vertices);
  assert(vertices.empty());
  boll.boll_fill_enabled = true;
  config.line_gap_threshold_ms = 5;
  trading_charts::internal::AppendBollGeometry(input, boll, true, vertices);
  assert(vertices.empty());
  trading_charts::internal::AppendBollGeometry(input, boll, false, vertices);
  assert(vertices.empty());
  config.line_gap_threshold_ms = 0;
  boll.boll_upper.dashed = true;
  boll.boll_lower.gradient_enabled = true;
  trading_charts::internal::AppendBollGeometry(input, boll, false, vertices);
  assert(!vertices.empty());
  config.series_type = SeriesType::kBaseline;
  std::vector<float> baseline_vertices;
  trading_charts::internal::AppendBollGeometry(input, boll, false,
                                               baseline_vertices);
  assert(baseline_vertices == vertices);
}

void TestMovingAverageValuesWarmupAndIncrementalUpdates() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 20;
  config.logical_spacing = true;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(700.0f, 360.0f);

  SeriesConfig sma;
  sma.series_id = "sma";
  sma.type = SeriesType::kLine;
  sma.source = SeriesSource::kOhlcvSma;
  sma.source_series_id = "main";
  sma.moving_average_period = 3;
  assert(engine.AddSeries(sma) == UpdateStatus::kApplied);
  SeriesConfig ema = sma;
  ema.series_id = "ema";
  ema.source = SeriesSource::kOhlcvEma;
  assert(engine.AddSeries(ema) == UpdateStatus::kApplied);
  assert(engine.SetSeriesData("sma", nullptr, 0, false) ==
         UpdateStatus::kInvalidInput);

  const double short_history[] = {
      60'000.0, 1.0, 1.0, 1.0, 1.0, 1.0, 120'000.0, 2.0, 2.0, 2.0, 2.0, 1.0,
  };
  assert(engine.SetHistory(short_history, std::size(short_history)) ==
         UpdateStatus::kApplied);
  assert(trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "sma")
             .empty());
  assert(trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "ema")
             .empty());

  const double history[] = {
      60'000.0,  1.0, 1.0, 1.0, 1.0, 1.0, 120'000.0, 2.0, 2.0, 2.0, 2.0, 1.0,
      180'000.0, 3.0, 3.0, 3.0, 3.0, 1.0, 240'000.0, 4.0, 4.0, 4.0, 4.0, 1.0,
      300'000.0, 5.0, 5.0, 5.0, 5.0, 1.0,
  };
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  auto sma_values =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "sma");
  auto ema_values =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "ema");
  assert(sma_values.size() == 3 && ema_values.size() == 3);
  for (size_t index = 0; index < 3; ++index) {
    ExpectNear(sma_values[index].close, 2.0 + static_cast<double>(index));
    ExpectNear(ema_values[index].close, 2.0 + static_cast<double>(index));
    ExpectNear(sma_values[index].timestamp,
               history[(index + 2) * trading_charts::kCandleValueCount]);
  }

  const auto content_snapshot = engine.Snapshot();
  engine.SetCrosshair(true, content_snapshot->plot.left + 20.0f,
                      content_snapshot->plot.top + 20.0f);
  const auto crosshair_snapshot = engine.Snapshot();
  assert(crosshair_snapshot->content_revision ==
         content_snapshot->content_revision);
  assert(crosshair_snapshot->content_vertices ==
         content_snapshot->content_vertices);

  const double replacement[] = {
      300'000.0, 7.0, 7.0, 7.0, 7.0, 1.0,
  };
  assert(engine.UpdateCandle(replacement, std::size(replacement)) ==
         UpdateStatus::kApplied);
  sma_values =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "sma");
  ema_values =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "ema");
  ExpectNear(sma_values.back().close, 14.0 / 3.0);
  ExpectNear(ema_values.back().close, 5.0);

  const double appended[] = {
      360'000.0, 8.0, 8.0, 8.0, 8.0, 1.0,
  };
  assert(engine.UpdateCandle(appended, std::size(appended)) ==
         UpdateStatus::kApplied);
  sma_values =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "sma");
  ema_values =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "ema");
  ExpectNear(sma_values.back().close, 19.0 / 3.0);
  ExpectNear(ema_values.back().close, 6.5);
  assert(trading_charts::ChartEngineTestAccess::MovingAverageStateCount(
             engine, "sma") == sma_values.size());

  const double prepended[] = {0.0, 0.0, 0.0, 0.0, 0.0, 1.0};
  assert(engine.PrependHistory(prepended, std::size(prepended)) ==
         UpdateStatus::kApplied);
  sma_values =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "sma");
  ExpectNear(sma_values.front().close, 1.0);
  assert(sma_values.size() == 5);
}

void TestMovingAverageSourcesValidationAndCascadeRemoval() {
  ChartEngine engine;
  engine.SetSize(600.0f, 320.0f);
  PaneConfig main;
  PaneConfig other;
  other.pane_id = "other";
  other.price_scale_id = "other";
  engine.SetPanes({main, other}, false);

  SeriesConfig invalid;
  invalid.series_id = "invalid";
  invalid.type = SeriesType::kLine;
  invalid.source = SeriesSource::kOhlcvSma;
  invalid.source_series_id = "main";
  invalid.moving_average_period = 0;
  assert(engine.AddSeries(invalid) == UpdateStatus::kInvalidInput);
  invalid.moving_average_period = 2;
  invalid.pane_id = "other";
  invalid.price_scale_id = "other";
  assert(engine.AddSeries(invalid) == UpdateStatus::kInvalidInput);

  SeriesConfig source;
  source.series_id = "source";
  source.type = SeriesType::kLine;
  source.pane_id = "other";
  source.price_scale_id = "other";
  assert(engine.AddSeries(source) == UpdateStatus::kApplied);

  SeriesConfig average;
  average.series_id = "source-ema";
  average.type = SeriesType::kLine;
  average.source = SeriesSource::kOhlcvEma;
  average.source_series_id = "source";
  average.moving_average_period = 1;
  average.pane_id = "other";
  average.price_scale_id = "other";
  average.line_source = OhlcValueSource::kHigh;
  assert(engine.AddSeries(average) == UpdateStatus::kApplied);

  const double source_values[] = {
      0.0, 10.0, 14.0, 8.0, 11.0, 1.0, 60'000.0, 20.0, 25.0, 18.0, 22.0, 1.0,
  };
  assert(engine.SetSeriesData("source", source_values, std::size(source_values),
                              false) == UpdateStatus::kApplied);
  const auto values = trading_charts::ChartEngineTestAccess::SeriesCandles(
      engine, "source-ema");
  assert(values.size() == 2);
  ExpectNear(values[0].close, 14.0);
  ExpectNear(values[1].close, 25.0);

  SeriesConfig derived_source = average;
  derived_source.series_id = "derived-source";
  derived_source.source_series_id = "source-ema";
  assert(engine.AddSeries(derived_source) == UpdateStatus::kInvalidInput);

  SeriesConfig wrong_pane = average;
  wrong_pane.series_id = "wrong-pane";
  wrong_pane.pane_id = "main";
  wrong_pane.price_scale_id = "main";
  assert(engine.AddSeries(wrong_pane) == UpdateStatus::kInvalidInput);

  assert(engine.RemoveSeries("source"));
  assert(!engine.RemoveSeries("source-ema"));
}

void TestRestylingDeclarativeSeriesPreservesIndicatorHistory() {
  using trading_charts::internal::FullIndicatorRebuildCount;
  ChartEngine engine;
  engine.SetSize(600.0F, 300.0F);
  SeriesConfig average;
  average.series_id = "sma";
  average.type = SeriesType::kLine;
  average.source = SeriesSource::kOhlcvSma;
  average.source_series_id = "main";
  average.moving_average_period = 2;
  average.declarative = true;
  assert(engine.AddSeries(average) == UpdateStatus::kApplied);
  const double history[] = {0, 2, 2, 2, 2, 1, 60'000, 4, 4, 4, 4, 1};
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  const auto rebuilds = FullIndicatorRebuildCount();
  engine.SetPanes({PaneConfig{}}, false);
  assert(FullIndicatorRebuildCount() == rebuilds);
  average.color = {1.0F, 0.0F, 0.0F, 1.0F};
  assert(engine.AddSeries(average) == UpdateStatus::kApplied);
  assert(FullIndicatorRebuildCount() == rebuilds);
  const auto snapshot = engine.Snapshot();
  assert(snapshot->indicator_legends.size() == 1);
  const auto& value = snapshot->indicator_legends.front().values.front();
  assert(value.has_value);
  ExpectNear(value.value, 3.0);
  ExpectColor(value.color, average.color);
  average.moving_average_period = 1;
  assert(engine.AddSeries(average) == UpdateStatus::kApplied);
  assert(FullIndicatorRebuildCount() > rebuilds);
  ExpectNear(engine.Snapshot()->indicator_legends.front().values.front().value,
             4.0);
}

void TestConfigurationSeriesOrderAndDataRetention() {
  using trading_charts::ChartEngineTestAccess;
  using trading_charts::internal::FullIndicatorRebuildCount;
  ChartEngine engine;
  engine.SetSize(700, 400);
  SeriesConfig source;
  source.series_id = "source";
  SeriesConfig comparison = source;
  comparison.series_id = "comparison";
  SeriesConfig average = source;
  average.series_id = "average";
  average.type = SeriesType::kLine;
  average.source = SeriesSource::kOhlcvSma;
  average.source_series_id = source.series_id;
  average.moving_average_period = 2;
  SeriesConfig histogram = source;
  histogram.series_id = "histogram";
  histogram.type = SeriesType::kHistogram;
  assert(engine.ApplyConfiguration({}, {}, false,
                                   {average, histogram, source, comparison}) ==
         UpdateStatus::kApplied);
  const double history[] = {0, 2, 2, 2, 2, 1, 60000, 6, 6, 6, 6, 1};
  const double other[] = {0, 20, 20, 20, 20, 1};
  const double points[] = {0, 77};
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  assert(engine.SetSeriesData("source", history, std::size(history), false) ==
         UpdateStatus::kApplied);
  assert(engine.SetSeriesData("comparison", other, std::size(other), false) ==
         UpdateStatus::kApplied);
  assert(engine.SetSeriesData("histogram", points, std::size(points), true) ==
         UpdateStatus::kApplied);
  const auto check_data = [&] {
    const auto snapshot = engine.Snapshot();
    assert(snapshot->indicator_legends.size() == 1);
    const auto& value = snapshot->indicator_legends.front().values.front();
    assert(value.has_value);
    ExpectNear(value.value, 4.0);
    ExpectNear(
        ChartEngineTestAccess::SeriesCandles(engine, "comparison").at(0).close,
        20);
    ExpectNear(
        ChartEngineTestAccess::SeriesHistogram(engine, "histogram").at(0).value,
        77);
  };
  check_data();
  const auto rebuilds = FullIndicatorRebuildCount();
  assert(engine.ApplyConfiguration({}, {}, false,
                                   {comparison, source, average, histogram}) ==
         UpdateStatus::kApplied);
  assert(FullIndicatorRebuildCount() == rebuilds);
  check_data();
  const auto frame = engine.Snapshot();
  engine.SetCrosshair(true, frame->plot.right, frame->plot.top);
  const auto selected = engine.Snapshot();
  assert(selected->crosshair_series_values.size() == 4);
  assert(selected->crosshair_series_values[0].series_id == "comparison");
  assert(selected->crosshair_series_values[1].series_id == "source");
  assert(selected->crosshair_series_values[2].series_id == "average");
  assert(selected->crosshair_series_values[3].series_id == "histogram");
  engine.SetCrosshair(false, 0, 0);
  // A new OHLC representation uses the same data. A histogram uses a different
  // shape.
  source.type = SeriesType::kArea;
  assert(engine.ApplyConfiguration({}, {}, false,
                                   {histogram, average, comparison, source}) ==
         UpdateStatus::kApplied);
  check_data();
  source.type = SeriesType::kHistogram;
  assert(engine.ApplyConfiguration({}, {}, false, {source}) ==
         UpdateStatus::kApplied);
  assert(ChartEngineTestAccess::SeriesCandles(engine, "source").empty());
  assert(ChartEngineTestAccess::SeriesHistogram(engine, "source").empty());
  assert(!engine.RemoveSeries("average"));
}

void TestInvalidConfigurationPreservesGraph() {
  ChartEngine engine;
  engine.SetSize(700, 400);
  const double history[] = {0, 5, 5, 5, 5, 1};
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  PaneConfig pane;
  pane.pane_id = "old";
  pane.price_scale_id = "old";
  SeriesConfig kept;
  kept.series_id = "kept";
  kept.pane_id = pane.pane_id;
  kept.price_scale_id = pane.price_scale_id;
  assert(engine.ApplyConfiguration({}, {PaneConfig{}, pane}, true, {kept}) ==
         UpdateStatus::kApplied);
  assert(engine.SetSeriesData("kept", history, std::size(history), false) ==
         UpdateStatus::kApplied);
  SeriesConfig runtime;
  runtime.series_id = "runtime";
  assert(engine.AddSeries(runtime) == UpdateStatus::kApplied);
  const auto snapshot = engine.Snapshot();
  const auto revision = engine.Revision();
  ChartConfig changed;
  changed.initial_visible_count = 7;
  SeriesConfig added;
  added.series_id = "added";
  SeriesConfig invalid = added;
  invalid.series_id = "indicator";
  invalid.type = SeriesType::kLine;
  invalid.source = SeriesSource::kOhlcvSma;
  invalid.source_series_id = "missing";
  for (const auto& last : {invalid, added, runtime, kept}) {
    assert(engine.ApplyConfiguration(changed, {}, false, {added, last}) ==
           UpdateStatus::kInvalidInput);
    assert(engine.Revision() == revision);
    assert(engine.Snapshot() == snapshot);
    assert(!engine.RemoveSeries("added"));
    ExpectNear(
        trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "kept")
            .at(0)
            .close,
        5);
  }
  // A corrected retry commits once and only removes the old declarations.
  invalid.source_series_id = "added";
  assert(engine.ApplyConfiguration(changed, {}, false, {invalid, added}) ==
         UpdateStatus::kApplied);
  assert(engine.Revision() == revision + 1);
  assert(engine.Snapshot()->config.initial_visible_count == 7);
  assert(!engine.RemoveSeries("kept"));
  assert(engine.ApplyConfiguration(changed, {}, false, {}) ==
         UpdateStatus::kApplied);
  assert(engine.RemoveSeries("runtime"));
  assert(!engine.RemoveSeries("added"));
}

void TestDeclarativeDerivedSeriesResolvesForwardSource() {
  ChartEngine engine;

  SeriesConfig average;
  average.series_id = "average";
  average.type = SeriesType::kLine;
  average.source = SeriesSource::kOhlcvSma;
  average.source_series_id = "source";
  average.moving_average_period = 2;
  average.declarative = true;
  assert(engine.AddSeries(average) == UpdateStatus::kApplied);
  assert(trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "average")
             .empty());

  SeriesConfig imperative = average;
  imperative.series_id = "imperative";
  imperative.source_series_id = "missing";
  imperative.declarative = false;
  assert(engine.AddSeries(imperative) == UpdateStatus::kInvalidInput);

  SeriesConfig source;
  source.series_id = "source";
  source.type = SeriesType::kLine;
  source.declarative = true;
  assert(engine.AddSeries(source) == UpdateStatus::kApplied);

  const double values[] = {
      0.0, 10.0, 10.0, 10.0, 10.0, 1.0, 60'000.0, 14.0, 14.0, 14.0, 14.0, 1.0,
  };
  assert(engine.SetSeriesData("source", values, std::size(values), false) ==
         UpdateStatus::kApplied);
  const auto derived =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "average");
  assert(derived.size() == 1);
  ExpectNear(derived.front().timestamp, 60'000.0);
  ExpectNear(derived.front().close, 12.0);

  assert(engine.RemoveSeries("source"));
  assert(!engine.RemoveSeries("average"));
}

void TestMovingAverageAllValueSourcesAndTradeBatch() {
  ChartEngine engine;
  ChartConfig config;
  config.resolution.unit = trading_charts::ResolutionUnit::kFixed;
  config.resolution.fixed_duration_ms = 60'000;
  engine.SetConfig(config);
  engine.SetSize(500.0f, 300.0f);

  const std::array<OhlcValueSource, 4> sources{
      OhlcValueSource::kOpen,
      OhlcValueSource::kHigh,
      OhlcValueSource::kLow,
      OhlcValueSource::kClose,
  };
  for (size_t index = 0; index < sources.size(); ++index) {
    SeriesConfig average;
    average.series_id = "ma-" + std::to_string(index);
    average.type = SeriesType::kLine;
    average.source = SeriesSource::kOhlcvSma;
    average.source_series_id = "main";
    average.moving_average_period = 1;
    average.line_source = sources[index];
    assert(engine.AddSeries(average) == UpdateStatus::kApplied);
  }
  const double candle[] = {0.0, 10.0, 14.0, 8.0, 11.0, 1.0};
  assert(engine.SetHistory(candle, std::size(candle)) ==
         UpdateStatus::kApplied);
  const std::array<double, 4> expected{10.0, 14.0, 8.0, 11.0};
  for (size_t index = 0; index < expected.size(); ++index) {
    const auto values = trading_charts::ChartEngineTestAccess::SeriesCandles(
        engine, "ma-" + std::to_string(index));
    assert(values.size() == 1);
    ExpectNear(values[0].close, expected[index]);
  }

  const double single_trade[] = {60'000.0, 20.0, 1.0};
  assert(engine.UpdateTrade(single_trade, std::size(single_trade)) ==
         UpdateStatus::kApplied);
  auto closes =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "ma-3");
  assert(closes.size() == 2);
  ExpectNear(closes.back().close, 20.0);

  const double trades[] = {
      60'100.0, 24.0, 1.0, 120'000.0, 30.0, 1.0,
  };
  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateTrades(trades, std::size(trades)) ==
           UpdateStatus::kApplied);
  });
  closes = trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "ma-3");
  assert(closes.size() == 3);
  ExpectNear(closes[1].close, 24.0);
  ExpectNear(closes[2].close, 30.0);
}

}  // namespace

void RunIndicatorsTests() {
  TestSarReferenceAndStreaming();
  TestSarEngineIntegration();
  TestSarGeometry();
  TestSarAutoscaleAndGaps();
  TestBollCalculationAndStreaming();
  TestBollEngineIntegration();
  TestBollGeometry();
  TestMovingAverageValuesWarmupAndIncrementalUpdates();
  TestMovingAverageSourcesValidationAndCascadeRemoval();
  TestRestylingDeclarativeSeriesPreservesIndicatorHistory();
  TestConfigurationSeriesOrderAndDataRetention();
  TestInvalidConfigurationPreservesGraph();
  TestDeclarativeDerivedSeriesResolvesForwardSource();
  TestMovingAverageAllValueSourcesAndTradeBatch();
}

}  // namespace trading_charts::test
