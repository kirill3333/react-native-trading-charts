// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <array>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <initializer_list>
#include <iterator>
#include <limits>
#include <memory>
#include <string>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/indicator_series.h"
#include "cpp/tests/chart_engine_test_access.h"
#include "cpp/tests/chart_engine_test_helpers.h"
#include "cpp/tests/chart_engine_test_suites.h"

namespace trading_charts::test {

namespace {

std::array<size_t, 8> IndicatorBufferCapacities(
    const trading_charts::SeriesData& series) {
  return {series.candles.capacity(),
          series.rsi_states.capacity(),
          series.moving_average_states.capacity(),
          series.macd_states.capacity(),
          series.signal_candles.capacity(),
          series.histogram.capacity(),
          series.boll_states.capacity(),
          series.sar_states.capacity()};
}

void TestIndicatorAppendBufferGrowth() {
  for (const SeriesSource kind :
       {SeriesSource::kOhlcvRsi, SeriesSource::kOhlcvSma,
        SeriesSource::kOhlcvEma, SeriesSource::kOhlcvMacd,
        SeriesSource::kOhlcvBoll, SeriesSource::kOhlcvSar,
        SeriesSource::kOhlcvKdj, SeriesSource::kOhlcvWilliamsR}) {
    // Exercise both streaming through warmup and appending to loaded history.
    for (const size_t history_size : {size_t{0}, size_t{1000}}) {
      trading_charts::SeriesData series;
      series.config.source = kind;
      std::vector<Candle> source;
      const auto append = [&]() {
        const double value = 100.0 + static_cast<double>(source.size() % 31);
        source.push_back({static_cast<double>(source.size()) * 60'000.0, value,
                          value, value, value, 1.0});
      };
      for (size_t index = 0; index < history_size; ++index) {
        append();
      }
      trading_charts::internal::RebuildDerivedSeries(series, &source, 0);
      auto capacities = IndicatorBufferCapacities(series);
      std::array<size_t, 8> reallocations{};
      for (size_t index = 0; index < 2048; ++index) {
        append();
        trading_charts::internal::RebuildDerivedSeries(series, &source,
                                                       source.size() - 1);
        const auto next_capacities = IndicatorBufferCapacities(series);
        for (size_t buffer = 0; buffer < capacities.size(); ++buffer) {
          reallocations[buffer] +=
              next_capacities[buffer] != capacities[buffer];
          // Ten live appends must not copy the entire loaded history each time.
          if (history_size > 0 && index == 9) {
            assert(reallocations[buffer] <= 2);
          }
        }
        capacities = next_capacities;

        source.back().close += 0.5;
        source.back().high += 0.5;
        trading_charts::internal::RebuildDerivedSeries(series, &source,
                                                       source.size() - 1);
        assert(IndicatorBufferCapacities(series) == capacities);
      }
      for (const size_t count : reallocations) {
        // Allow different library growth factors, but reject linear growth.
        assert(count <= 32);
      }

      trading_charts::SeriesData rebuilt;
      rebuilt.config = series.config;
      trading_charts::internal::RebuildDerivedSeries(rebuilt, &source, 0);
      const auto expect_candles = [](const std::vector<Candle>& actual,
                                     const std::vector<Candle>& expected) {
        assert(actual.size() == expected.size());
        for (size_t index = 0; index < actual.size(); ++index) {
          ExpectNear(actual[index].timestamp, expected[index].timestamp);
          ExpectNear(actual[index].close, expected[index].close);
        }
      };
      expect_candles(series.candles, rebuilt.candles);
      expect_candles(series.signal_candles, rebuilt.signal_candles);
      assert(series.histogram.size() == rebuilt.histogram.size());
      for (size_t index = 0; index < series.histogram.size(); ++index) {
        ExpectNear(series.histogram[index].timestamp,
                   rebuilt.histogram[index].timestamp);
        ExpectNear(series.histogram[index].value,
                   rebuilt.histogram[index].value);
      }
      assert(series.rsi_states.size() == rebuilt.rsi_states.size());
      assert(series.moving_average_states.size() ==
             rebuilt.moving_average_states.size());
      assert(series.macd_states.size() == rebuilt.macd_states.size());
    }
  }
}

void TestRangeOscillatorFormulas() {
  using trading_charts::internal::RebuildDerivedSeries;
  trading_charts::SeriesData kdj;
  kdj.config.source = SeriesSource::kOhlcvKdj;
  std::vector<Candle> candles{{0, 5, 5, 5, 5, 1}, {1, 5, 10, 5, 10, 1}};
  RebuildDerivedSeries(kdj, &candles, 0);
  ExpectNear(kdj.candles.front().high, 50);
  ExpectNear(kdj.candles.front().close, 50);
  ExpectNear(kdj.candles.front().low, 50);
  ExpectNear(kdj.candles.back().high, 200.0 / 3);
  ExpectNear(kdj.candles.back().close, 500.0 / 9);
  ExpectNear(kdj.candles.back().low, 800.0 / 9);
  kdj.config.kdj_m1 = 2;
  kdj.config.kdj_m2 = 4;
  RebuildDerivedSeries(kdj, &candles, 0);
  ExpectNear(kdj.candles.front().low, 50);
  ExpectNear(kdj.candles.back().high, 75);
  ExpectNear(kdj.candles.back().close, 62.5);
  ExpectNear(kdj.candles.back().low, 175);

  trading_charts::SeriesData wr;
  wr.config.source = SeriesSource::kOhlcvWilliamsR;
  wr.config.williams_period = 2;
  candles.resize(1);
  RebuildDerivedSeries(wr, &candles, 0);
  assert(wr.candles.empty());
  candles.push_back({1, 5, 10, 5, 10, 1});
  RebuildDerivedSeries(wr, &candles, 1);
  ExpectNear(wr.candles.back().close, 0);
  candles.push_back({2, 5, 5, 5, 5, 1});
  RebuildDerivedSeries(wr, &candles, 2);
  ExpectNear(wr.candles.back().close, -100);
  candles.push_back({3, 5, 5, 5, 5, 1});
  RebuildDerivedSeries(wr, &candles, 3);
  ExpectNear(wr.candles.back().close, -50);
  wr.config.williams_period = 1;
  RebuildDerivedSeries(wr, &candles, 0);
  assert(wr.candles.size() == candles.size());
  ExpectNear(wr.candles.front().close, -50);
  kdj.config.kdj_period = 1;
  RebuildDerivedSeries(kdj, &candles, 0);
  ExpectNear(kdj.candles[2].high, 62.5);
  ExpectNear(kdj.candles[2].close, 62.5);
}

void TestRangeOscillatorFramesAndStreaming() {
  ChartEngine engine;
  engine.SetSize(800, 560);
  PaneConfig main, wr_pane, kdj_pane;
  wr_pane.pane_id = wr_pane.price_scale_id = "wr";
  kdj_pane.pane_id = kdj_pane.price_scale_id = "kdj";
  engine.SetPanes({main, wr_pane, kdj_pane}, true);
  SeriesConfig wr;
  wr.series_id = wr.pane_id = wr.price_scale_id = "wr";
  wr.source_series_id = "main";
  wr.source = SeriesSource::kOhlcvWilliamsR;
  wr.type = SeriesType::kLine;
  wr.williams_period = 2;
  SeriesConfig kdj = wr;
  kdj.source = SeriesSource::kOhlcvKdj;
  kdj.series_id = kdj.pane_id = kdj.price_scale_id = "kdj";
  kdj.kdj_m1 = 2;
  kdj.kdj_m2 = 4;
  assert(engine.AddSeries(wr) == UpdateStatus::kApplied);
  assert(engine.AddSeries(kdj) == UpdateStatus::kApplied);
  const double history[] = {60000, 5, 5, 5, 5, 1, 120000, 5, 10, 5, 10, 1};
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  engine.FitContent();
  auto frame = engine.Snapshot();
  assert(frame->panes[1].williams_scale);
  ExpectNear(frame->panes[1].visible_y_min, -100);
  ExpectNear(frame->panes[1].visible_y_max, 0);
  assert(frame->panes[2].visible_y_max >= 175);
  assert(frame->indicator_legends.size() == 2);
  ExpectNear(frame->indicator_legends[1].values[2].value, 175);
  const auto content = frame->content_vertices;
  engine.SetCrosshair(true, frame->plot.left + 1, frame->plot.top + 10);
  frame = engine.Snapshot();
  assert(frame->content_vertices == content);
  assert(!frame->crosshair_series_values[0].has_value);
  ExpectNear(frame->crosshair_series_values[1].j, 50);
  engine.SetCrosshair(true, frame->plot.right - 1, frame->plot.top + 10);
  frame = engine.Snapshot();
  ExpectNear(frame->crosshair_series_values[0].value, 0);
  ExpectNear(frame->crosshair_series_values[1].j, 175);
  assert(!engine.ScaleYAt(
      30, (frame->panes[1].plot.top + frame->panes[1].plot.bottom) / 2));
  const auto check = [&] {
    const auto candles = engine.Candles();
    for (const auto* config : {&wr, &kdj}) {
      trading_charts::SeriesData rebuilt;
      rebuilt.config = *config;
      trading_charts::internal::RebuildDerivedSeries(rebuilt, &candles, 0);
      const auto actual = trading_charts::ChartEngineTestAccess::SeriesCandles(
          engine, config->series_id);
      assert(actual.size() == rebuilt.candles.size());
      for (size_t i = 0; i < actual.size(); ++i) {
        ExpectNear(actual[i].high, rebuilt.candles[i].high);
        ExpectNear(actual[i].close, rebuilt.candles[i].close);
        ExpectNear(actual[i].low, rebuilt.candles[i].low);
      }
    }
  };
  const double replacement[] = {120000, 5, 7, 4, 4, 1};
  assert(engine.UpdateCandle(replacement, std::size(replacement)) ==
         UpdateStatus::kApplied);
  check();
  const double trades[] = {120001, 9, 1, 180001, 12, 1};
  assert(engine.UpdateTrades(trades, std::size(trades)) ==
         UpdateStatus::kApplied);
  check();
  const double prepend[] = {0, 3, 4, 2, 3, 1};
  assert(engine.PrependHistory(prepend, std::size(prepend)) ==
         UpdateStatus::kApplied);
  check();
  assert(engine.SetSeriesLegendVisible("kdj", false));
  assert(engine.Snapshot()->indicator_legends.size() == 1);
  kdj.series_id = "second";
  kdj.pane_id = kdj.price_scale_id = "wr";
  assert(engine.AddSeries(kdj) == UpdateStatus::kInvalidInput);
}

void TestDerivedRsiPaneAndIncrementalUpdates() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 20;
  config.logical_spacing = true;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);

  PaneConfig main;
  main.height_weight = 3.0;
  PaneConfig rsi_pane;
  rsi_pane.pane_id = "rsi";
  rsi_pane.price_scale_id = "rsi";
  rsi_pane.height_weight = 1.0;
  rsi_pane.precision = 4;
  rsi_pane.min_move = 0.0001;
  engine.SetPanes({main, rsi_pane}, true);

  SeriesConfig rsi;
  rsi.series_id = "rsi";
  rsi.pane_id = "rsi";
  rsi.price_scale_id = "rsi";
  rsi.type = SeriesType::kLine;
  rsi.source = SeriesSource::kOhlcvRsi;
  rsi.source_series_id = "main";
  rsi.rsi_period = 3;
  rsi.rsi_oversold = 30.0;
  rsi.rsi_overbought = 70.0;
  rsi.color = {0.5f, 0.6f, 0.7f, 0.8f};
  rsi.declarative = true;
  assert(engine.AddSeries(rsi) == UpdateStatus::kApplied);
  const double direct_rsi[] = {0.0, 50.0, 50.0, 50.0, 50.0, 0.0};
  assert(engine.SetSeriesData("rsi", direct_rsi,
                              trading_charts::kCandleValueCount,
                              false) == UpdateStatus::kInvalidInput);

  const std::vector<double> closes{1.0, 2.0, 3.0, 2.0, 2.0, 4.0};
  std::vector<double> history;
  for (size_t index = 0; index < closes.size(); ++index) {
    const double close = closes[index];
    history.insert(history.end(), {static_cast<double>(index) * 60'000.0, close,
                                   close, close, close, 1.0});
  }
  assert(engine.SetHistory(history.data(), history.size()) ==
         UpdateStatus::kApplied);

  const auto snapshot = engine.Snapshot();
  assert(snapshot->panes.size() == 2);
  assert(snapshot->panes[1].rsi_scale);
  ExpectNear(snapshot->panes[1].visible_y_min, 0.0);
  ExpectNear(snapshot->panes[1].visible_y_max, 100.0);
  assert(snapshot->indicator_legends.size() == 1);
  assert(snapshot->indicator_legends[0].values[0].has_value);
  ExpectNear(snapshot->indicator_legends[0].values[0].value, 86.6666666667,
             1e-6);
  assert(!snapshot->indicator_legends[0].text_color_set);
  ExpectNear(snapshot->indicator_legends[0].values[0].color.r, rsi.color.r);
  ExpectNear(snapshot->indicator_legends[0].values[0].color.a, rsi.color.a);

  rsi.rsi_text_color = {0.9f, 0.8f, 0.2f, 0.7f};
  rsi.rsi_text_color_set = true;
  assert(engine.AddSeries(rsi) == UpdateStatus::kApplied);
  const auto styled = engine.Snapshot();
  assert(styled->indicator_legends[0].text_color_set);
  ExpectNear(styled->indicator_legends[0].text_color.r, rsi.rsi_text_color.r);
  ExpectNear(styled->indicator_legends[0].text_color.a, rsi.rsi_text_color.a);
  bool has_oversold = false;
  bool has_overbought = false;
  bool has_boundary_tick = false;
  size_t oversold_count = 0;
  size_t overbought_count = 0;
  const PaneSnapshot& pane = snapshot->panes[1];
  assert(pane.y_tick_count == 5);
  const std::array<double, 5> expected_ticks{0.0, 30.0, 50.0, 70.0, 100.0};
  for (size_t index = 0; index < pane.y_tick_count; ++index) {
    const AxisTick& tick = snapshot->pane_y_ticks[pane.y_tick_offset + index];
    ExpectNear(tick.value, expected_ticks[index]);
    assert(tick.grid_visible ==
           (tick.value == 0.0 || tick.value == 50.0 || tick.value == 100.0));
    has_oversold = has_oversold || std::abs(tick.value - 30.0) < 1e-9;
    has_overbought = has_overbought || std::abs(tick.value - 70.0) < 1e-9;
    has_boundary_tick =
        has_boundary_tick || tick.value <= 0.0 || tick.value >= 100.0;
    oversold_count += std::abs(tick.value - 30.0) < 1e-9 ? 1 : 0;
    overbought_count += std::abs(tick.value - 70.0) < 1e-9 ? 1 : 0;
  }
  assert(has_oversold && has_overbought);
  assert(has_boundary_tick);
  assert(oversold_count == 1 && overbought_count == 1);
  assert(!engine.ScaleYAt(20.0f, (pane.plot.top + pane.plot.bottom) * 0.5f));
  const auto scale_result = engine.ScaleYAtWithResult(
      20.0F, (pane.plot.top + pane.plot.bottom) * 0.5F);
  assert(!scale_result.state_changed && !scale_result.scale_changed);

  const double replacement[] = {5.0 * 60'000.0, 3.0, 3.0, 3.0, 3.0, 1.0};
  assert(engine.UpdateCandle(replacement, trading_charts::kCandleValueCount) ==
         UpdateStatus::kApplied);
  const auto replaced = engine.Snapshot();
  ExpectNear(replaced->indicator_legends[0].values[0].value, 80.9523809524,
             1e-6);

  const PaneSnapshot& selected_pane = replaced->panes[1];
  const float selected_x =
      selected_pane.plot.left +
      static_cast<float>((3.0 + 0.5) /
                         (static_cast<double>(closes.size()) + 2.0)) *
          selected_pane.plot.Width();
  engine.SetCrosshair(
      true, selected_x,
      (selected_pane.plot.top + selected_pane.plot.bottom) * 0.5f);
  const auto selected = engine.Snapshot();
  assert(selected->content_revision == replaced->content_revision);
  assert(selected->content_vertices == replaced->content_vertices);
  assert(selected->indicator_legends[0].values[0].has_value);
  ExpectNear(selected->indicator_legends[0].values[0].value, 66.6666666667,
             1e-6);
}

void TestRsiEdgeValuesAndWarmup() {
  const auto value_for = [](const std::vector<double>& closes) {
    ChartEngine engine;
    engine.SetSize(500.0f, 300.0f);
    PaneConfig main;
    PaneConfig indicator;
    indicator.pane_id = "rsi";
    indicator.price_scale_id = "rsi";
    engine.SetPanes({main, indicator}, false);
    SeriesConfig rsi;
    rsi.series_id = "rsi";
    rsi.pane_id = "rsi";
    rsi.price_scale_id = "rsi";
    rsi.type = SeriesType::kLine;
    rsi.source = SeriesSource::kOhlcvRsi;
    rsi.source_series_id = "main";
    rsi.rsi_period = 2;
    assert(engine.AddSeries(rsi) == UpdateStatus::kApplied);
    std::vector<double> history;
    for (size_t index = 0; index < closes.size(); ++index) {
      const double close = closes[index];
      history.insert(history.end(), {static_cast<double>(index) * 60'000.0,
                                     close, close, close, close, 1.0});
    }
    assert(engine.SetHistory(history.data(), history.size()) ==
           UpdateStatus::kApplied);
    const auto snapshot = engine.Snapshot();
    assert(snapshot->indicator_legends.size() == 1);
    return snapshot->indicator_legends[0].values[0].has_value
               ? snapshot->indicator_legends[0].values[0].value
               : std::numeric_limits<double>::quiet_NaN();
  };

  ExpectNear(value_for({1.0, 2.0, 3.0}), 100.0);
  ExpectNear(value_for({3.0, 2.0, 1.0}), 0.0);
  ExpectNear(value_for({2.0, 2.0, 2.0}), 50.0);
  assert(std::isnan(value_for({1.0, 2.0})));
}

void TestRsiFlatAndCascadeRemoval() {
  ChartEngine engine;
  engine.SetSize(600.0f, 400.0f);
  PaneConfig main;
  PaneConfig indicator;
  indicator.pane_id = "indicator";
  indicator.price_scale_id = "indicator";
  engine.SetPanes({main, indicator}, false);

  SeriesConfig source;
  source.series_id = "source";
  source.pane_id = "indicator";
  source.price_scale_id = "indicator";
  source.type = SeriesType::kLine;
  assert(engine.AddSeries(source) == UpdateStatus::kApplied);
  const double values[] = {
      0.0,  10.0, 10.0, 10.0, 10.0, 1.0,  1.0,  10.0, 10.0,
      10.0, 10.0, 1.0,  2.0,  10.0, 10.0, 10.0, 10.0, 1.0,
  };
  assert(engine.SetSeriesData("source", values,
                              sizeof(values) / sizeof(values[0]),
                              false) == UpdateStatus::kApplied);
  assert(engine.SetHistory(values, sizeof(values) / sizeof(values[0])) ==
         UpdateStatus::kApplied);

  SeriesConfig rsi;
  rsi.series_id = "flat-rsi";
  rsi.pane_id = "indicator";
  rsi.price_scale_id = "indicator";
  rsi.type = SeriesType::kLine;
  rsi.source = SeriesSource::kOhlcvRsi;
  rsi.source_series_id = "source";
  rsi.rsi_period = 2;
  assert(engine.AddSeries(rsi) == UpdateStatus::kApplied);
  const auto snapshot = engine.Snapshot();
  assert(snapshot->indicator_legends.size() == 1);
  ExpectNear(snapshot->indicator_legends[0].values[0].value, 50.0);
  assert(engine.RemoveSeries("source"));
  assert(!engine.RemoveSeries("flat-rsi"));
}

void TestBatchReplacesConflictingIndicatorsTogether() {
  ChartEngine engine;
  PaneConfig pane;
  pane.pane_id = "indicators";
  pane.price_scale_id = "indicators";
  SeriesConfig first;
  first.series_id = "first";
  first.pane_id = pane.pane_id;
  first.price_scale_id = pane.price_scale_id;
  first.type = SeriesType::kLine;
  first.source = SeriesSource::kOhlcvRsi;
  first.source_series_id = "main";
  SeriesConfig second = first;
  second.series_id = "second";
  const std::vector<PaneConfig> panes = {PaneConfig{}, pane};
  assert(engine.ApplyConfiguration({}, panes, true, {first, second}) ==
         UpdateStatus::kApplied);
  first.source = SeriesSource::kOhlcvMacd;
  // This intermediate combination really would be invalid.
  const auto revision = engine.Revision();
  assert(engine.ApplyConfiguration({}, panes, true, {first, second}) ==
         UpdateStatus::kInvalidInput);
  assert(engine.Revision() == revision);
  second.source = SeriesSource::kOhlcvMacd;
  assert(engine.ApplyConfiguration({}, panes, true, {second, first}) ==
         UpdateStatus::kApplied);
  assert(engine.RemoveSeries("first"));
  assert(engine.RemoveSeries("second"));
}

void TestMacdWarmupIncrementalLegendAndAutoscale() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 20;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(700.0f, 420.0f);
  PaneConfig main;
  main.height_weight = 3.0;
  PaneConfig macd_pane;
  macd_pane.pane_id = "macd";
  macd_pane.price_scale_id = "macd";
  engine.SetPanes({main, macd_pane}, true);

  SeriesConfig macd;
  macd.series_id = "macd";
  macd.pane_id = "macd";
  macd.price_scale_id = "macd";
  macd.type = SeriesType::kLine;
  macd.source = SeriesSource::kOhlcvMacd;
  macd.source_series_id = "main";
  macd.macd_fast_period = 3;
  macd.macd_slow_period = 5;
  macd.macd_signal_period = 2;
  macd.color = {0.1f, 0.2f, 0.3f, 1.0f};
  macd.macd_signal_color = {0.4f, 0.5f, 0.6f, 1.0f};
  macd.macd_positive_increasing = {0.0f, 1.0f, 0.0f, 1.0f};
  macd.macd_positive_decreasing = {0.0f, 0.5f, 0.0f, 1.0f};
  macd.macd_negative_increasing = {0.5f, 0.0f, 0.0f, 1.0f};
  macd.macd_negative_decreasing = {1.0f, 0.0f, 0.0f, 1.0f};
  assert(engine.AddSeries(macd) == UpdateStatus::kApplied);
  assert(engine.SetSeriesData("macd", nullptr, 0, false) ==
         UpdateStatus::kInvalidInput);

  const double insufficient[] = {
      60.0,  1.0, 1.0, 1.0, 1.0, 1.0, 120.0, 2.0, 2.0, 2.0, 2.0, 1.0,
      180.0, 3.0, 3.0, 3.0, 3.0, 1.0, 240.0, 4.0, 4.0, 4.0, 4.0, 1.0,
  };
  assert(engine.SetHistory(insufficient, std::size(insufficient)) ==
         UpdateStatus::kApplied);
  assert(trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "macd")
             .empty());
  const auto warmup = engine.Snapshot();
  assert(warmup->indicator_legends.size() == 1);
  for (size_t index = 0; index < 3; ++index) {
    assert(!warmup->indicator_legends[0].values[index].has_value);
  }

  const double history[] = {
      60.0,  1.0, 1.0, 1.0, 1.0, 1.0, 120.0, 2.0, 2.0, 2.0, 2.0, 1.0,
      180.0, 3.0, 3.0, 3.0, 3.0, 1.0, 240.0, 4.0, 4.0, 4.0, 4.0, 1.0,
      300.0, 5.0, 5.0, 5.0, 5.0, 1.0, 360.0, 4.0, 4.0, 4.0, 4.0, 1.0,
      420.0, 6.0, 6.0, 6.0, 6.0, 1.0, 480.0, 3.0, 3.0, 3.0, 3.0, 1.0,
  };
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  auto macd_values =
      trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "macd");
  auto signal_values =
      trading_charts::ChartEngineTestAccess::SignalCandles(engine, "macd");
  auto histogram =
      trading_charts::ChartEngineTestAccess::SeriesHistogram(engine, "macd");
  assert(macd_values.size() == 4);
  assert(signal_values.size() == 3);
  assert(histogram.size() == 3);
  ExpectNear(macd_values[0].close, 1.0);
  ExpectNear(macd_values[1].close, 2.0 / 3.0);
  ExpectNear(macd_values[2].close, 7.0 / 9.0);
  ExpectNear(macd_values[3].close, 5.0 / 27.0);
  ExpectNear(signal_values[0].close, 5.0 / 6.0);
  ExpectNear(signal_values[1].close, 43.0 / 54.0);
  ExpectNear(signal_values[2].close, 7.0 / 18.0);
  ExpectNear(histogram[0].value, -1.0 / 6.0);
  ExpectNear(histogram[1].value, -1.0 / 54.0);
  ExpectNear(histogram[2].value, -11.0 / 54.0);
  assert(trading_charts::ChartEngineTestAccess::MacdStateCount(engine,
                                                               "macd") == 8);

  const auto latest = engine.Snapshot();
  assert(latest->indicator_legends.size() == 1);
  const auto& latest_legend = latest->indicator_legends[0];
  assert(latest_legend.kind == IndicatorKind::kMacd);
  assert(latest_legend.value_count == 3);
  ExpectNear(latest_legend.values[0].value, -11.0 / 54.0);
  ExpectNear(latest_legend.values[1].value, 5.0 / 27.0);
  ExpectNear(latest_legend.values[2].value, 7.0 / 18.0);
  ExpectColor(latest_legend.values[0].color, macd.macd_negative_decreasing);
  assert(latest->panes[1].visible_y_min <= 0.0);
  assert(latest->panes[1].visible_y_max >= 1.0);

  const float selected_x =
      latest->plot.left +
      static_cast<float>((420.0 - latest->visible_x_min) /
                         (latest->visible_x_max - latest->visible_x_min)) *
          latest->plot.Width();
  engine.SetCrosshair(true, selected_x, latest->panes[1].plot.top + 10.0f);
  const auto selected = engine.Snapshot();
  assert(selected->selected_candle.timestamp == 420.0);
  assert(selected->indicator_legends[0].values[0].has_value);
  assert(selected->content_revision == latest->content_revision);
  assert(selected->content_vertices == latest->content_vertices);
  ExpectNear(selected->indicator_legends[0].values[0].value, -1.0 / 54.0);
  ExpectColor(selected->indicator_legends[0].values[0].color,
              macd.macd_negative_increasing);
  engine.SetCrosshair(false, 0, 0);
  const auto restored = engine.Snapshot();
  ExpectColor(restored->indicator_legends[0].values[0].color,
              macd.macd_negative_decreasing);
  ExpectNear(restored->indicator_legends[0].values[0].value,
             latest_legend.values[0].value);

  const double append[] = {540.0, 8.0, 8.0, 8.0, 8.0, 1.0};
  assert(engine.UpdateCandle(append, std::size(append)) ==
         UpdateStatus::kApplied);
  histogram =
      trading_charts::ChartEngineTestAccess::SeriesHistogram(engine, "macd");
  assert(histogram.size() == 4);
  assert(histogram.back().value > 0.0);
  assert(trading_charts::ChartEngineTestAccess::MacdStateCount(engine,
                                                               "macd") == 9);

  const double replacement[] = {540.0, 7.0, 7.0, 7.0, 7.0, 1.0};
  assert(engine.UpdateCandle(replacement, std::size(replacement)) ==
         UpdateStatus::kApplied);
  assert(trading_charts::ChartEngineTestAccess::MacdStateCount(engine,
                                                               "macd") == 9);
  const double prepended[] = {0.0, 2.0, 2.0, 2.0, 2.0, 1.0};
  assert(engine.PrependHistory(prepended, std::size(prepended)) ==
         UpdateStatus::kApplied);
  assert(trading_charts::ChartEngineTestAccess::MacdStateCount(engine,
                                                               "macd") == 10);
}

void TestMacdValidationSourcesAndRsiPaneExclusion() {
  ChartEngine engine;
  engine.SetSize(600.0f, 360.0f);
  PaneConfig main;
  PaneConfig indicator;
  indicator.pane_id = "indicator";
  indicator.price_scale_id = "indicator";
  PaneConfig second_indicator = indicator;
  second_indicator.pane_id = "second";
  second_indicator.price_scale_id = "second";
  engine.SetPanes({main, indicator, second_indicator}, true);

  SeriesConfig macd;
  macd.series_id = "invalid-main";
  macd.type = SeriesType::kLine;
  macd.source = SeriesSource::kOhlcvMacd;
  macd.source_series_id = "main";
  assert(engine.AddSeries(macd) == UpdateStatus::kInvalidInput);
  macd.series_id = "invalid-order";
  macd.pane_id = "indicator";
  macd.price_scale_id = "indicator";
  macd.macd_fast_period = 26;
  macd.macd_slow_period = 12;
  assert(engine.AddSeries(macd) == UpdateStatus::kInvalidInput);

  macd.series_id = "macd";
  macd.macd_fast_period = 3;
  macd.macd_slow_period = 5;
  macd.macd_signal_period = 2;
  assert(engine.AddSeries(macd) == UpdateStatus::kApplied);
  SeriesConfig rsi;
  rsi.series_id = "rsi";
  rsi.type = SeriesType::kLine;
  rsi.source = SeriesSource::kOhlcvRsi;
  rsi.source_series_id = "main";
  rsi.pane_id = "indicator";
  rsi.price_scale_id = "indicator";
  assert(engine.AddSeries(rsi) == UpdateStatus::kInvalidInput);

  SeriesConfig source;
  source.series_id = "source";
  source.type = SeriesType::kLine;
  assert(engine.AddSeries(source) == UpdateStatus::kApplied);
  SeriesConfig custom_macd = macd;
  custom_macd.series_id = "custom-macd";
  custom_macd.pane_id = "second";
  custom_macd.price_scale_id = "second";
  custom_macd.source_series_id = "source";
  custom_macd.line_source = OhlcValueSource::kHigh;
  assert(engine.AddSeries(custom_macd) == UpdateStatus::kApplied);
  SeriesConfig derived_source = custom_macd;
  derived_source.series_id = "derived-source";
  derived_source.source_series_id = "macd";
  assert(engine.AddSeries(derived_source) == UpdateStatus::kInvalidInput);
  assert(engine.RemoveSeries("source"));
  assert(!engine.RemoveSeries("custom-macd"));
}

void TestDeclarativeOscillatorReplacement() {
  ChartEngine engine;
  engine.SetSize(500.0f, 400.0f);
  PaneConfig indicator;
  indicator.pane_id = "indicator";
  indicator.price_scale_id = "indicator";
  engine.SetPanes({PaneConfig{}, indicator}, true);
  const double history[] = {
      0.0,  10.0, 10.0, 10.0,     10.0, 1.0,  60000.0, 10.0, 10.0,
      10.0, 10.0, 1.0,  120000.0, 10.0, 10.0, 10.0,    10.0, 1.0,
  };
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  SeriesConfig series;
  series.series_id = "oscillator";
  series.type = SeriesType::kLine;
  series.source_series_id = "main";
  series.pane_id = indicator.pane_id;
  series.price_scale_id = indicator.price_scale_id;
  series.declarative = true;
  series.rsi_period = 2;
  series.macd_fast_period = 1;
  series.macd_slow_period = 2;
  series.macd_signal_period = 1;
  for (const auto source : {SeriesSource::kOhlcvRsi, SeriesSource::kOhlcvMacd,
                            SeriesSource::kOhlcvRsi}) {
    series.source = source;
    assert(engine.AddSeries(series) == UpdateStatus::kApplied);
    const auto frame = engine.Snapshot();
    assert(frame->indicator_legends.size() == 1);
    const bool rsi = source == SeriesSource::kOhlcvRsi;
    assert(frame->panes[1].rsi_scale == rsi);
    const auto& value = frame->indicator_legends[0].values[0];
    assert(value.has_value);
    ExpectNear(value.value, rsi ? 50.0 : 0.0);
    assert(frame->indicator_legends[0].kind ==
           (rsi ? IndicatorKind::kRsi : IndicatorKind::kMacd));
  }
  assert(engine.RemoveSeries(series.series_id));
  assert(engine.Snapshot()->indicator_legends.empty());
}

void TestMacdAllOhlcSourcesAndFlatHistory() {
  ChartEngine engine;
  engine.SetSize(600.0f, 360.0f);
  PaneConfig main;
  PaneConfig indicator;
  indicator.pane_id = "indicator";
  indicator.price_scale_id = "indicator";
  engine.SetPanes({main, indicator}, false);
  const std::array<OhlcValueSource, 4> sources{
      OhlcValueSource::kOpen,
      OhlcValueSource::kHigh,
      OhlcValueSource::kLow,
      OhlcValueSource::kClose,
  };
  for (size_t index = 0; index < sources.size(); ++index) {
    SeriesConfig macd;
    macd.series_id = "macd-" + std::to_string(index);
    macd.pane_id = "indicator";
    macd.price_scale_id = "indicator";
    macd.type = SeriesType::kLine;
    macd.source = SeriesSource::kOhlcvMacd;
    macd.source_series_id = "main";
    macd.macd_fast_period = 1;
    macd.macd_slow_period = 2;
    macd.macd_signal_period = 1;
    macd.line_source = sources[index];
    assert(engine.AddSeries(macd) == UpdateStatus::kApplied);
  }
  const double history[] = {
      60.0, 10.0, 14.0, 8.0, 11.0, 1.0, 120.0, 20.0, 26.0, 18.0, 22.0, 1.0,
  };
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  const std::array<double, 4> expected{5.0, 6.0, 5.0, 5.5};
  for (size_t index = 0; index < expected.size(); ++index) {
    const auto values = trading_charts::ChartEngineTestAccess::SeriesCandles(
        engine, "macd-" + std::to_string(index));
    assert(values.size() == 1);
    ExpectNear(values[0].close, expected[index]);
  }

  const double flat[] = {
      60.0, 10.0, 10.0, 10.0,  10.0, 1.0,  120.0, 10.0, 10.0,
      10.0, 10.0, 1.0,  180.0, 10.0, 10.0, 10.0,  10.0, 1.0,
  };
  assert(engine.SetHistory(flat, std::size(flat)) == UpdateStatus::kApplied);
  for (size_t index = 0; index < sources.size(); ++index) {
    const auto histogram =
        trading_charts::ChartEngineTestAccess::SeriesHistogram(
            engine, "macd-" + std::to_string(index));
    assert(histogram.size() == 2);
    ExpectNear(histogram.back().value, 0.0);
  }
}

}  // namespace

void RunOscillatorsTests() {
  TestIndicatorAppendBufferGrowth();
  TestRangeOscillatorFormulas();
  TestRangeOscillatorFramesAndStreaming();
  TestDerivedRsiPaneAndIncrementalUpdates();
  TestRsiEdgeValuesAndWarmup();
  TestRsiFlatAndCascadeRemoval();
  TestBatchReplacesConflictingIndicatorsTogether();
  TestMacdWarmupIncrementalLegendAndAutoscale();
  TestMacdValidationSourcesAndRsiPaneExclusion();
  TestDeclarativeOscillatorReplacement();
  TestMacdAllOhlcSourcesAndFlatHistory();
}

}  // namespace trading_charts::test
