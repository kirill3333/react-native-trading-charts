// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT
#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <exception>
#include <iostream>
#include <limits>
#include <memory>
#include <string>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/marker_geometry.h"

namespace {
using trading_charts::ChartEngine;
using trading_charts::Marker;
using trading_charts::MarkerField;
using trading_charts::MarkerStore;

Marker MakeMarker(const std::string& id, double timestamp) {
  Marker result;
  result.id = id;
  result.text = "DB";
  result.descriptor = std::make_shared<const std::string>(id);
  result.values = {timestamp, 0, 14, 2,  6,   4,   36,  36,  99,
                   6,         8, 16, 12, 20,  0.2, 0.8, 0.4, 1,
                   1,         1, 1,  1,  0.1, 0.4, 0.2, 1};
  return result;
}

void TestStore() {
  MarkerStore store;
  Marker first = MakeMarker("first", 60000);
  Marker second = MakeMarker("second", 60000);
  assert(store.Set({first, second}, true));
  assert(!store.Set({first, second}, true));
  first.text = "NEW";
  assert(store.Set({first}, false));
  assert(store.Times().begin()->second == "first");
  assert(store.Set({second, first}, true));
  assert(store.Times().begin()->second == "second");
  assert(!store.Set({first, first}, true));
  assert(store.Size() == 2);
  first.text = "TOOLONG";
  assert(!store.Set({first}, true));
  first = MakeMarker("bad", -1);
  assert(!store.Set({first}, true));
  first.Set(MarkerField::kTimestamp, std::numeric_limits<double>::quiet_NaN());
  assert(!store.Set({first}, false));
  assert(!store.Remove("absent"));
  assert(store.Remove("first"));
  assert(store.Clear());
  assert(!store.Clear());
}

void TestEngine(bool logical) {
  ChartEngine engine;
  trading_charts::ChartConfig config;
  config.logical_spacing = logical;
  config.y_scale_margin_top = 0.35f;
  config.y_scale_margin_bottom = 0.35f;
  engine.SetConfig(config);
  engine.SetSize(800, 600);
  const std::vector<double> candles{60000,  10, 12, 8,  11, 5,
                                    120000, 11, 13, 9,  12, 5,
                                    180000, 12, 14, 10, 13, 5};
  engine.SetHistory(candles.data(), candles.size());
  engine.FitContent();
  const auto plain = engine.Snapshot();
  Marker marker = MakeMarker("one", 120000);
  assert(engine.SetMarkers({marker}, false));
  const auto marked = engine.Snapshot();
  assert(marked->content_revision == plain->content_revision);
  assert(marked->content_vertices == plain->content_vertices);
  assert(marked->marker_revision > plain->marker_revision);
  assert(marked->markers->visible_count == 1);
  assert(marked->visible_y_min == plain->visible_y_min);
  assert(marked->visible_y_max == plain->visible_y_max);
  assert(!engine.SetMarkers({marker}, false));
  assert(!engine.RemoveMarker("absent"));
  assert(engine.Snapshot() == marked);
  engine.SetCrosshair(true, 400, 300);
  const auto crosshair = engine.Snapshot();
  assert(crosshair->markers == marked->markers);
  assert(crosshair->content_vertices == marked->content_vertices);
  marker.text = "ABCDE";
  marker.Set(MarkerField::kBelow, 1);
  assert(engine.SetMarkers({marker}, false));
  const auto changed = engine.Snapshot();
  assert(changed->markers != marked->markers);
  assert(changed->content_vertices == marked->content_vertices);
  assert(marked->markers->visible_count == 1);
  for (size_t index = 0; index < changed->markers->vertices.size();
       index += 8) {
    const auto& vertices = changed->markers->vertices;
    assert(vertices[index] >= changed->plot.left - 0.001f);
    assert(vertices[index] <= changed->plot.right + 0.001f);
    assert(vertices[index + 1] >= changed->plot.top - 0.001f);
    assert(vertices[index + 1] <= changed->plot.bottom + 0.001f);
    assert(vertices[index + 2] >= 0 && vertices[index + 2] <= 1);
    assert(vertices[index + 3] >= 0 && vertices[index + 3] <= 1);
  }
  Marker missing = MakeMarker("older", 0);
  assert(engine.SetMarkers({missing}, false));
  assert(engine.Snapshot()->markers->visible_count == 1);
  const double older[]{0, 10, 12, 8, 11, 5};
  engine.PrependHistory(older, 6);
  engine.FitContent();
  assert(engine.Snapshot()->markers->visible_count == 2);
  engine.Clear();
  assert(engine.Snapshot()->markers->vertices.empty());
  engine.SetHistory(candles.data(), candles.size());
  engine.FitContent();
  assert(engine.Snapshot()->markers->visible_count == 1);
  const auto before_update = engine.Snapshot();
  const double latest[]{180000, 12, 20, 5, 13, 5};
  engine.UpdateCandle(latest, 6);
  assert(engine.Snapshot()->marker_revision > before_update->marker_revision);
  engine.ResetForReuse();
  engine.SetSize(800, 600);
  engine.SetHistory(candles.data(), candles.size());
  assert(engine.Snapshot()->markers->vertices.empty());
}

void TestLayoutAndVolume() {
  std::vector<trading_charts::Candle> candles;
  std::vector<Marker> markers;
  for (int index = 0; index < 10000; ++index) {
    const double timestamp = index * 60000.0;
    candles.push_back({timestamp, 10, 12, 8, 11, 0});
    markers.push_back(MakeMarker(std::to_string(index), timestamp));
  }
  MarkerStore store;
  assert(store.Set(markers, true));
  trading_charts::RenderSnapshot snapshot;
  snapshot.plot = {10, 10, 1010, 800};
  snapshot.visible_x_min = candles[4000].timestamp;
  snapshot.visible_x_max = candles[4499].timestamp;
  snapshot.first_visible_index = 4000;
  snapshot.last_visible_index = 4499;
  snapshot.has_visible_candles = true;
  snapshot.visible_y_min = 0;
  snapshot.visible_y_max = 20;
  const auto geometry = trading_charts::internal::BuildMarkers(
      store, candles, snapshot, snapshot.visible_x_min, snapshot.visible_x_max);
  assert(geometry->visible_count == 500);
  assert(geometry->batches.size() == 1);
  Marker stack = MakeMarker("stack", candles[4000].timestamp);
  stack.Set(MarkerField::kFontSize, 15);
  store.Set({stack}, false);
  const auto stacked = trading_charts::internal::BuildMarkers(
      store, candles, snapshot, snapshot.visible_x_min, snapshot.visible_x_max);
  assert(stacked->visible_count == 501);
  assert(stacked->batches.size() == 3);
  const size_t a = stacked->batches[0].first_vertex * 8;
  const size_t b = stacked->batches[1].first_vertex * 8;
  assert(stacked->vertices[b + 1] < stacked->vertices[a + 1]);
  snapshot.has_visible_candles = false;
  assert(trading_charts::internal::BuildMarkers(store, candles, snapshot,
                                                snapshot.visible_x_min,
                                                snapshot.visible_x_max)
             ->vertices.empty());
}
std::array<float, 4> Bounds(
    const trading_charts::MarkerSnapshot::HitRegion& region) {
  std::array<float, 4> box{region.contour[0][0], region.contour[0][1],
                           region.contour[0][0], region.contour[0][1]};
  for (const auto& point : region.contour) {
    box[0] = std::min(box[0], point[0]);
    box[1] = std::min(box[1], point[1]);
    box[2] = std::max(box[2], point[0]);
    box[3] = std::max(box[3], point[1]);
  }
  return box;
}

void TestHits(bool logical) {
  ChartEngine engine;
  trading_charts::ChartConfig config;
  config.logical_spacing = logical;
  config.y_scale_margin_top = 0.4f;
  config.y_scale_margin_bottom = 0.4f;
  engine.SetConfig(config);
  engine.SetSize(800, 600);
  const double candles[]{60000, 10, 12, 8,      11, 5,  120000, 11, 13,
                         9,     12, 5,  180000, 12, 14, 10,     13, 5};
  engine.SetHistory(candles, 18);
  engine.FitContent();
  Marker first = MakeMarker("first", 120000);
  Marker second = MakeMarker("second", 120000);
  assert(engine.SetMarkers({first, second}, true));
  const auto old = engine.Snapshot();
  assert(old->markers->hit_regions.size() == 2);
  const auto box = Bounds(old->markers->hit_regions[0]);
  const float x = (box[0] + box[2]) / 2;
  const float y = (box[1] + box[3]) / 2;
  assert(trading_charts::HitTestMarker(*old->markers, x, y) == "first");
  assert(trading_charts::HitTestMarker(*old->markers, box[0] + 1, box[1] + 1)
             .empty());
  assert(trading_charts::HitTestMarker(*old->markers, x, box[1] - 2).empty());
  const auto top = Bounds(old->markers->hit_regions[1]);
  assert(trading_charts::HitTestMarker(*old->markers, x,
                                       (top[1] + top[3]) / 2) == "second");
  assert(engine.Revision() == old->revision);
  auto clipped = *old->markers;
  clipped.hit_regions[0].clip[2] = x - 1;
  assert(trading_charts::HitTestMarker(clipped, x, y).empty());
  auto overlapped = *old->markers;
  overlapped.hit_regions.push_back(overlapped.hit_regions.front());
  overlapped.hit_regions.back().descriptor = second.descriptor;
  assert(trading_charts::HitTestMarker(overlapped, x, y) == "second");
  first.descriptor = std::make_shared<const std::string>("updated metadata");
  assert(engine.SetMarkers({first}, false));
  const auto updated = engine.Snapshot();
  assert(updated->content_vertices == old->content_vertices);
  assert(trading_charts::HitTestMarker(*updated->markers, x, y) ==
         "updated metadata");
  assert(trading_charts::HitTestMarker(*old->markers, x, y) == "first");
  assert(!engine.SetMarkers({first}, false));
  engine.ClearMarkers();
  assert(engine.Snapshot()->markers->hit_regions.empty());
  assert(trading_charts::HitTestMarker(*old->markers, x, y) == "first");
}

}  // namespace

int main() {
  try {
    TestStore();
    TestHits(false);
    TestHits(true);
    TestEngine(false);
    TestEngine(true);
    TestLayoutAndVolume();
    std::cout << "Marker tests passed\n";
  } catch (const std::exception& error) {
    std::cerr << error.what() << "\n";
    return 1;
  }
  return 0;
}
