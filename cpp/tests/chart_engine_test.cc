// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/chart_engine.h"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <iostream>
#include <vector>

using trading_charts::Candle;
using trading_charts::ChartConfig;
using trading_charts::ChartEngine;
using trading_charts::PaneConfig;
using trading_charts::SeriesConfig;
using trading_charts::SeriesSource;
using trading_charts::SeriesType;
using trading_charts::UpdateStatus;

namespace {

void ExpectNear(double actual, double expected, double tolerance = 1e-9) {
  if (!(std::abs(actual - expected) < tolerance)) {
    std::cerr << "Expected " << actual << " to be within " << tolerance
              << " of " << expected << '\n';
    assert(false);
  }
}

struct QuadBounds {
  float left = 0.0f;
  float top = 0.0f;
  float right = 0.0f;
  float bottom = 0.0f;
  trading_charts::Color color;
};

QuadBounds SnapshotQuad(const trading_charts::RenderSnapshot& snapshot,
                        size_t quad_index) {
  constexpr size_t kFloatsPerVertex = 6;
  constexpr size_t kVerticesPerQuad = 6;
  constexpr size_t kFloatsPerQuad = kFloatsPerVertex * kVerticesPerQuad;
  const size_t offset = quad_index * kFloatsPerQuad;
  assert(offset + kFloatsPerQuad <= snapshot.vertices.size());

  QuadBounds bounds{
      snapshot.vertices[offset],
      snapshot.vertices[offset + 1],
      snapshot.vertices[offset],
      snapshot.vertices[offset + 1],
      {
          snapshot.vertices[offset + 2],
          snapshot.vertices[offset + 3],
          snapshot.vertices[offset + 4],
          snapshot.vertices[offset + 5],
      },
  };
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const size_t vertex_offset = offset + vertex * kFloatsPerVertex;
    bounds.left = std::min(bounds.left, snapshot.vertices[vertex_offset]);
    bounds.top = std::min(bounds.top, snapshot.vertices[vertex_offset + 1]);
    bounds.right = std::max(bounds.right, snapshot.vertices[vertex_offset]);
    bounds.bottom =
        std::max(bounds.bottom, snapshot.vertices[vertex_offset + 1]);
  }
  return bounds;
}

float QuadCenterX(const QuadBounds& quad) {
  return (quad.left + quad.right) * 0.5f;
}

float QuadCenterY(const QuadBounds& quad) {
  return (quad.top + quad.bottom) * 0.5f;
}

float RenderedCandleBodyWidth(const trading_charts::RenderSnapshot& snapshot,
                              size_t candle_offset) {
  constexpr size_t kFloatsPerVertex = 6;
  constexpr size_t kVerticesPerQuad = 6;
  constexpr size_t kFloatsPerQuad = kFloatsPerVertex * kVerticesPerQuad;
  constexpr size_t kQuadsPerCandle = 2;
  const size_t grid_quad_count =
      snapshot.x_ticks.size() + snapshot.y_ticks.size();
  const size_t body_quad =
      grid_quad_count + candle_offset * kQuadsPerCandle + 1;
  const size_t offset = body_quad * kFloatsPerQuad;
  assert(offset + kFloatsPerQuad <= snapshot.vertices.size());

  float minimum_x = snapshot.vertices[offset];
  float maximum_x = minimum_x;
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const float x = snapshot.vertices[offset + vertex * kFloatsPerVertex];
    minimum_x = std::min(minimum_x, x);
    maximum_x = std::max(maximum_x, x);
  }
  return maximum_x - minimum_x;
}

float RenderedCandleBodyCenter(const trading_charts::RenderSnapshot& snapshot,
                               size_t candle_offset) {
  constexpr size_t kFloatsPerVertex = 6;
  constexpr size_t kVerticesPerQuad = 6;
  constexpr size_t kFloatsPerQuad = kFloatsPerVertex * kVerticesPerQuad;
  constexpr size_t kQuadsPerCandle = 2;
  const size_t grid_quad_count =
      snapshot.x_ticks.size() + snapshot.y_ticks.size();
  const size_t body_quad =
      grid_quad_count + candle_offset * kQuadsPerCandle + 1;
  const size_t offset = body_quad * kFloatsPerQuad;
  assert(offset + kFloatsPerQuad <= snapshot.vertices.size());

  float minimum_x = snapshot.vertices[offset];
  float maximum_x = minimum_x;
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const float x = snapshot.vertices[offset + vertex * kFloatsPerVertex];
    minimum_x = std::min(minimum_x, x);
    maximum_x = std::max(maximum_x, x);
  }
  return (minimum_x + maximum_x) * 0.5f;
}

void TestTradeAggregation() {
  ChartEngine engine;
  ChartConfig config;
  config.timeframe_ms = 60000.0;
  engine.SetConfig(config);

  const double first[] = {1000.0, 10.0, 2.0};
  const double second[] = {2000.0, 12.0, 3.0};
  const double third[] = {3000.0, 9.0, 1.0};
  assert(engine.UpdateTrade(first, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(second, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(third, 3) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 1);
  const auto candle = engine.CandleAt(0);
  ExpectNear(candle.timestamp, 0.0);
  ExpectNear(candle.open, 10.0);
  ExpectNear(candle.high, 12.0);
  ExpectNear(candle.low, 9.0);
  ExpectNear(candle.close, 9.0);
  ExpectNear(candle.volume, 6.0);
}

void TestBucketTransitionAndNoGaps() {
  ChartEngine engine;
  const double trades[] = {
      1000.0, 10.0, 1.0, 180000.0, 15.0, 2.0,
  };
  assert(engine.UpdateTrades(trades, 6) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 2);
  ExpectNear(engine.CandleAt(1).timestamp, 180000.0);
}

void TestHistoryContinuation() {
  ChartEngine engine;
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 4.0, 60000.0, 11.0, 13.0, 10.0, 12.0, 5.0,
  };
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  const double trade[] = {61000.0, 14.0, 2.0};
  assert(engine.UpdateTrade(trade, 3) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 2);
  const auto candle = engine.CandleAt(1);
  ExpectNear(candle.open, 11.0);
  ExpectNear(candle.high, 14.0);
  ExpectNear(candle.close, 14.0);
  ExpectNear(candle.volume, 7.0);
}

void TestPrependHistoryPreservesViewport() {
  for (bool logical_spacing : {false, true}) {
    ChartEngine engine;
    ChartConfig config;
    config.initial_visible_count = 2;
    config.logical_spacing = logical_spacing;
    engine.SetConfig(config);
    engine.SetSize(800.0f, 500.0f);
    const double history[] = {
        120000.0, 10.0, 12.0, 9.0,      11.0, 1.0,  180000.0, 11.0, 13.0,
        10.0,     12.0, 1.0,  240000.0, 12.0, 14.0, 11.0,     13.0, 1.0,
    };
    const double older[] = {
        0.0, 8.0, 10.0, 7.0, 9.0, 1.0, 60000.0, 9.0, 11.0, 8.0, 10.0, 1.0,
    };
    assert(engine.SetHistory(history, 18) == UpdateStatus::kApplied);
    const auto before = engine.Snapshot();
    assert(before->has_visible_candles);
    assert(before->total_candle_count == 3);

    assert(engine.PrependHistory(older, 12) == UpdateStatus::kApplied);
    const auto after = engine.Snapshot();
    assert(engine.CandleCount() == 5);
    assert(after->has_visible_candles);
    assert(after->total_candle_count == 5);
    assert(after->first_visible_index == before->first_visible_index + 2);
    assert(after->last_visible_index == before->last_visible_index + 2);
    ExpectNear(after->visible_x_min, before->visible_x_min);
    ExpectNear(after->visible_x_max, before->visible_x_max);
    ExpectNear(after->horizontal_scale, before->horizontal_scale);
  }
}

void TestCandlesReturnsAtomicCopyOfCurrentStore() {
  ChartEngine engine;
  const double history[] = {
      60000.0,  10.0, 12.0, 9.0,  11.0, 2.0,
      120000.0, 11.0, 13.0, 10.0, 12.0, 3.0,
  };
  const double older[] = {0.0, 8.0, 10.0, 7.0, 9.0, 1.0};
  const double updated[] = {120000.0, 11.0, 14.0, 10.0, 13.0, 4.0};
  const double trade[] = {120500.0, 14.5, 1.0};
  const double trades[] = {
      121000.0, 15.0, 2.0, 180000.0, 16.0, 1.0,
  };
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  assert(engine.PrependHistory(older, 6) == UpdateStatus::kApplied);
  assert(engine.UpdateCandle(updated, 6) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(trade, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrades(trades, 6) == UpdateStatus::kApplied);

  const auto copy = engine.Candles();
  assert(copy.size() == 4);
  ExpectNear(copy[0].timestamp, 0.0);
  ExpectNear(copy[2].high, 15.0);
  ExpectNear(copy[2].close, 15.0);
  ExpectNear(copy[2].volume, 7.0);
  ExpectNear(copy[3].timestamp, 180000.0);
  ExpectNear(copy[3].open, 16.0);

  engine.Clear();
  assert(engine.Candles().empty());
  assert(copy.size() == 4);
}

void TestPrependHistoryRejectsOverlap() {
  ChartEngine engine;
  const double history[] = {60000.0, 10.0, 12.0, 9.0, 11.0, 1.0};
  const double overlap[] = {60000.0, 9.0, 11.0, 8.0, 10.0, 1.0};
  assert(engine.SetHistory(history, 6) == UpdateStatus::kApplied);
  assert(engine.PrependHistory(overlap, 6) == UpdateStatus::kInvalidInput);
  assert(engine.CandleCount() == 1);
}

void TestOldTradeIgnored() {
  ChartEngine engine;
  const double current[] = {70000.0, 10.0, 1.0};
  const double old[] = {60000.0, 20.0, 1.0};
  assert(engine.UpdateTrade(current, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(old, 3) == UpdateStatus::kIgnoredOldTimestamp);
  ExpectNear(engine.CandleAt(0).close, 10.0);
}

void TestRejectsUnalignedHistory() {
  ChartEngine engine;
  const double history[] = {1.0, 10.0, 12.0, 9.0, 11.0, 4.0};
  assert(engine.SetHistory(history, 6) == UpdateStatus::kInvalidInput);
  assert(engine.CandleCount() == 0);
}

void TestSnapshotAndAutoscale() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 4.0, 60000.0, 11.0, 20.0, 10.0, 12.0, 5.0,
  };
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  const auto snapshot = engine.Snapshot();
  assert(snapshot->visible_y_min < 9.0);
  assert(snapshot->visible_y_max > 20.0);
  assert(!snapshot->vertices.empty());
  assert(!snapshot->x_ticks.empty());
  assert(!snapshot->y_ticks.empty());
}

void TestDisplayScaleKeepsAxisDensityStable() {
  ChartConfig logical_config;
  logical_config.initial_visible_count = 48;

  ChartConfig dense_config = logical_config;
  dense_config.display_scale = 3.0f;
  dense_config.x_axis_height *= dense_config.display_scale;
  dense_config.y_axis_width *= dense_config.display_scale;

  ChartEngine logical;
  logical.SetConfig(logical_config);
  logical.SetSize(400.0f, 800.0f);

  ChartEngine dense;
  dense.SetConfig(dense_config);
  dense.SetSize(1200.0f, 2400.0f);

  std::vector<double> history;
  history.reserve(size_t{60} * 6);
  for (int i = 0; i < 60; ++i) {
    const double open = 100.0 + static_cast<double>(i % 10);
    history.insert(history.end(), {
                                      static_cast<double>(i) * 300000.0,
                                      open,
                                      open + 3.0,
                                      open - 2.0,
                                      open + 1.0,
                                      1.0,
                                  });
  }

  assert(logical.SetHistory(history.data(), history.size()) ==
         UpdateStatus::kApplied);
  assert(dense.SetHistory(history.data(), history.size()) ==
         UpdateStatus::kApplied);

  const auto logical_snapshot = logical.Snapshot();
  const auto dense_snapshot = dense.Snapshot();
  assert(logical_snapshot->x_ticks.size() == dense_snapshot->x_ticks.size());
  assert(logical_snapshot->y_ticks.size() == dense_snapshot->y_ticks.size());
  for (size_t i = 0; i < logical_snapshot->x_ticks.size(); ++i) {
    ExpectNear(logical_snapshot->x_ticks[i].value,
               dense_snapshot->x_ticks[i].value);
  }
  for (size_t i = 0; i < logical_snapshot->y_ticks.size(); ++i) {
    ExpectNear(logical_snapshot->y_ticks[i].value,
               dense_snapshot->y_ticks[i].value);
  }
}

void TestOneTickRangeUsesScaleMargins() {
  ChartEngine engine;
  ChartConfig config;
  config.min_move = 0.0001;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,     1.0004, 1.0005, 1.0004, 1.0004, 1.0,
      60000.0, 1.0004, 1.0005, 1.0004, 1.0004, 1.0,
  };
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);

  const auto snapshot = engine.Snapshot();
  const double inner_scale = 0.7;
  ExpectNear(snapshot->visible_y_min, 1.0004 - 0.0001 * 0.1 / inner_scale);
  ExpectNear(snapshot->visible_y_max, 1.0005 + 0.0001 * 0.2 / inner_scale);

  const double plot_height = snapshot->plot.Height();
  const double expected_low_y = snapshot->plot.bottom - plot_height * 0.1;
  ExpectNear(snapshot->current_price_y, expected_low_y, 1e-3);
  assert(snapshot->current_price_y > snapshot->plot.top);
  assert(snapshot->current_price_y < snapshot->plot.bottom);
}

void TestFlatRangeUsesMinMove() {
  ChartEngine engine;
  ChartConfig config;
  config.min_move = 0.01;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {0.0, 65.0, 65.0, 65.0, 65.0, 1.0};
  assert(engine.SetHistory(history, 6) == UpdateStatus::kApplied);

  const auto snapshot = engine.Snapshot();
  const double raw_min = 65.0 - 5.0 * config.min_move;
  const double raw_max = 65.0 + 5.0 * config.min_move;
  const double raw_range = raw_max - raw_min;
  ExpectNear(snapshot->visible_y_min, raw_min - raw_range * 0.1 / 0.7);
  ExpectNear(snapshot->visible_y_max, raw_max + raw_range * 0.2 / 0.7);
  assert(!snapshot->y_ticks.empty());
}

void TestCustomScaleMargins() {
  ChartEngine engine;
  ChartConfig config;
  config.y_scale_margin_top = 0.25;
  config.y_scale_margin_bottom = 0.15;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {0.0, 10.0, 20.0, 10.0, 15.0, 1.0};
  assert(engine.SetHistory(history, 6) == UpdateStatus::kApplied);

  const auto snapshot = engine.Snapshot();
  ExpectNear(snapshot->visible_y_min, 10.0 - 10.0 * 0.15 / 0.6);
  ExpectNear(snapshot->visible_y_max, 20.0 + 10.0 * 0.25 / 0.6);
}

void TestVisiblePriceExtremes() {
  const double history[] = {
      0.0,      10.0, 100.0, 9.0,      10.0, 1.0,  60000.0,  11.0, 20.0,
      8.0,      12.0, 1.0,   120000.0, 12.0, 30.0, 7.0,      13.0, 1.0,
      180000.0, 40.0, 44.0,  39.0,     43.0, 1.0,  240000.0, 42.0, 48.0,
      4.0,      45.0, 1.0,   300000.0, 44.0, 48.0, 43.0,     47.0, 1.0,
  };

  for (bool logical_spacing : {false, true}) {
    ChartEngine engine;
    ChartConfig config;
    config.initial_visible_count = 3;
    config.logical_spacing = logical_spacing;
    engine.SetConfig(config);
    engine.SetSize(800.0f, 500.0f);
    assert(engine.SetHistory(history, 36) == UpdateStatus::kApplied);

    const auto initial = engine.Snapshot();
    assert(initial->visible_maximum.visible);
    assert(initial->visible_minimum.visible);
    ExpectNear(initial->visible_maximum.value, 48.0);
    ExpectNear(initial->visible_minimum.value, 4.0);
    ExpectNear(initial->visible_maximum.x, initial->visible_minimum.x, 1e-5);
    ExpectNear(initial->visible_maximum.y,
               initial->plot.bottom -
                   (48.0 - initial->visible_y_min) /
                       (initial->visible_y_max - initial->visible_y_min) *
                       initial->plot.Height(),
               1e-5);
    assert(initial->visible_maximum.label_on_right ==
           (initial->visible_maximum.x <=
            (initial->plot.left + initial->plot.right) * 0.5f));

    assert(engine.Pan(10000.0f));
    const auto historical = engine.Snapshot();
    ExpectNear(historical->visible_maximum.value, 100.0);
    ExpectNear(historical->visible_minimum.value, 4.0);
    assert(!historical->visible_minimum.label_on_right);

    engine.ScaleY(-historical->plot.Height() * 100.0f);
    const auto vertically_clipped = engine.Snapshot();
    assert(!vertically_clipped->visible_maximum.visible);
    assert(!vertically_clipped->visible_minimum.visible);
  }

  ChartEngine flat;
  flat.SetSize(800.0f, 500.0f);
  const double flat_history[] = {0.0, 65.0, 65.0, 65.0, 65.0, 1.0};
  assert(flat.SetHistory(flat_history, 6) == UpdateStatus::kApplied);
  const auto flat_snapshot = flat.Snapshot();
  assert(flat_snapshot->visible_maximum.visible);
  assert(!flat_snapshot->visible_minimum.visible);
  ExpectNear(flat_snapshot->visible_maximum.value, 65.0);

  ChartEngine hidden;
  ChartConfig hidden_config;
  hidden_config.show_price_extremes = false;
  hidden.SetConfig(hidden_config);
  hidden.SetSize(800.0f, 500.0f);
  assert(hidden.SetHistory(history, 36) == UpdateStatus::kApplied);
  const auto hidden_snapshot = hidden.Snapshot();
  assert(!hidden_snapshot->visible_maximum.visible);
  assert(!hidden_snapshot->visible_minimum.visible);

  ChartEngine empty;
  const auto empty_snapshot = empty.Snapshot();
  assert(!empty_snapshot->visible_maximum.visible);
  assert(!empty_snapshot->visible_minimum.visible);
}

void TestAutoscaleSupportsDifferentMagnitudesAndNegativeValues() {
  const std::vector<std::vector<double>> histories = {
      {0.0, 0.000000002, 0.000000003, 0.000000001, 0.000000002, 1.0},
      {0.0, 1000000000000.0, 1000000000500.0, 999999999500.0, 1000000000250.0,
       1.0},
      {0.0, -10.0, -8.0, -12.0, -9.0, 1.0},
  };

  for (const auto& history : histories) {
    ChartEngine engine;
    engine.SetSize(800.0f, 500.0f);
    assert(engine.SetHistory(history.data(), history.size()) ==
           UpdateStatus::kApplied);
    const auto snapshot = engine.Snapshot();
    assert(std::isfinite(snapshot->visible_y_min));
    assert(std::isfinite(snapshot->visible_y_max));
    assert(snapshot->visible_y_max > snapshot->visible_y_min);
    assert(snapshot->current_price_y > snapshot->plot.top);
    assert(snapshot->current_price_y < snapshot->plot.bottom);
  }
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

void TestYAxisScalePersistsAcrossHorizontalPanAndResets() {
  ChartConfig config;
  config.initial_visible_count = 3;
  ChartEngine autoscale;
  ChartEngine manual_scale;
  autoscale.SetConfig(config);
  manual_scale.SetConfig(config);
  autoscale.SetSize(800.0f, 500.0f);
  manual_scale.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,      10.0, 12.0, 9.0,      11.0, 1.0,  60000.0,  11.0, 13.0,
      10.0,     12.0, 1.0,  120000.0, 12.0, 14.0, 11.0,     13.0, 1.0,
      180000.0, 40.0, 44.0, 39.0,     43.0, 1.0,  240000.0, 42.0, 46.0,
      41.0,     45.0, 1.0,  300000.0, 44.0, 48.0, 43.0,     47.0, 1.0,
  };
  assert(autoscale.SetHistory(history, 36) == UpdateStatus::kApplied);
  assert(manual_scale.SetHistory(history, 36) == UpdateStatus::kApplied);

  const auto initial = manual_scale.Snapshot();
  manual_scale.ScaleY(
      static_cast<float>(-initial->plot.Height() * std::log(2.0)));
  autoscale.Pan(500.0f);
  manual_scale.Pan(500.0f);

  const auto automatic = autoscale.Snapshot();
  const auto manual = manual_scale.Snapshot();
  ExpectNear(manual->visible_y_max - manual->visible_y_min,
             (automatic->visible_y_max - automatic->visible_y_min) * 0.5, 1e-6);
  ExpectNear((manual->visible_y_max + manual->visible_y_min) * 0.5,
             (automatic->visible_y_max + automatic->visible_y_min) * 0.5, 1e-9);

  autoscale.ResetViewport();
  manual_scale.ResetViewport();
  ExpectNear(manual_scale.Snapshot()->visible_y_max -
                 manual_scale.Snapshot()->visible_y_min,
             autoscale.Snapshot()->visible_y_max -
                 autoscale.Snapshot()->visible_y_min);

  manual_scale.ScaleY(-100.0f);
  assert(manual_scale.SetHistory(history, 36) == UpdateStatus::kApplied);
  ExpectNear(manual_scale.Snapshot()->visible_y_max -
                 manual_scale.Snapshot()->visible_y_min,
             autoscale.Snapshot()->visible_y_max -
                 autoscale.Snapshot()->visible_y_min);
}

void TestYAxisScaleHasIndependentOptionAndDefault() {
  ChartEngine engine;
  ChartConfig config;
  config.allow_zoom = false;
  config.allow_y_axis_scale = true;
  config.default_y_scale = 2.0;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {0.0, 10.0, 20.0, 10.0, 15.0, 1.0};
  assert(engine.SetHistory(history, 6) == UpdateStatus::kApplied);

  const auto initial = engine.Snapshot();
  ExpectNear(initial->y_axis_scale, 2.0);
  assert(engine.ScaleY(-initial->plot.Height() * 0.25f));
  assert(engine.Snapshot()->y_axis_scale > initial->y_axis_scale);

  engine.ResetViewport();
  ExpectNear(engine.Snapshot()->y_axis_scale, 2.0);
  engine.ScaleY(initial->plot.Height() * 0.25f);
  engine.FitContent();
  ExpectNear(engine.Snapshot()->y_axis_scale, 2.0);

  config.allow_zoom = true;
  config.allow_y_axis_scale = false;
  engine.SetConfig(config);
  const auto disabled = engine.Snapshot();
  assert(!engine.ScaleY(-disabled->plot.Height()));
  const auto unchanged = engine.Snapshot();
  ExpectNear(unchanged->visible_y_min, disabled->visible_y_min);
  ExpectNear(unchanged->visible_y_max, disabled->visible_y_max);
}

void TestCurrentPriceRemainsVisibleOutsideHorizontalViewport() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 3;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,      10.0, 11.0, 9.0,      10.0, 1.0,  60000.0,  10.0, 11.0,
      9.0,      10.0, 1.0,  120000.0, 10.0, 11.0, 9.0,      10.0, 1.0,
      180000.0, 10.0, 11.0, 9.0,      10.0, 1.0,  240000.0, 10.0, 11.0,
      9.0,      10.0, 1.0,  300000.0, 10.0, 11.0, 9.0,      10.0, 1.0,
  };
  assert(engine.SetHistory(history, 36) == UpdateStatus::kApplied);
  engine.Pan(500.0f);

  const auto snapshot = engine.Snapshot();
  assert(engine.CandleAt(engine.CandleCount() - 1).timestamp >
         snapshot->visible_x_max);
  assert(snapshot->current_price_visible);
  assert(snapshot->current_price_y >= snapshot->plot.top);
  assert(snapshot->current_price_y <= snapshot->plot.bottom);
}

void TestCurrentPricePinsToVerticalViewportEdges() {
  const auto snapshot_for_current_price =
      [](double open, double high, double low, double close, bool pin_to_edge,
         bool visible = true) {
        ChartEngine engine;
        ChartConfig config;
        config.initial_visible_count = 3;
        config.show_current_price = visible;
        config.pin_current_price_to_edge = pin_to_edge;
        engine.SetConfig(config);
        engine.SetSize(800.0f, 500.0f);
        const double history[] = {
            0.0,      10.0, 11.0, 9.0,      10.0, 1.0,  60000.0,  10.0,  11.0,
            9.0,      10.0, 1.0,  120000.0, 10.0, 11.0, 9.0,      10.0,  1.0,
            180000.0, 10.0, 11.0, 9.0,      10.0, 1.0,  240000.0, 10.0,  11.0,
            9.0,      10.0, 1.0,  300000.0, open, high, low,      close, 1.0,
        };
        assert(engine.SetHistory(history, 36) == UpdateStatus::kApplied);
        engine.Pan(500.0f);
        return engine.Snapshot();
      };

  const auto above = snapshot_for_current_price(99.0, 101.0, 98.0, 100.0, true);
  assert(above->current_price_visible);
  ExpectNear(above->current_price, 100.0);
  ExpectNear(above->current_price_y, above->plot.top);

  const auto below = snapshot_for_current_price(1.0, 2.0, 0.0, 1.0, true);
  assert(below->current_price_visible);
  ExpectNear(below->current_price, 1.0);
  ExpectNear(below->current_price_y, below->plot.bottom);

  const auto inside = snapshot_for_current_price(10.0, 11.0, 9.0, 10.0, true);
  assert(inside->current_price_visible);
  assert(inside->current_price_y > inside->plot.top);
  assert(inside->current_price_y < inside->plot.bottom);

  const auto unpinned =
      snapshot_for_current_price(99.0, 101.0, 98.0, 100.0, false);
  assert(!unpinned->current_price_visible);

  const auto hidden =
      snapshot_for_current_price(99.0, 101.0, 98.0, 100.0, true, false);
  assert(!hidden->current_price_visible);
  assert(above->vertices.size() == hidden->vertices.size());

  const auto inside_hidden =
      snapshot_for_current_price(10.0, 11.0, 9.0, 10.0, true, false);
  assert(inside->vertices.size() > inside_hidden->vertices.size());
}

void TestDefaultScaleControlsResetViewport() {
  ChartEngine base_engine;
  ChartConfig base_config;
  base_config.initial_visible_count = 10;
  base_engine.SetConfig(base_config);
  base_engine.SetSize(800.0f, 500.0f);

  ChartEngine scaled_engine;
  ChartConfig scaled_config = base_config;
  scaled_config.default_scale = 2.0;
  scaled_engine.SetConfig(scaled_config);
  scaled_engine.SetSize(800.0f, 500.0f);

  std::vector<double> history;
  for (int i = 0; i < 12; ++i) {
    const double open = 100.0 + i;
    history.insert(history.end(), {
                                      static_cast<double>(i) * 60000.0,
                                      open,
                                      open + 2.0,
                                      open - 2.0,
                                      open + 1.0,
                                      1.0,
                                  });
  }
  assert(base_engine.SetHistory(history.data(), history.size()) ==
         UpdateStatus::kApplied);
  assert(scaled_engine.SetHistory(history.data(), history.size()) ==
         UpdateStatus::kApplied);

  const auto base = base_engine.Snapshot();
  const auto scaled = scaled_engine.Snapshot();
  const double base_span = base->visible_x_max - base->visible_x_min;
  const double scaled_span = scaled->visible_x_max - scaled->visible_x_min;
  ExpectNear(scaled->visible_x_max, base->visible_x_max);
  ExpectNear(scaled_span, base_span / 2.0);
  ExpectNear(base->horizontal_scale, 1.0);
  ExpectNear(scaled->horizontal_scale, 2.0);

  assert(scaled_engine.Zoom(2.0, 400.0f));
  ExpectNear(scaled_engine.Snapshot()->horizontal_scale, 4.0);
  scaled_engine.ResetViewport();

  scaled_engine.Pan(100.0f);
  scaled_engine.ResetViewport();
  const auto reset = scaled_engine.Snapshot();
  ExpectNear(reset->visible_x_max, scaled->visible_x_max);
  ExpectNear(reset->visible_x_max - reset->visible_x_min, scaled_span);
  ExpectNear(reset->horizontal_scale, 2.0);

  ChartConfig next_config = scaled_config;
  next_config.default_scale = 4.0;
  scaled_engine.SetConfig(next_config);
  const auto unchanged = scaled_engine.Snapshot();
  ExpectNear(unchanged->visible_x_min, reset->visible_x_min);
  ExpectNear(unchanged->visible_x_max, reset->visible_x_max);
  scaled_engine.ResetViewport();
  const auto next_reset = scaled_engine.Snapshot();
  ExpectNear(next_reset->visible_x_max - next_reset->visible_x_min,
             base_span / 4.0);
  ExpectNear(next_reset->horizontal_scale, 4.0);
}

void TestCurrentPriceLineIsOneUnitThick() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0, 60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
  };
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  const auto snapshot = engine.Snapshot();
  assert(snapshot->current_price_visible);
  constexpr size_t kFloatsPerVertex = 6;
  constexpr size_t kVerticesPerQuad = 6;
  constexpr size_t kFloatsPerQuad = kFloatsPerVertex * kVerticesPerQuad;
  assert(snapshot->vertices.size() >= kFloatsPerQuad);
  const size_t offset = snapshot->vertices.size() - kFloatsPerQuad;
  float minimum_y = snapshot->vertices[offset + 1];
  float maximum_y = minimum_y;
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const float y = snapshot->vertices[offset + vertex * kFloatsPerVertex + 1];
    minimum_y = std::min(minimum_y, y);
    maximum_y = std::max(maximum_y, y);
  }
  ExpectNear(maximum_y - minimum_y, 1.0, 1e-6);
}

void ExpectSameCandles(const ChartEngine& left, const ChartEngine& right) {
  assert(left.CandleCount() == right.CandleCount());
  for (size_t i = 0; i < left.CandleCount(); ++i) {
    const Candle a = left.CandleAt(i);
    const Candle b = right.CandleAt(i);
    ExpectNear(a.timestamp, b.timestamp);
    ExpectNear(a.open, b.open);
    ExpectNear(a.high, b.high);
    ExpectNear(a.low, b.low);
    ExpectNear(a.close, b.close);
    ExpectNear(a.volume, b.volume);
  }
}

void TestTradeBatchMatchesSingles() {
  const double trades[] = {
      1000.0,  10.0, 1.0, 2000.0,  12.0, 2.0,
      61000.0, 11.0, 3.0, 62000.0, 13.0, 4.0,
  };
  ChartEngine singles;
  ChartEngine batch;
  for (size_t i = 0; i < 12; i += 3) {
    assert(singles.UpdateTrade(trades + i, 3) == UpdateStatus::kApplied);
  }
  assert(batch.UpdateTrades(trades, 12) == UpdateStatus::kApplied);
  ExpectSameCandles(singles, batch);
}

void TestReadyCandleFeed() {
  ChartEngine engine;
  const double history[] = {0.0, 10.0, 12.0, 9.0, 11.0, 4.0};
  const double replacement[] = {0.0, 10.0, 14.0, 8.0, 13.0, 8.0};
  const double appended[] = {60000.0, 13.0, 15.0, 12.0, 14.0, 2.0};
  assert(engine.SetHistory(history, 6) == UpdateStatus::kApplied);
  assert(engine.UpdateCandle(replacement, 6) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 1);
  ExpectNear(engine.CandleAt(0).close, 13.0);
  assert(engine.UpdateCandle(appended, 6) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 2);
}

void TestViewportStopsFollowingAfterPan() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,  10.0, 12.0,     9.0,  11.0,     1.0,  60000.0, 11.0,
      13.0, 10.0, 12.0,     1.0,  120000.0, 12.0, 14.0,    11.0,
      13.0, 1.0,  180000.0, 13.0, 15.0,     12.0, 14.0,    1.0,
  };
  assert(engine.SetHistory(history, 24) == UpdateStatus::kApplied);
  engine.Zoom(2.0, 400.0f);
  engine.Pan(250.0f);
  const double before = engine.Snapshot()->visible_x_max;
  const double next[] = {240000.0, 14.0, 16.0, 13.0, 15.0, 1.0};
  assert(engine.UpdateCandle(next, 6) == UpdateStatus::kApplied);
  ExpectNear(engine.Snapshot()->visible_x_max, before);
}

void TestViewportFollowsNewCandleAtLiveEdge() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,  10.0, 12.0,     9.0,  11.0,     1.0,  60000.0, 11.0,
      13.0, 10.0, 12.0,     1.0,  120000.0, 12.0, 14.0,    11.0,
      13.0, 1.0,  180000.0, 13.0, 15.0,     12.0, 14.0,    1.0,
  };
  assert(engine.SetHistory(history, 24) == UpdateStatus::kApplied);
  const double before = engine.Snapshot()->visible_x_max;
  const double next[] = {240000.0, 14.0, 16.0, 13.0, 15.0, 1.0};
  assert(engine.UpdateCandle(next, 6) == UpdateStatus::kApplied);
  ExpectNear(engine.Snapshot()->visible_x_max, before + 60000.0);
}

void TestViewportFollowsNewTradeBucketAtLiveEdge() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0, 60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
  };
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  const double before = engine.Snapshot()->visible_x_max;
  const double trade[] = {120500.0, 14.0, 1.0};
  assert(engine.UpdateTrade(trade, 3) == UpdateStatus::kApplied);
  ExpectNear(engine.Snapshot()->visible_x_max, before + 60000.0);
}

void TestViewportResumesFollowingAfterReturningToLiveEdge() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 3;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,      10.0, 12.0, 9.0,      11.0, 1.0,  60000.0,  11.0, 13.0,
      10.0,     12.0, 1.0,  120000.0, 12.0, 14.0, 11.0,     13.0, 1.0,
      180000.0, 13.0, 15.0, 12.0,     14.0, 1.0,  240000.0, 14.0, 16.0,
      13.0,     15.0, 1.0,  300000.0, 15.0, 17.0, 14.0,     16.0, 1.0,
  };
  assert(engine.SetHistory(history, 36) == UpdateStatus::kApplied);

  assert(engine.Pan(250.0f));
  const double historical_edge = engine.Snapshot()->visible_x_max;
  const double first_next[] = {360000.0, 16.0, 18.0, 15.0, 17.0, 1.0};
  assert(engine.UpdateCandle(first_next, 6) == UpdateStatus::kApplied);
  ExpectNear(engine.Snapshot()->visible_x_max, historical_edge);

  assert(engine.Pan(-100000.0f));
  const double live_edge = engine.Snapshot()->visible_x_max;
  const double second_next[] = {420000.0, 17.0, 19.0, 16.0, 18.0, 1.0};
  assert(engine.UpdateCandle(second_next, 6) == UpdateStatus::kApplied);
  ExpectNear(engine.Snapshot()->visible_x_max, live_edge + 60000.0);
}

void TestPanReportsViewportMovementAndBounds() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 3;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,      10.0, 12.0, 9.0,      11.0, 1.0,  60000.0,  11.0, 13.0,
      10.0,     12.0, 1.0,  120000.0, 12.0, 14.0, 11.0,     13.0, 1.0,
      180000.0, 13.0, 15.0, 12.0,     14.0, 1.0,  240000.0, 14.0, 16.0,
      13.0,     15.0, 1.0,  300000.0, 15.0, 17.0, 14.0,     16.0, 1.0,
  };
  assert(engine.SetHistory(history, 36) == UpdateStatus::kApplied);

  assert(engine.Pan(100.0f));
  assert(engine.Pan(100000.0f));
  assert(!engine.Pan(100.0f));
}

void TestGestureZoomReportsAbsoluteScaleAndClamps() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 4;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,      10.0, 12.0, 9.0,      11.0, 1.0,  60000.0,  11.0, 13.0,
      10.0,     12.0, 1.0,  120000.0, 12.0, 14.0, 11.0,     13.0, 1.0,
      180000.0, 13.0, 15.0, 12.0,     14.0, 1.0,  240000.0, 14.0, 16.0,
      13.0,     15.0, 1.0,  300000.0, 15.0, 17.0, 14.0,     16.0, 1.0,
  };
  assert(engine.SetHistory(history, 36) == UpdateStatus::kApplied);
  ExpectNear(engine.Snapshot()->horizontal_scale, 1.0);

  assert(engine.Zoom(1e12, 400.0f));
  ExpectNear(engine.Snapshot()->horizontal_scale, 2.0);
  assert(!engine.Zoom(2.0, 400.0f));

  assert(engine.Pan(100.0f));
  ExpectNear(engine.Snapshot()->horizontal_scale, 2.0);

  assert(engine.Zoom(1e-12, 400.0f));
  ExpectNear(engine.Snapshot()->horizontal_scale, 0.75);
  assert(!engine.Zoom(0.5, 400.0f));
}

void TestProgrammaticZoomUsesRightEdgeAndClampsToHistory() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 4;
  config.allow_zoom = false;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,      10.0, 12.0, 9.0,      11.0, 1.0,  60000.0,  11.0, 13.0,
      10.0,     12.0, 1.0,  120000.0, 12.0, 14.0, 11.0,     13.0, 1.0,
      180000.0, 13.0, 15.0, 12.0,     14.0, 1.0,  240000.0, 14.0, 16.0,
      13.0,     15.0, 1.0,  300000.0, 15.0, 17.0, 14.0,     16.0, 1.0,
  };
  assert(engine.SetHistory(history, 36) == UpdateStatus::kApplied);

  const auto initial = engine.Snapshot();
  const double initial_span = initial->visible_x_max - initial->visible_x_min;
  const double right_edge = initial->visible_x_max;
  engine.ZoomAtRightEdge(2.0);
  const auto zoomed_in = engine.Snapshot();
  ExpectNear(zoomed_in->visible_x_max - zoomed_in->visible_x_min,
             initial_span / 2.0);
  ExpectNear(zoomed_in->visible_x_max, right_edge);

  engine.ZoomAtRightEdge(1e12);
  const auto minimum = engine.Snapshot();
  ExpectNear(minimum->visible_x_max - minimum->visible_x_min, 180000.0);
  ExpectNear(minimum->visible_x_max, right_edge);

  engine.ResetViewport();
  engine.ZoomAtRightEdge(0.5);
  const auto zoomed_out = engine.Snapshot();
  ExpectNear(zoomed_out->visible_x_max - zoomed_out->visible_x_min, 480000.0);
  ExpectNear(zoomed_out->visible_x_max, right_edge);

  engine.ZoomAtRightEdge(1e-12);
  const auto clamped = engine.Snapshot();
  ExpectNear(clamped->visible_x_min, -30000.0);
  ExpectNear(clamped->visible_x_max, 450000.0);
}

void TestFitContentShowsHistoryAndResetsYScale() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 2;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,  10.0, 12.0,     9.0,  11.0,     1.0,  60000.0, 11.0,
      13.0, 10.0, 12.0,     1.0,  120000.0, 12.0, 14.0,    11.0,
      13.0, 1.0,  180000.0, 40.0, 44.0,     39.0, 43.0,    1.0,
  };
  assert(engine.SetHistory(history, 24) == UpdateStatus::kApplied);

  const auto default_viewport = engine.Snapshot();
  engine.FitContent();
  const auto fitted = engine.Snapshot();
  ExpectNear(fitted->visible_x_min, -30000.0);
  ExpectNear(fitted->visible_x_max, 330000.0);
  const double fitted_y_min = fitted->visible_y_min;
  const double fitted_y_max = fitted->visible_y_max;

  engine.ScaleY(-fitted->plot.Height() * 0.5f);
  engine.ZoomAtRightEdge(2.0);
  engine.FitContent();
  const auto restored = engine.Snapshot();
  ExpectNear(restored->visible_x_min, fitted->visible_x_min);
  ExpectNear(restored->visible_x_max, fitted->visible_x_max);
  ExpectNear(restored->visible_y_min, fitted_y_min);
  ExpectNear(restored->visible_y_max, fitted_y_max);

  engine.ResetViewport();
  const auto reset = engine.Snapshot();
  ExpectNear(reset->visible_x_min, default_viewport->visible_x_min);
  ExpectNear(reset->visible_x_max, default_viewport->visible_x_max);
}

void TestViewportCommandsHandleEmptyHistory() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  engine.ZoomAtRightEdge(2.0);
  engine.FitContent();
  const auto snapshot = engine.Snapshot();
  ExpectNear(snapshot->visible_x_min, 0.0);
  ExpectNear(snapshot->visible_x_max, 1.0);
  assert(!snapshot->crosshair_visible);
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
  const size_t base_vertex_floats = engine.Snapshot()->vertices.size();
  engine.SetCrosshair(true, 400.0f, 220.0f);
  const auto solid = engine.Snapshot();
  ExpectNear(solid->selected_change, 2.0);
  ExpectNear(solid->selected_change_percent, 20.0);
  ExpectNear(solid->selected_amplitude_percent, 70.0);
  assert(solid->selected_percentages_valid);
  constexpr size_t kSolidCrosshairVertexFloatCount = size_t{2} * 6 * 6;
  assert(solid->vertices.size() - base_vertex_floats ==
         kSolidCrosshairVertexFloatCount);

  engine.SetCrosshair(false, 0.0f, 0.0f);
  config.crosshair_dashed = true;
  config.display_scale = 2.0f;
  engine.SetConfig(config);
  const size_t dashed_base_vertex_floats = engine.Snapshot()->vertices.size();
  engine.SetCrosshair(true, 400.0f, 220.0f);
  const auto dashed = engine.Snapshot();
  assert(dashed->vertices.size() - dashed_base_vertex_floats >
         kSolidCrosshairVertexFloatCount);
  for (size_t offset = dashed_base_vertex_floats;
       offset < dashed->vertices.size(); offset += 6) {
    assert(dashed->vertices[offset] >= dashed->plot.left - 0.5f);
    assert(dashed->vertices[offset] <= dashed->plot.right + 0.5f);
    assert(dashed->vertices[offset + 1] >= dashed->plot.top - 0.5f);
    assert(dashed->vertices[offset + 1] <= dashed->plot.bottom + 0.5f);
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

void TestHybridHistoryUsesLocalCandleWidths() {
  ChartEngine engine;
  ChartConfig config;
  config.timeframe_ms = 1000.0;
  config.initial_visible_count = 5;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);

  const double candles[] = {
      0.0,      10.0, 12.0,     9.0,  11.0,     1.0,  300000.0, 11.0,
      13.0,     10.0, 12.0,     1.0,  600000.0, 12.0, 14.0,     11.0,
      13.0,     1.0,  601000.0, 13.0, 15.0,     12.0, 14.0,     1.0,
      602000.0, 14.0, 16.0,     13.0, 15.0,     1.0,
  };
  assert(engine.SetHistory(candles, 30) == UpdateStatus::kApplied);

  const auto snapshot = engine.Snapshot();
  const float historical_width = RenderedCandleBodyWidth(*snapshot, 1);
  const float live_width = RenderedCandleBodyWidth(*snapshot, 3);
  assert(historical_width >= 10.0f);
  assert(live_width <= 2.0f);
  assert(historical_width > live_width * 5.0f);
}

void TestLogicalSpacingUsesUniformCandleSlots() {
  ChartEngine engine;
  ChartConfig config;
  config.timeframe_ms = 1000.0;
  config.initial_visible_count = 5;
  config.logical_spacing = true;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);

  const double candles[] = {
      0.0,      10.0, 12.0,     9.0,  11.0,     1.0,  300000.0, 11.0,
      13.0,     10.0, 12.0,     1.0,  600000.0, 12.0, 14.0,     11.0,
      13.0,     1.0,  601000.0, 13.0, 15.0,     12.0, 14.0,     1.0,
      602000.0, 14.0, 16.0,     13.0, 15.0,     1.0,
  };
  assert(engine.SetHistory(candles, 30) == UpdateStatus::kApplied);

  const auto snapshot = engine.Snapshot();
  ExpectNear(RenderedCandleBodyWidth(*snapshot, 1),
             RenderedCandleBodyWidth(*snapshot, 3), 1e-5);
  const float historical_step = RenderedCandleBodyCenter(*snapshot, 2) -
                                RenderedCandleBodyCenter(*snapshot, 1);
  const float live_step = RenderedCandleBodyCenter(*snapshot, 4) -
                          RenderedCandleBodyCenter(*snapshot, 3);
  ExpectNear(historical_step, live_step, 1e-5);

  engine.SetCrosshair(true, RenderedCandleBodyCenter(*snapshot, 3), 200.0f);
  const auto crosshair = engine.Snapshot();
  ExpectNear(crosshair->selected_candle.timestamp, 601000.0);
  assert(!crosshair->x_ticks.empty());
  for (const auto& tick : crosshair->x_ticks) {
    assert(tick.value == 0.0 || tick.value == 300000.0 ||
           tick.value == 600000.0 || tick.value == 601000.0 ||
           tick.value == 602000.0);
  }
}

void TestBarGeometryAndRuntimeSwitch() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 3;
  config.logical_spacing = true;
  config.show_current_price = false;
  config.series_type = SeriesType::kBar;
  config.bar_line_width = 2.0f;
  config.up = {0.1f, 0.2f, 0.3f, 0.4f};
  config.down = {0.5f, 0.6f, 0.7f, 0.8f};
  engine.SetConfig(config);
  engine.SetSize(600.0f, 300.0f);

  const double candles[] = {
      0.0, 10.0, 14.0, 8.0,      12.0, 1.0,  60000.0, 12.0, 15.0,
      7.0, 9.0,  1.0,  120000.0, 10.0, 10.0, 10.0,    10.0, 1.0,
  };
  assert(engine.SetHistory(candles, 18) == UpdateStatus::kApplied);

  engine.SetCrosshair(true, 300.0f, 150.0f);
  const auto bars = engine.Snapshot();
  const size_t grid_quads = bars->x_ticks.size() + bars->y_ticks.size();
  const QuadBounds up_vertical = SnapshotQuad(*bars, grid_quads);
  const QuadBounds up_open = SnapshotQuad(*bars, grid_quads + 1);
  const QuadBounds up_close = SnapshotQuad(*bars, grid_quads + 2);
  const QuadBounds down_vertical = SnapshotQuad(*bars, grid_quads + 3);
  const QuadBounds down_open = SnapshotQuad(*bars, grid_quads + 4);
  const QuadBounds down_close = SnapshotQuad(*bars, grid_quads + 5);
  const QuadBounds flat_vertical = SnapshotQuad(*bars, grid_quads + 6);

  ExpectNear(up_vertical.right - up_vertical.left, 2.0);
  ExpectNear(up_open.bottom - up_open.top, 2.0);
  ExpectNear(up_close.bottom - up_close.top, 2.0);
  ExpectNear(up_open.right, QuadCenterX(up_vertical));
  ExpectNear(up_close.left, QuadCenterX(up_vertical));
  assert(QuadCenterY(up_open) > QuadCenterY(up_close));
  assert(QuadCenterY(down_open) < QuadCenterY(down_close));
  ExpectNear(flat_vertical.bottom - flat_vertical.top, 2.0);

  const float slot_width =
      QuadCenterX(down_vertical) - QuadCenterX(up_vertical);
  ExpectNear(up_open.right - up_open.left, slot_width * 0.45f, 1e-4);
  ExpectNear(up_close.right - up_close.left, slot_width * 0.45f, 1e-4);
  ExpectNear(up_vertical.color.r, 0.1f);
  ExpectNear(up_vertical.color.a, 0.4f);
  ExpectNear(down_vertical.color.r, 0.5f);
  ExpectNear(down_vertical.color.a, 0.8f);

  const uint64_t bar_revision = bars->revision;
  const double visible_x_min = bars->visible_x_min;
  const double visible_x_max = bars->visible_x_max;
  const double visible_y_min = bars->visible_y_min;
  const double visible_y_max = bars->visible_y_max;
  const double selected_timestamp = bars->selected_candle.timestamp;

  config.series_type = SeriesType::kCandlestick;
  engine.SetConfig(config);
  const auto candlesticks = engine.Snapshot();
  assert(candlesticks->revision > bar_revision);
  assert(candlesticks->crosshair_visible);
  assert(candlesticks->total_candle_count == bars->total_candle_count);
  ExpectNear(candlesticks->visible_x_min, visible_x_min);
  ExpectNear(candlesticks->visible_x_max, visible_x_max);
  ExpectNear(candlesticks->visible_y_min, visible_y_min);
  ExpectNear(candlesticks->visible_y_max, visible_y_max);
  ExpectNear(candlesticks->selected_candle.timestamp, selected_timestamp);
  assert(candlesticks->vertices.size() != bars->vertices.size());

  const uint64_t candlestick_revision = candlesticks->revision;
  config.series_type = SeriesType::kHollowCandlestick;
  engine.SetConfig(config);
  const auto hollow_candlesticks = engine.Snapshot();
  assert(hollow_candlesticks->revision > candlestick_revision);
  assert(hollow_candlesticks->crosshair_visible);
  assert(hollow_candlesticks->total_candle_count ==
         candlesticks->total_candle_count);
  ExpectNear(hollow_candlesticks->visible_x_min, visible_x_min);
  ExpectNear(hollow_candlesticks->visible_x_max, visible_x_max);
  ExpectNear(hollow_candlesticks->visible_y_min, visible_y_min);
  ExpectNear(hollow_candlesticks->visible_y_max, visible_y_max);
  ExpectNear(hollow_candlesticks->selected_candle.timestamp,
             selected_timestamp);
  assert(hollow_candlesticks->vertices.size() != candlesticks->vertices.size());
}

void TestHollowCandlestickGeometry() {
  constexpr size_t kFloatsPerQuad = size_t{6} * 6;
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 3;
  config.logical_spacing = true;
  config.show_current_price = false;
  config.series_type = SeriesType::kHollowCandlestick;
  config.up = {0.1f, 0.2f, 0.3f, 0.4f};
  config.down = {0.5f, 0.6f, 0.7f, 0.8f};
  engine.SetConfig(config);
  engine.SetSize(600.0f, 300.0f);

  const double candles[] = {
      0.0, 10.0, 14.0, 8.0,      12.0, 1.0,  60000.0, 12.0, 15.0,
      7.0, 9.0,  1.0,  120000.0, 10.0, 12.0, 8.0,     10.0, 1.0,
  };
  assert(engine.SetHistory(candles, 18) == UpdateStatus::kApplied);

  const auto snapshot = engine.Snapshot();
  const size_t grid_quads = snapshot->x_ticks.size() + snapshot->y_ticks.size();
  const size_t total_quads = snapshot->vertices.size() / kFloatsPerQuad;
  assert(total_quads - grid_quads == 11);

  const QuadBounds up_top_wick = SnapshotQuad(*snapshot, grid_quads);
  const QuadBounds up_bottom_wick = SnapshotQuad(*snapshot, grid_quads + 1);
  const QuadBounds up_top_edge = SnapshotQuad(*snapshot, grid_quads + 2);
  const QuadBounds up_bottom_edge = SnapshotQuad(*snapshot, grid_quads + 3);
  const QuadBounds up_left_edge = SnapshotQuad(*snapshot, grid_quads + 4);
  const QuadBounds up_right_edge = SnapshotQuad(*snapshot, grid_quads + 5);
  const QuadBounds down_wick = SnapshotQuad(*snapshot, grid_quads + 6);
  const QuadBounds down_body = SnapshotQuad(*snapshot, grid_quads + 7);
  const QuadBounds doji_top_wick = SnapshotQuad(*snapshot, grid_quads + 8);
  const QuadBounds doji_bottom_wick = SnapshotQuad(*snapshot, grid_quads + 9);
  const QuadBounds doji_body = SnapshotQuad(*snapshot, grid_quads + 10);

  const float outline_width = up_top_wick.right - up_top_wick.left;
  ExpectNear(up_top_wick.bottom, up_top_edge.top, 1e-4);
  ExpectNear(up_bottom_wick.top, up_bottom_edge.bottom, 1e-4);
  ExpectNear(up_top_edge.bottom - up_top_edge.top, outline_width, 1e-4);
  ExpectNear(up_bottom_edge.bottom - up_bottom_edge.top, outline_width, 1e-4);
  ExpectNear(up_left_edge.right - up_left_edge.left, outline_width, 1e-4);
  ExpectNear(up_right_edge.right - up_right_edge.left, outline_width, 1e-4);
  assert(up_left_edge.right < up_right_edge.left);
  assert(up_top_edge.bottom < up_bottom_edge.top);
  ExpectNear(up_top_wick.color.r, 0.1f);
  ExpectNear(up_top_edge.color.a, 0.4f);

  assert(down_wick.left < down_wick.right);
  assert(down_body.left < down_body.right);
  assert(down_body.top < down_body.bottom);
  ExpectNear(down_wick.color.r, 0.5f);
  ExpectNear(down_body.color.a, 0.8f);

  assert(doji_top_wick.bottom <= doji_body.top);
  assert(doji_bottom_wick.top >= doji_body.bottom);
  ExpectNear(doji_body.bottom - doji_body.top, 1.0f, 1e-4);
  ExpectNear(doji_body.color.r, 0.1f);
  ExpectNear(doji_body.color.a, 0.4f);
}

void TestHollowCandlestickSpacingAndClipping() {
  constexpr size_t kFloatsPerQuad = size_t{6} * 6;
  const double candles[] = {
      0.0,  10.0, 14.0, 8.0,      12.0, 1.0,  60000.0, 12.0, 16.0,
      10.0, 14.0, 1.0,  180000.0, 10.0, 15.0, 8.0,     13.0, 1.0,
  };

  for (bool logical_spacing : {false, true}) {
    ChartEngine engine;
    ChartConfig config;
    config.initial_visible_count = 3;
    config.logical_spacing = logical_spacing;
    config.show_current_price = false;
    config.series_type = SeriesType::kHollowCandlestick;
    engine.SetConfig(config);
    engine.SetSize(600.0f, 300.0f);
    assert(engine.SetHistory(candles, 18) == UpdateStatus::kApplied);

    const auto snapshot = engine.Snapshot();
    const size_t grid_quads =
        snapshot->x_ticks.size() + snapshot->y_ticks.size();
    const QuadBounds first_body_top = SnapshotQuad(*snapshot, grid_quads + 2);
    const QuadBounds second_body_top = SnapshotQuad(*snapshot, grid_quads + 8);
    const QuadBounds third_body_top = SnapshotQuad(*snapshot, grid_quads + 14);
    const float first_step =
        QuadCenterX(second_body_top) - QuadCenterX(first_body_top);
    const float second_step =
        QuadCenterX(third_body_top) - QuadCenterX(second_body_top);
    if (logical_spacing) {
      ExpectNear(first_step, second_step, 1e-4);
    } else {
      ExpectNear(second_step, first_step * 2.0f, 1e-4);
    }

    if (logical_spacing) {
      assert(engine.Zoom(2.0, snapshot->plot.right));
      assert(engine.Pan(snapshot->plot.Width() * 0.17f));
      const auto clipped = engine.Snapshot();
      const size_t clipped_grid_quads =
          clipped->x_ticks.size() + clipped->y_ticks.size();
      const size_t total_quads = clipped->vertices.size() / kFloatsPerQuad;
      bool touches_left_edge = false;
      for (size_t index = clipped_grid_quads; index < total_quads; ++index) {
        const QuadBounds quad = SnapshotQuad(*clipped, index);
        assert(quad.left >= clipped->plot.left);
        assert(quad.right <= clipped->plot.right);
        assert(quad.top >= clipped->plot.top);
        assert(quad.bottom <= clipped->plot.bottom);
        touches_left_edge =
            touches_left_edge || quad.left == clipped->plot.left;
      }
      assert(touches_left_edge);
    }
  }
}

void TestBarSpacingAndClipping() {
  constexpr size_t kFloatsPerQuad = size_t{6} * 6;
  const double candles[] = {
      0.0, 10.0, 14.0, 8.0,      12.0, 1.0,  60000.0, 12.0, 15.0,
      7.0, 9.0,  1.0,  180000.0, 10.0, 13.0, 8.0,     11.0, 1.0,
  };

  for (bool logical_spacing : {false, true}) {
    ChartEngine engine;
    ChartConfig config;
    config.initial_visible_count = 3;
    config.logical_spacing = logical_spacing;
    config.show_current_price = false;
    config.series_type = SeriesType::kBar;
    engine.SetConfig(config);
    engine.SetSize(600.0f, 300.0f);
    assert(engine.SetHistory(candles, 18) == UpdateStatus::kApplied);

    const auto snapshot = engine.Snapshot();
    const size_t grid_quads =
        snapshot->x_ticks.size() + snapshot->y_ticks.size();
    const QuadBounds first_vertical = SnapshotQuad(*snapshot, grid_quads);
    const QuadBounds first_open = SnapshotQuad(*snapshot, grid_quads + 1);
    const QuadBounds second_vertical = SnapshotQuad(*snapshot, grid_quads + 3);
    const QuadBounds second_open = SnapshotQuad(*snapshot, grid_quads + 4);
    const QuadBounds third_vertical = SnapshotQuad(*snapshot, grid_quads + 6);
    const QuadBounds third_open = SnapshotQuad(*snapshot, grid_quads + 7);

    const float first_step =
        QuadCenterX(second_vertical) - QuadCenterX(first_vertical);
    const float second_step =
        QuadCenterX(third_vertical) - QuadCenterX(second_vertical);
    if (logical_spacing) {
      ExpectNear(first_step, second_step, 1e-4);
    } else {
      ExpectNear(second_step, first_step * 2.0f, 1e-4);
    }
    ExpectNear(first_open.right - first_open.left, first_step * 0.45f, 1e-4);
    ExpectNear(second_open.right - second_open.left,
               std::min(first_step, second_step) * 0.45f, 1e-4);
    ExpectNear(third_open.right - third_open.left, second_step * 0.45f, 1e-4);

    const auto project_y = [&](double price) {
      return snapshot->plot.bottom -
             static_cast<float>(
                 (price - snapshot->visible_y_min) /
                 (snapshot->visible_y_max - snapshot->visible_y_min)) *
                 snapshot->plot.Height();
    };
    ExpectNear(first_vertical.top, project_y(14.0), 1e-4);
    ExpectNear(first_vertical.bottom, project_y(8.0), 1e-4);

    if (logical_spacing) {
      assert(engine.Zoom(2.0, snapshot->plot.right));
      assert(engine.Pan(snapshot->plot.Width() * 0.2f));
      const auto clipped = engine.Snapshot();
      const size_t clipped_grid_quads =
          clipped->x_ticks.size() + clipped->y_ticks.size();
      const size_t total_quads = clipped->vertices.size() / kFloatsPerQuad;
      assert(total_quads - clipped_grid_quads == 6);
      const QuadBounds clipped_open =
          SnapshotQuad(*clipped, clipped_grid_quads + 1);
      ExpectNear(clipped_open.left, clipped->plot.left, 1e-4);
      for (size_t index = clipped_grid_quads; index < total_quads; ++index) {
        const QuadBounds quad = SnapshotQuad(*clipped, index);
        assert(quad.left >= clipped->plot.left);
        assert(quad.right <= clipped->plot.right);
        assert(quad.top >= clipped->plot.top);
        assert(quad.bottom <= clipped->plot.bottom);
      }
    }
  }
}

void TestLargeHistoryAndTradeBurst() {
  constexpr size_t kCandleCount = 50000;
  constexpr size_t kTradeCount = 1000;
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = static_cast<int>(kCandleCount);
  config.series_type = SeriesType::kBar;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(1200.0f, 700.0f);

  std::vector<double> history;
  history.reserve(kCandleCount * 6);
  for (size_t i = 0; i < kCandleCount; ++i) {
    const double open = 100.0 + static_cast<double>(i % 100) * 0.01;
    history.insert(history.end(), {
                                      static_cast<double>(i) * 60000.0,
                                      open,
                                      open + 1.0,
                                      open - 1.0,
                                      open + 0.25,
                                      1.0,
                                  });
  }
  assert(engine.SetHistory(history.data(), history.size()) ==
         UpdateStatus::kApplied);

  std::vector<double> trades;
  trades.reserve(kTradeCount * 3);
  const double next_bucket = static_cast<double>(kCandleCount) * 60000.0;
  for (size_t i = 0; i < kTradeCount; ++i) {
    trades.insert(trades.end(), {
                                    next_bucket + static_cast<double>(i),
                                    101.0 + static_cast<double>(i % 25) * 0.01,
                                    0.1,
                                });
  }
  assert(engine.UpdateTrades(trades.data(), trades.size()) ==
         UpdateStatus::kApplied);
  assert(engine.CandleCount() == kCandleCount + 1);

  const auto snapshot = engine.Snapshot();
  assert(!snapshot->vertices.empty());
  // Geometry remains capped by LOD instead of growing linearly with 50k
  // candles.
  assert(snapshot->vertices.size() < 1500000);
}

void TestCurrentPriceLineAndLabelColorsAreIndependent() {
  ChartEngine engine;
  ChartConfig config;
  config.current_price_line_up = {0.1f, 0.2f, 0.3f, 0.4f};
  config.current_price_label_up = {0.5f, 0.6f, 0.7f, 0.8f};
  engine.SetConfig(config);
  engine.SetSize(400.0f, 240.0f);
  const double candle[] = {0.0, 10.0, 12.0, 9.0, 11.0, 1.0};
  assert(engine.SetHistory(candle, 6) == UpdateStatus::kApplied);
  const auto snapshot = engine.Snapshot();
  ExpectNear(snapshot->current_price_color.r, 0.1f);
  ExpectNear(snapshot->current_price_color.a, 0.4f);
  ExpectNear(snapshot->current_price_label_color.r, 0.5f);
  ExpectNear(snapshot->current_price_label_color.a, 0.8f);
}

void TestMultiPaneSeriesAndDerivedVolume() {
  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 10;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(600.0f, 360.0f);

  PaneConfig main;
  main.height_weight = 3.0;
  PaneConfig volume;
  volume.pane_id = "volume";
  volume.price_scale_id = "volume";
  volume.height_weight = 1.0;
  volume.volume_format = true;
  engine.SetPanes({main, volume}, true);

  SeriesConfig derived;
  derived.series_id = "volume";
  derived.type = SeriesType::kHistogram;
  derived.source = SeriesSource::kOhlcvVolume;
  derived.source_series_id = "main";
  derived.pane_id = "volume";
  derived.price_scale_id = "volume";
  derived.declarative = true;
  assert(engine.AddSeries(derived) == UpdateStatus::kApplied);
  assert(engine.AddSeries(derived) == UpdateStatus::kApplied);

  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 5.0, 60000.0, 11.0, 13.0, 8.0, 9.0, 8.0,
  };
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  const auto first = engine.Snapshot();
  assert(engine.Snapshot() == first);
  assert(first->panes.size() == 2);
  assert(first->panes[0].pane_id == "main");
  assert(first->panes[1].pane_id == "volume");
  assert(first->panes[1].volume_format);
  assert(first->panes[1].visible_y_min <= 0.0);
  assert(first->panes[1].visible_y_max >= 8.0);
  assert(first->panes[0].plot.bottom < first->panes[1].plot.top);
  assert(!first->pane_y_ticks.empty());

  SeriesConfig comparison;
  comparison.series_id = "comparison";
  comparison.pane_id = "main";
  comparison.price_scale_id = "main";
  assert(engine.AddSeries(comparison) == UpdateStatus::kApplied);
  const double comparison_history[] = {
      0.0, 80.0, 100.0, 70.0, 90.0, 1.0, 60000.0, 90.0, 110.0, 85.0, 105.0, 1.0,
  };
  assert(engine.SetSeriesData("comparison", comparison_history, 12, false) ==
         UpdateStatus::kApplied);
  assert(engine.Snapshot()->panes[0].visible_y_max >= 110.0);

  const uint64_t revision = first->revision;
  const double updated[] = {60000.0, 11.0, 13.0, 10.0, 12.0, 20.0};
  assert(engine.UpdateCandle(updated, 6) == UpdateStatus::kApplied);
  const auto second = engine.Snapshot();
  assert(second->revision > revision);
  assert(second->panes[1].visible_y_max >= 20.0);

  const double trade[] = {60500.0, 12.5, 7.0};
  assert(engine.UpdateTrade(trade, 3) == UpdateStatus::kApplied);
  assert(engine.Snapshot()->panes[1].visible_y_max >= 27.0);

  const double prepended[] = {
      -60000.0, 9.0, 10.0, 8.0, 9.5, 50.0,
  };
  // Main timestamps cannot be negative.
  assert(engine.PrependHistory(prepended, 6) == UpdateStatus::kInvalidInput);

  const double prior[] = {
      0.0, 9.0, 10.0, 8.0, 9.5, 50.0,
  };
  ChartEngine prepend_engine;
  prepend_engine.SetConfig(config);
  prepend_engine.SetSize(600.0f, 360.0f);
  prepend_engine.SetPanes({main, volume}, true);
  assert(prepend_engine.AddSeries(derived) == UpdateStatus::kApplied);
  const double later_history[] = {
      60000.0,  10.0, 12.0, 9.0,  11.0, 5.0,
      120000.0, 11.0, 13.0, 10.0, 12.0, 8.0,
  };
  assert(prepend_engine.SetHistory(later_history, 12) ==
         UpdateStatus::kApplied);
  assert(prepend_engine.PrependHistory(prior, 6) == UpdateStatus::kApplied);
  prepend_engine.FitContent();
  assert(prepend_engine.Snapshot()->panes[1].visible_y_max >= 50.0);

  const double main_scale = second->panes[0].y_axis_scale;
  const double volume_scale = second->panes[1].y_axis_scale;
  assert(engine.ScaleYAt(
      20.0f,
      (second->panes[1].plot.top + second->panes[1].plot.bottom) * 0.5f));
  const auto scaled = engine.Snapshot();
  ExpectNear(scaled->panes[0].y_axis_scale, main_scale);
  assert(scaled->panes[1].y_axis_scale != volume_scale);

  engine.SetCrosshair(
      true, scaled->panes[0].plot.left + 20.0f,
      (scaled->panes[1].plot.top + scaled->panes[1].plot.bottom) * 0.5f);
  const auto crosshair = engine.Snapshot();
  assert(crosshair->crosshair_visible);
  assert(crosshair->active_pane_index == 1);
  assert(crosshair->selected_candle.timestamp >= 0.0);

  assert(!engine.RemoveSeries("main"));
  assert(engine.RemoveSeries("volume"));
  assert(!engine.RemoveSeries("volume"));
}

void TestCustomHistogramAndRuntimePaneWeights() {
  ChartEngine engine;
  ChartConfig config;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(500.0f, 320.0f);

  PaneConfig main;
  main.height_weight = 2.0;
  PaneConfig indicator;
  indicator.pane_id = "indicator";
  indicator.price_scale_id = "indicator";
  indicator.height_weight = 1.0;
  indicator.min_height = 60.0f;
  engine.SetPanes({main, indicator}, true);

  SeriesConfig histogram;
  histogram.series_id = "momentum";
  histogram.type = SeriesType::kHistogram;
  histogram.pane_id = "indicator";
  histogram.price_scale_id = "indicator";
  assert(engine.AddSeries(histogram) == UpdateStatus::kApplied);
  assert(engine.AddSeries(histogram) == UpdateStatus::kInvalidInput);

  const double history[] = {
      0.0,  10.0, 12.0, 9.0,      11.0, 1.0,  60000.0, 11.0, 13.0,
      10.0, 12.0, 1.0,  120000.0, 12.0, 14.0, 11.0,    13.0, 1.0,
  };
  const double points[] = {60000.0, -3.0, 120000.0, 5.0};
  assert(engine.SetHistory(history, 18) == UpdateStatus::kApplied);
  assert(engine.SetSeriesData("momentum", points, 4, true) ==
         UpdateStatus::kApplied);
  const double prepended_point[] = {0.0, -7.0};
  assert(engine.PrependSeriesData("momentum", prepended_point, 2, true) ==
         UpdateStatus::kApplied);
  const double updated_point[] = {120000.0, 9.0};
  assert(engine.UpdateSeriesData("momentum", updated_point, 2, true) ==
         UpdateStatus::kApplied);
  const auto before = engine.Snapshot();
  assert(before->panes[1].visible_y_min <= -7.0);
  assert(before->panes[1].visible_y_max >= 9.0);

  const auto separator = engine.SeparatorAt(before->panes[0].plot.bottom, 8.0f);
  assert(separator.has_value() && *separator == 0);
  assert(engine.ResizePaneSeparator(0, -40.0f));
  const auto resized = engine.Snapshot();
  assert(resized->panes[1].plot.Height() >= indicator.min_height);
  const double runtime_weight = resized->panes[0].height_weight;

  // Reapplying an unchanged declarative weight must preserve the runtime drag.
  engine.SetPanes({main, indicator}, true);
  const auto reapplied = engine.Snapshot();
  ExpectNear(reapplied->panes[0].height_weight, runtime_weight);

  // An actual declarative weight change intentionally replaces the runtime one.
  main.height_weight = 4.0;
  engine.SetPanes({main, indicator}, true);
  const auto changed = engine.Snapshot();
  ExpectNear(changed->panes[0].height_weight, 4.0);
}

}  // namespace

int main() noexcept {
  try {
    TestTradeAggregation();
    TestBucketTransitionAndNoGaps();
    TestHistoryContinuation();
    TestPrependHistoryPreservesViewport();
    TestCandlesReturnsAtomicCopyOfCurrentStore();
    TestPrependHistoryRejectsOverlap();
    TestOldTradeIgnored();
    TestRejectsUnalignedHistory();
    TestSnapshotAndAutoscale();
    TestDisplayScaleKeepsAxisDensityStable();
    TestOneTickRangeUsesScaleMargins();
    TestFlatRangeUsesMinMove();
    TestCustomScaleMargins();
    TestVisiblePriceExtremes();
    TestAutoscaleSupportsDifferentMagnitudesAndNegativeValues();
    TestCrosshairUsesAutoscaleInverse();
    TestYAxisScaleDirectionLimitsAndCrosshair();
    TestYAxisScalePersistsAcrossHorizontalPanAndResets();
    TestYAxisScaleHasIndependentOptionAndDefault();
    TestCurrentPriceRemainsVisibleOutsideHorizontalViewport();
    TestCurrentPricePinsToVerticalViewportEdges();
    TestDefaultScaleControlsResetViewport();
    TestCurrentPriceLineIsOneUnitThick();
    TestTradeBatchMatchesSingles();
    TestReadyCandleFeed();
    TestViewportStopsFollowingAfterPan();
    TestViewportFollowsNewCandleAtLiveEdge();
    TestViewportFollowsNewTradeBucketAtLiveEdge();
    TestViewportResumesFollowingAfterReturningToLiveEdge();
    TestPanReportsViewportMovementAndBounds();
    TestGestureZoomReportsAbsoluteScaleAndClamps();
    TestProgrammaticZoomUsesRightEdgeAndClampsToHistory();
    TestFitContentShowsHistoryAndResetsYScale();
    TestViewportCommandsHandleEmptyHistory();
    TestCrosshairStatisticsAndLineStyles();
    TestCrosshairHitTesting();
    TestCrosshairRevisionKeepsStaticContentRevision();
    TestHybridHistoryUsesLocalCandleWidths();
    TestLogicalSpacingUsesUniformCandleSlots();
    TestBarGeometryAndRuntimeSwitch();
    TestHollowCandlestickGeometry();
    TestHollowCandlestickSpacingAndClipping();
    TestBarSpacingAndClipping();
    TestCurrentPriceLineAndLabelColorsAreIndependent();
    TestMultiPaneSeriesAndDerivedVolume();
    TestCustomHistogramAndRuntimePaneWeights();
    TestLargeHistoryAndTradeBurst();
    std::cout << "ChartEngineTests passed\n";
    return 0;
  } catch (...) {
    std::cerr << "ChartEngineTests terminated with an exception\n";
    return 1;
  }
}
