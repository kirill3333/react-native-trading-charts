// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <initializer_list>
#include <iterator>
#include <memory>
#include <string>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/series_geometry.h"
#include "cpp/internal/triangle_geometry.h"
#include "cpp/tests/chart_engine_test_helpers.h"
#include "cpp/tests/chart_engine_test_suites.h"

namespace trading_charts::test {

namespace {

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
  assert(offset + kFloatsPerQuad <= ContentOf(snapshot).size());

  QuadBounds bounds{
      ContentOf(snapshot)[offset],
      ContentOf(snapshot)[offset + 1],
      ContentOf(snapshot)[offset],
      ContentOf(snapshot)[offset + 1],
      {
          ContentOf(snapshot)[offset + 2],
          ContentOf(snapshot)[offset + 3],
          ContentOf(snapshot)[offset + 4],
          ContentOf(snapshot)[offset + 5],
      },
  };
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const size_t vertex_offset = offset + vertex * kFloatsPerVertex;
    bounds.left = std::min(bounds.left, ContentOf(snapshot)[vertex_offset]);
    bounds.top = std::min(bounds.top, ContentOf(snapshot)[vertex_offset + 1]);
    bounds.right = std::max(bounds.right, ContentOf(snapshot)[vertex_offset]);
    bounds.bottom =
        std::max(bounds.bottom, ContentOf(snapshot)[vertex_offset + 1]);
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
  assert(offset + kFloatsPerQuad <= ContentOf(snapshot).size());

  float minimum_x = ContentOf(snapshot)[offset];
  float maximum_x = minimum_x;
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const float x = ContentOf(snapshot)[offset + vertex * kFloatsPerVertex];
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
  assert(offset + kFloatsPerQuad <= ContentOf(snapshot).size());

  float minimum_x = ContentOf(snapshot)[offset];
  float maximum_x = minimum_x;
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const float x = ContentOf(snapshot)[offset + vertex * kFloatsPerVertex];
    minimum_x = std::min(minimum_x, x);
    maximum_x = std::max(maximum_x, x);
  }
  return (minimum_x + maximum_x) * 0.5f;
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
  assert(ContentOf(*snapshot).size() >= kFloatsPerQuad);
  const size_t offset = ContentOf(*snapshot).size() - kFloatsPerQuad;
  float minimum_y = ContentOf(*snapshot)[offset + 1];
  float maximum_y = minimum_y;
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const float y =
        ContentOf(*snapshot)[offset + vertex * kFloatsPerVertex + 1];
    minimum_y = std::min(minimum_y, y);
    maximum_y = std::max(maximum_y, y);
  }
  ExpectNear(maximum_y - minimum_y, 1.0, 1e-6);
}

void TestHybridHistoryUsesLocalCandleWidths() {
  ChartEngine engine;
  ChartConfig config = FixedResolution(1000);
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
  ChartConfig config = FixedResolution(1000);
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
             RenderedCandleBodyWidth(*snapshot, 3), kFloatGeometryTolerance);
  const float historical_step = RenderedCandleBodyCenter(*snapshot, 2) -
                                RenderedCandleBodyCenter(*snapshot, 1);
  const float live_step = RenderedCandleBodyCenter(*snapshot, 4) -
                          RenderedCandleBodyCenter(*snapshot, 3);
  ExpectNear(historical_step, live_step, kFloatGeometryTolerance);

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

void TestTriangleClippingFastPaths() {
  using trading_charts::internal::AppendClippedTriangle;
  using trading_charts::internal::ColoredVertex;

  const trading_charts::Rect clip{10.0f, 20.0f, 30.0f, 40.0f};
  const Color red{1.0f, 0.0f, 0.0f, 1.0f};
  const Color green{0.0f, 1.0f, 0.0f, 0.75f};
  const Color blue{0.0f, 0.0f, 1.0f, 0.5f};

  std::vector<float> vertices;
  AppendClippedTriangle(vertices, {12.0f, 22.0f, red}, {28.0f, 24.0f, green},
                        {20.0f, 38.0f, blue}, clip);
  const std::vector<float> expected = {
      12.0f, 22.0f, 1.0f,  0.0f,  0.0f,  1.0f, 28.0f, 24.0f, 0.0f,
      1.0f,  0.0f,  0.75f, 20.0f, 38.0f, 0.0f, 0.0f,  1.0f,  0.5f,
  };
  assert(vertices == expected);

  const std::array<std::array<ColoredVertex, 3>, 4> outside = {{
      {{{1.0f, 22.0f, red}, {2.0f, 30.0f, green}, {3.0f, 38.0f, blue}}},
      {{{31.0f, 22.0f, red}, {32.0f, 30.0f, green}, {33.0f, 38.0f, blue}}},
      {{{12.0f, 1.0f, red}, {20.0f, 2.0f, green}, {28.0f, 3.0f, blue}}},
      {{{12.0f, 41.0f, red}, {20.0f, 42.0f, green}, {28.0f, 43.0f, blue}}},
  }};
  for (const auto& triangle : outside) {
    vertices.clear();
    AppendClippedTriangle(vertices, triangle[0], triangle[1], triangle[2],
                          clip);
    assert(vertices.empty());
  }

  vertices.clear();
  AppendClippedTriangle(vertices, {10.0f, 22.0f, red}, {10.0f, 38.0f, green},
                        {20.0f, 30.0f, blue}, clip);
  assert(vertices.size() == 18);

  vertices.clear();
  AppendClippedTriangle(vertices, {5.0f, 30.0f, red}, {20.0f, 15.0f, green},
                        {35.0f, 35.0f, blue}, clip);
  assert(!vertices.empty());
  assert(vertices.size() % 18 == 0);
  for (size_t index = 0; index < vertices.size(); index += 6) {
    assert(vertices[index] >= clip.left && vertices[index] <= clip.right);
    assert(vertices[index + 1] >= clip.top &&
           vertices[index + 1] <= clip.bottom);
  }
}

void TestPackedGeometryAppendPreservesExistingVertices() {
  using trading_charts::internal::AppendQuad;
  using trading_charts::internal::AppendTriangle;
  using trading_charts::internal::ColoredVertex;
  using trading_charts::internal::kFloatsPerQuad;
  using trading_charts::internal::kFloatsPerTriangle;

  const Color color{0.1f, 0.2f, 0.3f, 0.4f};
  std::vector<float> vertices = {99.0f, 98.0f};
  AppendTriangle(vertices, ColoredVertex{1.0f, 2.0f, color},
                 ColoredVertex{3.0f, 4.0f, color},
                 ColoredVertex{5.0f, 6.0f, color});
  assert(vertices.size() == 2 + kFloatsPerTriangle);
  assert(vertices[0] == 99.0f && vertices[1] == 98.0f);
  assert(vertices[2] == 1.0f && vertices[3] == 2.0f);
  assert(vertices[14] == 5.0f && vertices[15] == 6.0f);

  const size_t quad_offset = vertices.size();
  AppendQuad(vertices, 10.0f, 20.0f, 30.0f, 40.0f, color);
  assert(vertices.size() == quad_offset + kFloatsPerQuad);
  assert(vertices[quad_offset] == 10.0f && vertices[quad_offset + 1] == 20.0f);
  assert(vertices[vertices.size() - 6] == 10.0f &&
         vertices[vertices.size() - 5] == 40.0f);
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
  assert(ContentOf(*candlesticks).size() != ContentOf(*bars).size());

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
  assert(ContentOf(*hollow_candlesticks).size() !=
         ContentOf(*candlesticks).size());
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
  const size_t total_quads = ContentOf(*snapshot).size() / kFloatsPerQuad;
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

void TestRoundedCandlestickGeometry() {
  const std::vector<Candle> candle = {
      Candle{0.0, 25.0, 90.0, 10.0, 75.0, 1.0},
  };
  const auto render = [&](SeriesType type, float radius, double visible_min,
                          double visible_max) {
    ChartConfig config;
    config.series_type = type;
    config.candle_radius = radius;
    config.show_current_price = false;
    const trading_charts::internal::SeriesGeometryInput input{
        config,
        candle,
        0,
        candle.size(),
        {0.0f, 0.0f, 100.0f, 100.0f},
        visible_min,
        visible_max,
        0.0,
        100.0,
        nullptr};
    std::vector<float> vertices;
    const size_t capacity =
        trading_charts::internal::SeriesGeometryFloatCapacity(input);
    vertices.reserve(capacity);
    trading_charts::internal::AppendSeriesGeometry(input, vertices);
    assert(vertices.size() <= capacity);
    for (size_t index = 0; index < vertices.size(); index += 6) {
      assert(std::isfinite(vertices[index]));
      assert(std::isfinite(vertices[index + 1]));
    }
    return vertices;
  };

  const std::vector<float> sharp =
      render(SeriesType::kCandlestick, 0.0f, -30000.0, 30000.0);
  const std::vector<float> rounded =
      render(SeriesType::kCandlestick, 6.0f, -30000.0, 30000.0);
  assert(rounded.size() > sharp.size());

  constexpr size_t kFloatsPerQuad = size_t{6} * 6;
  for (size_t index = 0; index < rounded.size(); index += 6) {
    assert(rounded[index] >= 0.0f);
    assert(rounded[index] <= 100.0f);
    assert(rounded[index + 1] >= 0.0f);
    assert(rounded[index + 1] <= 100.0f);
  }
  float body_left = rounded[kFloatsPerQuad];
  float body_top = rounded[kFloatsPerQuad + 1];
  float body_right = body_left;
  float body_bottom = body_top;
  for (size_t index = kFloatsPerQuad; index < rounded.size(); index += 6) {
    body_left = std::min(body_left, rounded[index]);
    body_top = std::min(body_top, rounded[index + 1]);
    body_right = std::max(body_right, rounded[index]);
    body_bottom = std::max(body_bottom, rounded[index + 1]);
  }
  bool contains_sharp_corner = false;
  for (size_t index = kFloatsPerQuad; index < rounded.size(); index += 6) {
    contains_sharp_corner =
        contains_sharp_corner ||
        ((rounded[index] == body_left || rounded[index] == body_right) &&
         (rounded[index + 1] == body_top || rounded[index + 1] == body_bottom));
  }
  assert(!contains_sharp_corner);

  const std::vector<float> clamped =
      render(SeriesType::kCandlestick, 14.0f, -30000.0, 30000.0);
  const std::vector<float> oversized =
      render(SeriesType::kCandlestick, 1000.0f, -30000.0, 30000.0);
  assert(clamped == oversized);

  const std::vector<float> hollow =
      render(SeriesType::kHollowCandlestick, 6.0f, -30000.0, 30000.0);
  const std::vector<float> sharp_hollow =
      render(SeriesType::kHollowCandlestick, 0.0f, -30000.0, 30000.0);
  assert(hollow.size() > sharp_hollow.size());

  const std::vector<float> clipped =
      render(SeriesType::kCandlestick, 6.0f, 0.0, 60000.0);
  assert(!clipped.empty());
  for (size_t index = kFloatsPerQuad; index < clipped.size(); index += 6) {
    assert(clipped[index] >= 0.0f);
    assert(clipped[index] <= 100.0f);
    assert(clipped[index + 1] >= 0.0f);
    assert(clipped[index + 1] <= 100.0f);
  }

  ChartConfig doji_config;
  doji_config.series_type = SeriesType::kCandlestick;
  doji_config.candle_radius = 1000.0f;
  const std::vector<Candle> doji = {
      Candle{0.0, 50.0, 60.0, 40.0, 50.0, 1.0},
  };
  const trading_charts::internal::SeriesGeometryInput doji_input{
      doji_config, doji,    0,   doji.size(), {0.0f, 0.0f, 100.0f, 100.0f},
      -30000.0,    30000.0, 0.0, 100.0,       nullptr};
  std::vector<float> doji_vertices;
  trading_charts::internal::AppendSeriesGeometry(doji_input, doji_vertices);
  assert(doji_vertices.size() <=
         trading_charts::internal::SeriesGeometryFloatCapacity(doji_input));
  for (size_t index = 0; index < doji_vertices.size(); index += 6) {
    assert(std::isfinite(doji_vertices[index]));
    assert(std::isfinite(doji_vertices[index + 1]));
  }
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
      const size_t total_quads = ContentOf(*clipped).size() / kFloatsPerQuad;
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
      const size_t total_quads = ContentOf(*clipped).size() / kFloatsPerQuad;
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

void TestDashedLineGeometryUsesSharedTriangleContract() {
  ChartConfig config;
  config.series_type = SeriesType::kLine;
  config.line_width = 2.0f;
  config.line_dashed = true;
  config.line = {0.2f, 0.4f, 0.6f, 0.8f};
  const std::vector<Candle> candles{
      Candle{0.0, 1.0, 1.0, 1.0, 1.0, 0.0},
      Candle{1.0, 1.0, 1.0, 1.0, 1.0, 0.0},
  };
  const trading_charts::internal::SeriesGeometryInput input{
      config, candles, 0,   candles.size(), {0.0f, 0.0f, 140.0f, 40.0f}, 0.0,
      1.0,    0.0,     2.0, nullptr,
  };
  std::vector<float> dashed;
  dashed.reserve(trading_charts::internal::SeriesGeometryFloatCapacity(input));
  trading_charts::internal::AppendSeriesGeometry(input, dashed);
  assert(!dashed.empty());
  assert(dashed.size() % 6 == 0);
  assert(dashed.size() <= dashed.capacity());
  for (size_t offset = 0; offset < dashed.size(); offset += 6) {
    ExpectNear(dashed[offset + 2], config.line.r, 1e-6);
    ExpectNear(dashed[offset + 3], config.line.g, 1e-6);
    ExpectNear(dashed[offset + 4], config.line.b, 1e-6);
    assert(dashed[offset] >= input.plot.left &&
           dashed[offset] <= input.plot.right);
  }

  config.line_dashed = false;
  std::vector<float> solid;
  trading_charts::internal::AppendSeriesGeometry(
      trading_charts::internal::SeriesGeometryInput{
          config,
          candles,
          0,
          candles.size(),
          input.plot,
          0.0,
          1.0,
          0.0,
          2.0,
          nullptr,
      },
      solid);
  assert(dashed.size() > solid.size());

  config.line_dashed = true;
  config.line_gradient_enabled = true;
  config.line_gradient_top = {0.2f, 0.4f, 0.6f, 0.8f};
  config.line_gradient_bottom = {0.6f, 0.8f, 1.0f, 0.8f};
  auto rounded_input = input;
  rounded_input.rounded = true;
  std::vector<float> rounded;
  const size_t capacity =
      trading_charts::internal::SeriesGeometryFloatCapacity(rounded_input);
  rounded.reserve(capacity);
  trading_charts::internal::AppendSeriesGeometry(rounded_input, rounded);
  assert(rounded.size() > dashed.size());
  assert(rounded.size() <= capacity);
  for (size_t offset = 0; offset < rounded.size(); offset += 6) {
    const float amount = rounded[offset + 1] / input.plot.Height();
    ExpectNear(rounded[offset + 2], 0.2f + 0.4f * amount, 1e-6);
    assert(rounded[offset] >= input.plot.left);
    assert(rounded[offset] <= input.plot.right);
    assert(rounded[offset + 5] >= 0.0f && rounded[offset + 5] <= 0.8f);
  }
}

void TestMainLineEndpoint() {
  std::vector<double> history;
  for (int i = 0; i < 100; ++i) {
    const double value = 100.0 + i;
    history.insert(history.end(),
                   {i * 60000.0, value, value + 2.0, value - 1.0, value, 1.0});
  }
  for (const bool logical : {false, true}) {
    for (const auto type :
         {SeriesType::kLine, SeriesType::kArea, SeriesType::kBaseline}) {
      ChartEngine engine;
      ChartConfig config;
      config.logical_spacing = logical;
      config.initial_visible_count = 20;
      config.show_current_price = false;
      config.series_type = type;
      engine.SetConfig(config);
      engine.SetSize(600.0f, 300.0f);
      assert(engine.SetHistory(history.data(), history.size()) ==
             UpdateStatus::kApplied);
      const auto last = engine.Snapshot();
      assert(last->line_endpoint_visible);
      assert(last->visible_maximum.visible);
      ExpectNear(last->line_endpoint_x, last->visible_maximum.x);
      const double update[] = {99.0 * 60000.0, 199.0, 201.0, 180.0, 183.0, 2.0};
      assert(engine.UpdateCandle(update, std::size(update)) ==
             UpdateStatus::kApplied);
      const auto replaced = engine.Snapshot();
      assert(replaced->line_endpoint_visible &&
             replaced->line_endpoint_y > last->line_endpoint_y);
      assert(engine.ScaleY(-1000.0f));
      assert(!engine.Snapshot()->line_endpoint_visible);
      engine.ResetViewport();
      assert(engine.Pan(2000.0f));
      assert(!engine.Snapshot()->line_endpoint_visible);
      engine.ResetViewport();
      for (const auto unsupported :
           {SeriesType::kCandlestick, SeriesType::kHollowCandlestick,
            SeriesType::kBar}) {
        config.series_type = unsupported;
        engine.SetConfig(config);
        assert(!engine.Snapshot()->line_endpoint_visible);
      }
      config.series_type = type;
      engine.SetConfig(config);
      assert(engine.Snapshot()->line_endpoint_visible);
      engine.Clear();
      assert(!engine.Snapshot()->line_endpoint_visible);
    }
  }
}

void TestLineSourceAutoscaleCurrentPriceAndGradient() {
  const double history[] = {
      0.0, 10.0, 100.0, 1.0,      20.0, 1.0,   60000.0, 30.0, 110.0,
      2.0, 40.0, 1.0,   120000.0, 50.0, 120.0, 3.0,     60.0, 1.0,
  };
  const struct {
    OhlcValueSource source;
    double minimum;
    double maximum;
    double current;
  } cases[] = {
      {OhlcValueSource::kOpen, 10.0, 50.0, 50.0},
      {OhlcValueSource::kHigh, 100.0, 120.0, 120.0},
      {OhlcValueSource::kLow, 1.0, 3.0, 3.0},
      {OhlcValueSource::kClose, 20.0, 60.0, 60.0},
  };

  for (const auto& test : cases) {
    ChartEngine engine;
    ChartConfig config;
    config.initial_visible_count = 3;
    config.logical_spacing = true;
    config.series_type = SeriesType::kLine;
    config.line_source = test.source;
    config.line_width = 4.0f;
    config.line_gradient_enabled = true;
    config.line_gradient_top = {1.0f, 0.0f, 0.0f, 1.0f};
    config.line_gradient_bottom = {0.0f, 0.0f, 1.0f, 1.0f};
    engine.SetConfig(config);
    engine.SetSize(600.0f, 300.0f);
    assert(engine.SetHistory(history, 18) == UpdateStatus::kApplied);

    const auto snapshot = engine.Snapshot();
    assert(snapshot->visible_minimum.visible);
    assert(snapshot->visible_maximum.visible);
    ExpectNear(snapshot->visible_minimum.value, test.minimum);
    ExpectNear(snapshot->visible_maximum.value, test.maximum);
    ExpectNear(snapshot->current_price, test.current);
    assert(snapshot->line_endpoint_visible);
    ExpectNear(snapshot->line_endpoint_y, snapshot->current_price_y);
    assert(snapshot->visible_y_min < test.minimum);
    assert(snapshot->visible_y_max > test.maximum);

    const size_t grid_floats =
        (snapshot->x_ticks.size() + snapshot->y_ticks.size()) * 36;
    bool has_transparent_fringe = false;
    bool has_top_color = false;
    bool has_bottom_color = false;
    const auto& vertices = ContentOf(*snapshot);
    for (size_t offset = grid_floats; offset + 5 < vertices.size();
         offset += 6) {
      assert(std::isfinite(vertices[offset]));
      assert(std::isfinite(vertices[offset + 1]));
      assert(vertices[offset] >= snapshot->plot.left - 1e-4f);
      assert(vertices[offset] <= snapshot->plot.right + 1e-4f);
      assert(vertices[offset + 1] >= snapshot->plot.top - 1e-4f);
      assert(vertices[offset + 1] <= snapshot->plot.bottom + 1e-4f);
      has_transparent_fringe =
          has_transparent_fringe || vertices[offset + 5] == 0.0f;
      has_top_color =
          has_top_color || vertices[offset + 2] > vertices[offset + 4];
      has_bottom_color =
          has_bottom_color || vertices[offset + 4] > vertices[offset + 2];
    }
    assert(has_transparent_fringe);
    assert(has_top_color);
    assert(has_bottom_color);

    engine.SetCrosshair(true, snapshot->plot.left, snapshot->plot.top);
    const auto crosshair = engine.Snapshot();
    ExpectNear(crosshair->selected_candle.open, 10.0);
    ExpectNear(crosshair->selected_candle.high, 100.0);
    ExpectNear(crosshair->selected_candle.low, 1.0);
    ExpectNear(crosshair->selected_candle.close, 20.0);
  }
}

void TestAreaFillAndLineLikeSemantics() {
  ChartConfig geometry_config;
  geometry_config.series_type = SeriesType::kArea;
  geometry_config.line_width = 4.0f;
  geometry_config.line_source = OhlcValueSource::kClose;
  geometry_config.line = {0.0f, 1.0f, 0.0f, 1.0f};
  geometry_config.area_fill_top = {1.0f, 0.0f, 0.0f, 0.5f};
  geometry_config.area_fill_bottom = {0.0f, 0.0f, 1.0f, 0.0f};
  const std::vector<Candle> candles{
      {0.0, 25.0, 25.0, 25.0, 25.0, 0.0},
      {1.0, 75.0, 75.0, 75.0, 75.0, 0.0},
  };
  std::vector<float> vertices;
  trading_charts::internal::AppendSeriesGeometry(
      trading_charts::internal::SeriesGeometryInput{
          geometry_config,
          candles,
          0,
          candles.size(),
          {0.0f, 0.0f, 100.0f, 100.0f},
          -0.125,
          1.125,
          0.0,
          100.0,
          nullptr},
      vertices);

  // The first quad is the fill: top vertices follow the line and sample one
  // pane-wide vertical gradient, while bottom vertices land on the pane bottom.
  // The opaque stroke is appended after it.
  assert(vertices.size() > 36);
  ExpectNear(vertices[1], 75.0);
  ExpectNear(vertices[7], 25.0);
  ExpectNear(vertices[13], 100.0);
  ExpectNear(vertices[2], 0.25);
  ExpectNear(vertices[4], 0.75);
  ExpectNear(vertices[5], 0.125);
  ExpectNear(vertices[8], 0.75);
  ExpectNear(vertices[10], 0.25);
  ExpectNear(vertices[11], 0.375);
  ExpectNear(vertices[17], 0.0);
  ExpectNear(vertices[35], 0.0);
  ExpectNear(vertices[41], 1.0);

  ChartConfig split_config = geometry_config;
  split_config.line_gap_threshold_ms = 0.5;
  std::vector<float> split_vertices;
  trading_charts::internal::AppendSeriesGeometry(
      trading_charts::internal::SeriesGeometryInput{
          split_config,
          candles,
          0,
          candles.size(),
          {0.0f, 0.0f, 100.0f, 100.0f},
          -0.125,
          1.125,
          0.0,
          100.0,
          nullptr},
      split_vertices);
  assert(split_vertices.empty());

  ChartEngine engine;
  ChartConfig config;
  config.initial_visible_count = 2;
  config.series_type = SeriesType::kArea;
  config.line_source = OhlcValueSource::kLow;
  engine.SetConfig(config);
  engine.SetSize(600.0f, 300.0f);
  const double history[] = {
      0.0, 10.0, 30.0, 5.0, 20.0, 1.0, 60000.0, 20.0, 40.0, 7.0, 30.0, 1.0,
  };
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  const auto snapshot = engine.Snapshot();
  ExpectNear(snapshot->visible_minimum.value, 5.0);
  ExpectNear(snapshot->visible_maximum.value, 7.0);
  ExpectNear(snapshot->current_price, 7.0);
  engine.SetCrosshair(true, snapshot->plot.left, snapshot->plot.top);
  assert(engine.Snapshot()->content_vertices == snapshot->content_vertices);

  ChartEngine additional;
  ChartConfig additional_config;
  additional_config.initial_visible_count = 2;
  additional_config.show_current_price = false;
  additional.SetConfig(additional_config);
  additional.SetSize(600.0f, 300.0f);
  assert(additional.SetHistory(history, 12) == UpdateStatus::kApplied);
  SeriesConfig area;
  area.series_id = "comparison-area";
  area.type = SeriesType::kArea;
  area.pane_id = "main";
  area.price_scale_id = "main";
  area.line_source = OhlcValueSource::kClose;
  assert(additional.AddSeries(area) == UpdateStatus::kApplied);
  const double comparison[] = {
      0.0, 80.0, 85.0, 75.0, 80.0, 1.0, 60000.0, 90.0, 95.0, 85.0, 90.0, 1.0,
  };
  assert(additional.SetSeriesData("comparison-area", comparison, 12, false) ==
         UpdateStatus::kApplied);
  const auto additional_snapshot = additional.Snapshot();
  assert(additional_snapshot->visible_y_max >= 90.0);
  assert(additional_snapshot->content_vertices != nullptr);
}

void TestBaselineGeometry() {
  using trading_charts::internal::AppendSeriesGeometry;
  using trading_charts::internal::SeriesGeometryFloatCapacity;
  using trading_charts::internal::SeriesGeometryInput;
  ChartConfig config;
  config.series_type = SeriesType::kBaseline;
  config.baseline.line_visible = false;
  config.baseline.top_line = {0.0f, 1.0f, 0.0f, 1.0f};
  config.baseline.bottom_line = {1.0f, 0.0f, 0.0f, 1.0f};
  config.baseline.top_fill_top = {0.0f, 1.0f, 0.0f, 0.5f};
  config.baseline.top_fill_bottom = {0.0f, 1.0f, 0.0f, 0.0f};
  config.baseline.bottom_fill_top = {1.0f, 0.0f, 0.0f, 0.0f};
  config.baseline.bottom_fill_bottom = {1.0f, 0.0f, 0.0f, 0.5f};
  const std::vector<Candle> candles{{0.0, 25.0, 25.0, 25.0, 25.0, 0.0},
                                    {1.0, 75.0, 75.0, 75.0, 75.0, 0.0},
                                    {2.0, 25.0, 25.0, 25.0, 25.0, 0.0},
                                    {3.0, 50.0, 50.0, 50.0, 50.0, 0.0},
                                    {4.0, 50.0, 50.0, 50.0, 50.0, 0.0}};
  for (bool rounded : {false, true}) {
    for (bool dashed : {false, true}) {
      config.line_dashed = dashed;
      const SeriesGeometryInput input{
          config, candles, 0,   candles.size(), {0.0f, 0.0f, 100.0f, 100.0f},
          -0.25,  4.25,    0.0, 100.0,          nullptr,
          rounded};
      std::vector<float> vertices;
      vertices.reserve(SeriesGeometryFloatCapacity(input));
      const size_t capacity = vertices.capacity();
      AppendSeriesGeometry(input, vertices);
      assert(!vertices.empty());
      assert(vertices.capacity() == capacity);
      assert(vertices.size() % 18 == 0);
      bool has_top = false;
      bool has_bottom = false;
      for (size_t offset = 0; offset < vertices.size(); offset += 18) {
        // Every triangle belongs entirely to one side, including its AA fringe.
        const bool top = vertices[offset + 3] > 0.5f;
        has_top = has_top || top;
        has_bottom = has_bottom || !top;
        for (size_t vertex = offset; vertex < offset + 18; vertex += 6) {
          assert(std::isfinite(vertices[vertex]));
          assert(vertices[vertex] >= 0.0f && vertices[vertex] <= 100.0f);
          assert(vertices[vertex + 1] >= 0.0f &&
                 vertices[vertex + 1] <= 100.0f);
          assert(top ? vertices[vertex + 1] <= 50.0001f
                     : vertices[vertex + 1] >= 49.9999f);
          ExpectNear(vertices[vertex + 2], top ? 0.0 : 1.0);
          ExpectNear(vertices[vertex + 3], top ? 1.0 : 0.0);
          assert(vertices[vertex + 5] >= -1e-5f &&
                 vertices[vertex + 5] <= 1.00001f);
        }
      }
      assert(has_top && has_bottom);
      // At the first sample, price 25 is halfway between base 50 and pane
      // bottom.
      ExpectNear(vertices[5], 0.25);
    }
  }
  config.line_dashed = false;
  for (double base : {-1e300, -100.0, 0.0, 50.0, 100.0, 200.0, 1e300}) {
    config.baseline.percentage = false;
    config.baseline.value = base;
    std::vector<float> vertices;
    const SeriesGeometryInput input{
        config, candles, 0,   candles.size(), {0.0f, 0.0f, 100.0f, 100.0f},
        -0.25,  4.25,    0.0, 100.0};
    AppendSeriesGeometry(input, vertices);
    assert(!vertices.empty());
    for (size_t offset = 0; offset < vertices.size(); offset += 6) {
      assert(std::isfinite(vertices[offset + 1]));
      assert(vertices[offset + 1] >= -1e-4f &&
             vertices[offset + 1] <= 100.0001f);
      if (base <= 0.0) {
        ExpectNear(vertices[offset + 2], 0.0);
      }
      if (base >= 100.0) {
        ExpectNear(vertices[offset + 3], 0.0);
      }
    }
  }
  config.line_gap_threshold_ms = 0.5;
  std::vector<float> split;
  AppendSeriesGeometry(SeriesGeometryInput{config,
                                           candles,
                                           0,
                                           candles.size(),
                                           {0.0f, 0.0f, 100.0f, 100.0f},
                                           -0.25,
                                           4.25,
                                           0.0,
                                           100.0},
                       split);
  assert(split.empty());
  AppendSeriesGeometry(SeriesGeometryInput{config,
                                           candles,
                                           0,
                                           1,
                                           {0.0f, 0.0f, 100.0f, 100.0f},
                                           -0.25,
                                           4.25,
                                           0.0,
                                           100.0},
                       split);
  assert(split.empty());
}

void TestBaselineEngineSemantics() {
  ChartEngine engine;
  ChartConfig config;
  config.series_type = SeriesType::kBaseline;
  config.line_source = OhlcValueSource::kLow;
  config.initial_visible_count = 2;
  config.baseline.percentage = false;
  config.baseline.value = 10000.0;
  config.current_price_line_down = {1.0f, 0.0f, 0.0f, 1.0f};
  config.current_price_line_up = {0.0f, 1.0f, 0.0f, 1.0f};
  engine.SetConfig(config);
  engine.SetSize(600.0f, 300.0f);
  const double history[] = {0.0,     10.0, 30.0, 5.0, 20.0, 1.0,
                            60000.0, 20.0, 40.0, 7.0, 30.0, 1.0};
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  const auto initial = engine.Snapshot();
  ExpectNear(initial->visible_minimum.value, 5.0);
  ExpectNear(initial->visible_maximum.value, 7.0);
  ExpectNear(initial->current_price, 7.0);
  assert(initial->line_endpoint_visible && initial->line_endpoint_below_base);
  ExpectNear(initial->line_endpoint_y, initial->current_price_y);
  ExpectNear(initial->current_price_color.r, 1.0);
  assert(initial->visible_y_max < 100.0);
  engine.SetCrosshair(true, initial->plot.left, initial->plot.top);
  assert(engine.Snapshot()->content_vertices == initial->content_vertices);
  for (double percent : {0.0, 50.0, 100.0}) {
    config.baseline.percentage = true;
    config.baseline.value = percent;
    engine.SetConfig(config);
    const auto snapshot = engine.Snapshot();
    ExpectNear(snapshot->visible_y_min, initial->visible_y_min);
    ExpectNear(snapshot->visible_y_max, initial->visible_y_max);
    assert(snapshot->crosshair_visible);
    const bool up = 7.0 >= trading_charts::BaselinePrice(
                               config.baseline, snapshot->visible_y_min,
                               snapshot->visible_y_max);
    assert(snapshot->line_endpoint_below_base == !up);
    ExpectNear(snapshot->current_price_color.g, up ? 1.0 : 0.0);
  }
  config.baseline.percentage = false;
  config.baseline.value = 7.0;
  engine.SetConfig(config);
  ExpectNear(engine.Snapshot()->current_price_color.g, 1.0);
  assert(!engine.Snapshot()->line_endpoint_below_base);
  SeriesConfig series;
  series.series_id = "baseline-comparison";
  series.type = SeriesType::kBaseline;
  series.line_source = OhlcValueSource::kLow;
  assert(engine.AddSeries(series) == UpdateStatus::kApplied);
  assert(engine.SetSeriesData(series.series_id, history, 12, false) ==
         UpdateStatus::kApplied);
  const auto additional = engine.Snapshot();
  assert(!additional->crosshair_series_values.empty());
  const auto& selected = additional->crosshair_series_values.back();
  assert(selected.series_type == SeriesType::kBaseline);
  assert(selected.kind == trading_charts::CrosshairSeriesValueKind::kScalar);

  PaneConfig comparison;
  comparison.pane_id = "comparison";
  comparison.price_scale_id = "comparison";
  engine.SetPanes({PaneConfig{}, comparison}, false);
  series.series_id = "pane-baseline";
  series.pane_id = comparison.pane_id;
  series.price_scale_id = comparison.price_scale_id;
  series.line_source = OhlcValueSource::kClose;
  series.baseline.value = 25.0;
  series.baseline.line_color = {0.0f, 0.0f, 1.0f, 1.0f};
  assert(engine.AddSeries(series) == UpdateStatus::kApplied);
  assert(engine.SetSeriesData(series.series_id, history, 12, false) ==
         UpdateStatus::kApplied);
  const auto panes = engine.Snapshot();
  const auto& pane = panes->panes[1];
  assert(pane.visible_y_max > 30.0 && pane.visible_y_min < 20.0);
  const float guide_y = pane.plot.bottom - pane.plot.Height() * 0.25f;
  bool found_guide = false;
  const auto& geometry = ContentOf(*panes);
  for (size_t index = 0; index < geometry.size(); index += 6) {
    if (geometry[index + 2] == 0.0f && geometry[index + 3] == 0.0f &&
        geometry[index + 4] == 1.0f && geometry[index + 5] > 0.5f) {
      found_guide = true;
      assert(std::abs(geometry[index + 1] - guide_y) <= 1.0f);
    }
  }
  assert(found_guide);
}

void TestLineGapThresholdAndContentReuse() {
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0, 600000.0, 20.0, 22.0, 19.0, 21.0, 1.0,
  };
  ChartConfig config;
  config.initial_visible_count = 2;
  config.series_type = SeriesType::kLine;
  config.show_current_price = false;

  ChartEngine connected;
  connected.SetConfig(config);
  connected.SetSize(600.0f, 300.0f);
  assert(connected.SetHistory(history, 12) == UpdateStatus::kApplied);
  const auto connected_snapshot = connected.Snapshot();

  config.line_gap_threshold_ms = 60'000.0;
  ChartEngine split;
  split.SetConfig(config);
  split.SetSize(600.0f, 300.0f);
  assert(split.SetHistory(history, 12) == UpdateStatus::kApplied);
  const auto split_snapshot = split.Snapshot();
  assert(ContentOf(*connected_snapshot).size() >
         ContentOf(*split_snapshot).size());

  split.SetCrosshair(true, split_snapshot->plot.left, split_snapshot->plot.top);
  const auto crosshair = split.Snapshot();
  assert(crosshair->content_vertices == split_snapshot->content_vertices);
}

void TestLineSegmentsKeepConstantWidthAtSharpTurns() {
  ChartConfig config;
  config.series_type = SeriesType::kLine;
  config.line_width = 6.0f;
  config.line_source = OhlcValueSource::kClose;
  const std::vector<Candle> candles{
      {0.0, 20.0, 20.0, 20.0, 20.0, 0.0},
      {1.0, 80.0, 80.0, 80.0, 80.0, 0.0},
      {2.0, 20.0, 20.0, 20.0, 20.0, 0.0},
  };
  std::vector<float> vertices;
  trading_charts::internal::AppendSeriesGeometry(
      trading_charts::internal::SeriesGeometryInput{
          config,
          candles,
          0,
          candles.size(),
          {0.0f, 0.0f, 100.0f, 100.0f},
          -100.0,
          900.0,
          0.0,
          100.0,
          nullptr},
      vertices);

  // The first six vertices are the first segment's core quad. Both endpoint
  // cross-sections must keep the requested width and the same orientation;
  // a join normal must never flip one end into a self-intersecting bow tie.
  assert(vertices.size() >= 36);
  const float start_cross_x = vertices[0] - vertices[30];
  const float start_cross_y = vertices[1] - vertices[31];
  const float end_cross_x = vertices[6] - vertices[12];
  const float end_cross_y = vertices[7] - vertices[13];
  ExpectNear(std::hypot(start_cross_x, start_cross_y), config.line_width, 1e-4);
  ExpectNear(std::hypot(end_cross_x, end_cross_y), config.line_width, 1e-4);
  assert(start_cross_x * end_cross_x + start_cross_y * end_cross_y > 0.0f);
}

void TestRoundedLineCapsJoinsAndClipping() {
  for (const auto type : {SeriesType::kLine, SeriesType::kArea}) {
    for (const float scale : {1.0f, 3.0f}) {
      ChartConfig config;
      config.series_type = type;
      config.line_width = 8.0f * scale;
      config.display_scale = scale;
      config.line = {0.2f, 0.4f, 0.6f, 0.5f};
      config.area_fill_top.a = 0.0f;
      config.area_fill_bottom.a = 0.0f;
      const std::vector<Candle> candles{
          {20.0, 50.0, 50.0, 50.0, 50.0, 0.0},
          {80.0, 50.0, 50.0, 50.0, 50.0, 0.0},
      };
      trading_charts::internal::SeriesGeometryInput input{
          config,
          candles,
          0,
          candles.size(),
          {0.0f, 0.0f, 100.0f * scale, 100.0f * scale},
          0.0,
          100.0,
          0.0,
          100.0,
          nullptr,
          true};
      std::vector<float> vertices;
      const size_t capacity =
          trading_charts::internal::SeriesGeometryFloatCapacity(input);
      vertices.reserve(capacity);
      trading_charts::internal::AppendSeriesGeometry(input, vertices);
      assert(vertices.size() <= capacity);
      float left = 100.0f * scale;
      float right = 0.0f;
      for (size_t i = 0; i < vertices.size(); i += 6) {
        if (vertices[i + 5] == config.line.a) {
          left = std::min(left, vertices[i]);
          right = std::max(right, vertices[i]);
        }
      }
      ExpectNear(left, 16.0f * scale, 1e-4);
      ExpectNear(right, 84.0f * scale, 1e-4);
      input.rounded = false;
      vertices.clear();
      trading_charts::internal::AppendSeriesGeometry(input, vertices);
      for (size_t i = 0; i < vertices.size(); i += 6) {
        if (vertices[i + 5] == config.line.a) {
          assert(vertices[i] >= 20.0f * scale);
          assert(vertices[i] <= 80.0f * scale);
        }
      }
    }
  }

  ChartConfig config;
  config.series_type = SeriesType::kLine;
  config.line_width = 8.0f;
  // Both turn directions, including a nearly reversing segment and duplicate
  // positions. The rounded stroke must never grow a miter spike.
  for (const double middle : {20.0, 80.0}) {
    const std::vector<Candle> candles{
        {20.0, 50.0, 50.0, 50.0, 50.0, 0.0},
        {21.0, middle, middle, middle, middle, 0.0},
        {21.0, middle, middle, middle, middle, 0.0},
        {22.0, 50.0, 50.0, 50.0, 50.0, 0.0},
    };
    trading_charts::internal::SeriesGeometryInput input{
        config, candles, 0,   candles.size(), {0.0f, 0.0f, 100.0f, 100.0f},
        0.0,    100.0,   0.0, 100.0,          nullptr,
        true};
    std::vector<float> vertices;
    trading_charts::internal::AppendSeriesGeometry(input, vertices);
    bool has_round_tip = false;
    for (size_t i = 0; i < vertices.size(); i += 6) {
      assert(std::isfinite(vertices[i]) && std::isfinite(vertices[i + 1]));
      assert(vertices[i + 1] >= 15.0f - 1e-4f &&
             vertices[i + 1] <= 85.0f + 1e-4f);
      has_round_tip |= vertices[i + 1] < 17.0f || vertices[i + 1] > 83.0f;
    }
    assert(has_round_tip);
    // Clip through the rounded joint and its alpha fringe.
    input.visible_y_min = 25.0;
    input.visible_y_max = 75.0;
    vertices.clear();
    trading_charts::internal::AppendSeriesGeometry(input, vertices);
    for (size_t i = 0; i < vertices.size(); i += 6) {
      assert(vertices[i + 1] >= input.plot.top - 1e-4f);
      assert(vertices[i + 1] <= input.plot.bottom + 1e-4f);
    }
  }
}

std::vector<float> BlueStrokeVertices(const std::vector<float>& vertices) {
  std::vector<float> result;
  for (size_t i = 0; i < vertices.size(); i += 6) {
    if (vertices[i + 2] == 0.0f && vertices[i + 3] == 0.0f &&
        vertices[i + 4] == 1.0f) {
      result.insert(result.end(), vertices.begin() + static_cast<ptrdiff_t>(i),
                    vertices.begin() + static_cast<ptrdiff_t>(i + 6));
    }
  }
  return result;
}

void TestMainRoundingAndIndependentIndicatorStrokes() {
  for (const auto type : {SeriesType::kLine, SeriesType::kArea,
                          SeriesType::kCandlestick, SeriesType::kBar}) {
    ChartEngine engine;
    ChartConfig config;
    config.series_type = type;
    config.line = {1.0f, 0.0f, 0.0f, 1.0f};
    config.show_current_price = false;
    config.initial_visible_count = 10;
    engine.SetConfig(config);
    engine.SetSize(500.0f, 300.0f);
    const double history[] = {
        0.0,  20.0, 20.0, 20.0,     20.0, 1.0,  60000.0, 80.0, 80.0,
        80.0, 80.0, 1.0,  120000.0, 20.0, 20.0, 20.0,    20.0, 1.0,
    };
    assert(engine.SetHistory(history, std::size(history)) ==
           UpdateStatus::kApplied);
    SeriesConfig series;
    series.series_id = "additional";
    series.type = SeriesType::kLine;
    series.color = {0.0f, 0.0f, 1.0f, 1.0f};
    assert(engine.AddSeries(series) == UpdateStatus::kApplied);
    assert(engine.SetSeriesData(series.series_id, history, std::size(history),
                                false) == UpdateStatus::kApplied);
    const size_t plain_size =
        BlueStrokeVertices(ContentOf(*engine.Snapshot())).size();
    assert(plain_size > 0);
    series.series_id = "sma";
    series.source = SeriesSource::kOhlcvSma;
    series.source_series_id = "main";
    series.moving_average_period = 1;
    assert(engine.AddSeries(series) == UpdateStatus::kApplied);
    const auto rounded = engine.Snapshot();
    const auto overlays = BlueStrokeVertices(ContentOf(*rounded));
    // Both blue curves follow identical samples. The SMA adds arc triangles
    // at its caps and joins beyond the flat-ended comparison line.
    assert(overlays.size() > 2 * plain_size);
    config.line_rounded = false;
    engine.SetConfig(config);
    const auto sharp = engine.Snapshot();
    assert(BlueStrokeVertices(ContentOf(*sharp)) == overlays);
    if (type == SeriesType::kLine || type == SeriesType::kArea) {
      assert(ContentOf(*rounded) != ContentOf(*sharp));
    } else {
      assert(ContentOf(*rounded) == ContentOf(*sharp));
    }
    config.line_rounded = true;
    engine.SetConfig(config);
    assert(ContentOf(*engine.Snapshot()) == ContentOf(*rounded));
  }
}

}  // namespace

void RunGeometryTests() {
  TestCurrentPriceLineIsOneUnitThick();
  TestHybridHistoryUsesLocalCandleWidths();
  TestLogicalSpacingUsesUniformCandleSlots();
  TestTriangleClippingFastPaths();
  TestPackedGeometryAppendPreservesExistingVertices();
  TestBarGeometryAndRuntimeSwitch();
  TestHollowCandlestickGeometry();
  TestRoundedCandlestickGeometry();
  TestHollowCandlestickSpacingAndClipping();
  TestBarSpacingAndClipping();
  TestCurrentPriceLineAndLabelColorsAreIndependent();
  TestMainLineEndpoint();
  TestLineSourceAutoscaleCurrentPriceAndGradient();
  TestAreaFillAndLineLikeSemantics();
  TestBaselineGeometry();
  TestBaselineEngineSemantics();
  TestLineGapThresholdAndContentReuse();
  TestLineSegmentsKeepConstantWidthAtSharpTurns();
  TestRoundedLineCapsJoinsAndClipping();
  TestMainRoundingAndIndependentIndicatorStrokes();
  TestDashedLineGeometryUsesSharedTriangleContract();
}

}  // namespace trading_charts::test
