// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
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
#include "cpp/internal/config_constants.h"
#include "cpp/internal/triangle_geometry.h"
#include "cpp/tests/chart_engine_test_access.h"
#include "cpp/tests/chart_engine_test_helpers.h"
#include "cpp/tests/chart_engine_test_suites.h"

namespace trading_charts::test {

namespace {

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
  assert(!ContentOf(*snapshot).empty());
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

void TestScaleMarginContentFractionBoundary() {
  constexpr double kAcceptedContentFraction =
      trading_charts::internal::kMinimumScaleContentFraction * 2.0;
  constexpr double kRejectedContentFraction =
      trading_charts::internal::kMinimumScaleContentFraction * 0.5;

  ChartEngine engine;
  ChartConfig config;
  config.y_scale_margin_top = 1.0 - kAcceptedContentFraction;
  config.y_scale_margin_bottom = 0.0;
  engine.SetConfig(config);
  auto snapshot = engine.Snapshot();
  ExpectNear(snapshot->config.y_scale_margin_top, config.y_scale_margin_top);
  ExpectNear(snapshot->config.y_scale_margin_bottom, 0.0);

  config.y_scale_margin_top = 1.0 - kRejectedContentFraction;
  engine.SetConfig(config);
  snapshot = engine.Snapshot();
  const ChartConfig defaults;
  ExpectNear(snapshot->config.y_scale_margin_top, defaults.y_scale_margin_top);
  ExpectNear(snapshot->config.y_scale_margin_bottom,
             defaults.y_scale_margin_bottom);

  config.y_scale_margin_top = std::numeric_limits<double>::quiet_NaN();
  config.y_scale_margin_bottom = 0.0;
  engine.SetConfig(config);
  snapshot = engine.Snapshot();
  ExpectNear(snapshot->config.y_scale_margin_top, defaults.y_scale_margin_top);
  ExpectNear(snapshot->config.y_scale_margin_bottom,
             defaults.y_scale_margin_bottom);

  PaneConfig main;
  PaneConfig accepted;
  accepted.pane_id = "accepted";
  accepted.price_scale_id = "accepted";
  accepted.scale_margin_top = 1.0 - kAcceptedContentFraction;
  accepted.scale_margin_bottom = 0.0;
  PaneConfig rejected;
  rejected.pane_id = "rejected";
  rejected.price_scale_id = "rejected";
  rejected.scale_margin_top = 1.0 - kRejectedContentFraction;
  rejected.scale_margin_bottom = 0.0;
  engine.SetPanes({main, accepted, rejected}, false);
  const PaneConfig accepted_result =
      trading_charts::ChartEngineTestAccess::PaneAt(engine, 1);
  const PaneConfig rejected_result =
      trading_charts::ChartEngineTestAccess::PaneAt(engine, 2);
  ExpectNear(accepted_result.scale_margin_top, accepted.scale_margin_top);
  ExpectNear(accepted_result.scale_margin_bottom, 0.0);
  ExpectNear(rejected_result.scale_margin_top, 0.1);
  ExpectNear(rejected_result.scale_margin_bottom, 0.0);

  engine.SetSize(800.0F, 500.0F);
  const double history[] = {0.0, 10.0, 20.0, 10.0, 15.0, 1.0};
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  snapshot = engine.Snapshot();
  assert(std::isfinite(snapshot->visible_y_min));
  assert(std::isfinite(snapshot->visible_y_max));
}

void TestPaneInvariantWithEmptyConfiguration() {
  ChartEngine engine;
  engine.SetSize(400.0F, 240.0F);
  auto snapshot = engine.Snapshot();
  assert(snapshot->panes.size() == 1);
  assert(snapshot->panes.front().pane_id == "main");

  engine.SetPanes({}, true);
  snapshot = engine.Snapshot();
  assert(snapshot->panes.size() == 1);
  assert(snapshot->panes.front().pane_id == "main");
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
    ExpectNear(initial->visible_maximum.x, initial->visible_minimum.x,
               kFloatGeometryTolerance);
    ExpectNear(initial->visible_maximum.y,
               initial->plot.bottom -
                   (48.0 - initial->visible_y_min) /
                       (initial->visible_y_max - initial->visible_y_min) *
                       initial->plot.Height(),
               kFloatGeometryTolerance);
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
  assert(ContentOf(*above).size() == ContentOf(*hidden).size());

  const auto inside_hidden =
      snapshot_for_current_price(10.0, 11.0, 9.0, 10.0, true, false);
  assert(ContentOf(*inside).size() > ContentOf(*inside_hidden).size());
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
  assert(!engine.ScrollToRealTime(1.0));
  engine.FitContent();
  const auto snapshot = engine.Snapshot();
  ExpectNear(snapshot->visible_x_min, 0.0);
  ExpectNear(snapshot->visible_x_max, 1.0);
  assert(!snapshot->crosshair_visible);
}

void TestScrollToRealTimePreservesScaleAndTracksLiveEdge() {
  for (bool logical_spacing : {false, true}) {
    ChartEngine engine;
    ChartConfig config;
    config.initial_visible_count = 3;
    config.logical_spacing = logical_spacing;
    engine.SetConfig(config);
    engine.SetSize(800.0f, 500.0f);
    const double history[] = {
        0.0,      10.0, 12.0, 9.0,      11.0, 1.0,  60000.0,  11.0, 13.0,
        10.0,     12.0, 1.0,  120000.0, 12.0, 14.0, 11.0,     13.0, 1.0,
        180000.0, 13.0, 15.0, 12.0,     14.0, 1.0,  240000.0, 14.0, 16.0,
        13.0,     15.0, 1.0,  300000.0, 15.0, 17.0, 14.0,     16.0, 1.0,
    };
    assert(engine.SetHistory(history, std::size(history)) ==
           UpdateStatus::kApplied);
    assert(engine.Pan(250.0f));
    assert(engine.ScaleY(50.0f));
    const auto historical = engine.Snapshot();
    const double span = historical->visible_x_max - historical->visible_x_min;
    const double horizontal_scale = historical->horizontal_scale;
    const double y_axis_scale = historical->y_axis_scale;

    config.allow_pan = false;
    engine.SetConfig(config);
    assert(engine.ScrollToRealTime(0.25));
    const auto halfway = engine.Snapshot();
    if (logical_spacing) {
      assert(halfway->first_visible_index > historical->first_visible_index);
      ExpectNear(halfway->horizontal_scale, horizontal_scale);
    } else {
      ExpectNear(halfway->visible_x_max,
                 historical->visible_x_max +
                     (450000.0 - historical->visible_x_max) * 0.25);
      ExpectNear(halfway->visible_x_max - halfway->visible_x_min, span);
    }
    ExpectNear(halfway->y_axis_scale, y_axis_scale);

    const double next[] = {360000.0, 16.0, 18.0, 15.0, 17.0, 1.0};
    assert(engine.UpdateCandle(next, std::size(next)) ==
           UpdateStatus::kApplied);
    const auto appended = engine.Snapshot();
    if (!logical_spacing) {
      ExpectNear(appended->visible_x_max, halfway->visible_x_max);
    }

    engine.SetCrosshair(true, 120.0f, 100.0f);
    assert(engine.ScrollToRealTime(1.0));
    const auto live = engine.Snapshot();
    if (logical_spacing) {
      assert(live->last_visible_index + 1 == live->total_candle_count);
      ExpectNear(live->horizontal_scale, horizontal_scale);
    } else {
      ExpectNear(live->visible_x_max, 510000.0);
      ExpectNear(live->visible_x_max - live->visible_x_min, span);
    }
    ExpectNear(live->y_axis_scale, y_axis_scale);
    assert(!live->crosshair_visible);
    assert(!engine.ScrollToRealTime(1.0));
    assert(!engine.ScrollToRealTime(0.0));
    assert(!engine.ScrollToRealTime(std::numeric_limits<double>::quiet_NaN()));

    const double following[] = {420000.0, 17.0, 19.0, 16.0, 18.0, 1.0};
    assert(engine.UpdateCandle(following, std::size(following)) ==
           UpdateStatus::kApplied);
    const auto followed = engine.Snapshot();
    if (logical_spacing) {
      assert(followed->last_visible_index + 1 == followed->total_candle_count);
    } else {
      ExpectNear(followed->visible_x_max, 570000.0);
    }
  }
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

void TestScaleYResultIdentifiesChangedPane() {
  for (int crosshair_pane = -1; crosshair_pane < 2; ++crosshair_pane) {
    for (size_t target = 0; target < 2; ++target) {
      ChartEngine engine;
      engine.SetSize(600.0F, 360.0F);
      PaneConfig main;
      PaneConfig volume;
      volume.pane_id = "volume";
      volume.price_scale_id = "volume-scale";
      engine.SetPanes({main, volume}, false);
      const double history[] = {0.0, 10.0, 12.0, 9.0, 11.0, 5.0};
      assert(engine.SetHistory(history, std::size(history)) ==
             UpdateStatus::kApplied);
      const auto before = engine.Snapshot();
      if (crosshair_pane >= 0) {
        const auto& plot =
            before->panes[static_cast<size_t>(crosshair_pane)].plot;
        engine.SetCrosshair(true, plot.left + 10.0F,
                            (plot.top + plot.bottom) * 0.5F);
      }
      const auto& pane = before->panes[target];
      const auto result = engine.ScaleYAtWithResult(
          20.0F, (pane.plot.top + pane.plot.bottom) * 0.5F);
      const auto after = engine.Snapshot();
      assert(result.state_changed && result.scale_changed);
      assert(result.pane_id == pane.pane_id);
      assert(result.price_scale_id == pane.price_scale_id);
      assert(result.is_main_pane == (target == 0));
      ExpectNear(result.scale, after->panes[target].y_axis_scale);
      assert(result.scale != pane.y_axis_scale);
      ExpectNear(after->panes[1 - target].y_axis_scale,
                 before->panes[1 - target].y_axis_scale);
      assert(!after->crosshair_visible);
      assert(after->active_pane_index == 0);
    }
  }
}

void TestScaleYResultDistinguishesOverlayAndNoChange() {
  ChartEngine engine;
  engine.SetSize(600.0F, 360.0F);
  const auto empty = engine.ScaleYAtWithResult(20.0F, 100.0F);
  assert(!empty.state_changed && !empty.scale_changed);
  const double history[] = {0.0, 10.0, 12.0, 9.0, 11.0, 5.0};
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  const auto zero = engine.ScaleYAtWithResult(0.0F, 100.0F);
  assert(!zero.state_changed && !zero.scale_changed);
  engine.SetCrosshair(true, 100.0F, 100.0F);
  ExpectOverlayMutation(engine, [&] {
    const auto result = engine.ScaleYAtWithResult(0.0F, 100.0F);
    assert(result.state_changed && !result.scale_changed);
    assert(result.pane_id.empty() && result.price_scale_id.empty());
  });
  for (float delta : {-100000.0F, 100000.0F}) {
    assert(engine.ScaleYAtWithResult(delta, 100.0F).scale_changed);
    ExpectNoRenderMutation(engine, [&] {
      const auto result = engine.ScaleYAtWithResult(delta, 100.0F);
      assert(!result.state_changed && !result.scale_changed);
    });
    engine.SetCrosshair(true, 100.0F, 100.0F);
    ExpectOverlayMutation(engine, [&] {
      const auto result = engine.ScaleYAtWithResult(delta, 100.0F);
      assert(result.state_changed && !result.scale_changed);
    });
  }
  ExpectNoRenderMutation(engine, [&] {
    const auto result = engine.ScaleYAtWithResult(
        std::numeric_limits<float>::quiet_NaN(), 100.0F);
    assert(!result.state_changed && !result.scale_changed);
  });
  ChartConfig config;
  config.allow_y_axis_scale = false;
  engine.SetConfig(config);
  engine.SetCrosshair(true, 100.0F, 100.0F);
  ExpectNoRenderMutation(engine, [&] {
    const auto result = engine.ScaleYAtWithResult(20.0F, 100.0F);
    assert(!result.state_changed && !result.scale_changed);
  });
  config.allow_y_axis_scale = true;
  config.show_y_axis = false;
  engine.SetConfig(config);
  ExpectNoRenderMutation(engine, [&] {
    const auto result = engine.ScaleYAtWithResult(20.0F, 100.0F);
    assert(!result.state_changed && !result.scale_changed);
  });
}

void TestPaneSeparatorUsesStrongerGridAlpha() {
  ChartEngine engine;
  ChartConfig config;
  config.grid = {0.2f, 0.3f, 0.4f, 0.8f};
  config.grid_opacity = 0.5f;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(400.0f, 240.0f);

  PaneConfig main;
  PaneConfig volume;
  volume.pane_id = "volume";
  volume.price_scale_id = "volume";
  engine.SetPanes({main, volume}, false);

  const double candle[] = {0.0, 10.0, 12.0, 9.0, 11.0, 1.0};
  assert(engine.SetHistory(candle, 6) == UpdateStatus::kApplied);
  const auto snapshot = engine.Snapshot();
  const auto& vertices = ContentOf(*snapshot);
  constexpr size_t kFloatsPerQuad = 36;
  assert(vertices.size() >= kFloatsPerQuad);
  const size_t separator_offset = vertices.size() - kFloatsPerQuad;

  ExpectNear(vertices[separator_offset + 2], config.grid.r);
  ExpectNear(vertices[separator_offset + 3], config.grid.g);
  ExpectNear(vertices[separator_offset + 4], config.grid.b);
  ExpectNear(vertices[separator_offset + 5], 0.56, 1e-6);
  assert(vertices[separator_offset + 5] > config.grid.a * config.grid_opacity);
}

void TestVolumePaneTickMinimumDependsOnHeight() {
  auto snapshot_at_height = [](float height) {
    ChartEngine engine;
    ChartConfig config;
    config.initial_visible_count = 10;
    config.show_current_price = false;
    engine.SetConfig(config);
    engine.SetSize(600.0f, height);

    PaneConfig main;
    main.height_weight = 3.0;
    PaneConfig volume;
    volume.pane_id = "volume";
    volume.price_scale_id = "volume";
    volume.height_weight = 1.0;
    volume.volume_format = true;
    volume.scale_margin_top = 0.1;
    volume.scale_margin_bottom = 0.0;
    volume.min_move = 1.0;
    engine.SetPanes({main, volume}, false);

    SeriesConfig derived;
    derived.series_id = "volume";
    derived.type = SeriesType::kHistogram;
    derived.source = SeriesSource::kOhlcvVolume;
    derived.source_series_id = "main";
    derived.pane_id = "volume";
    derived.price_scale_id = "volume";
    assert(engine.AddSeries(derived) == UpdateStatus::kApplied);

    const double history[] = {
        0.0, 10.0, 12.0, 9.0, 11.0, 17.0,
    };
    assert(engine.SetHistory(history, 6) == UpdateStatus::kApplied);
    return engine.Snapshot();
  };

  const auto tall = snapshot_at_height(435.0f);
  const auto& tall_volume = tall->panes[1];
  assert(tall_volume.plot.Height() >= 88.0f);
  assert(tall_volume.y_tick_count == 4);
  ExpectNear(tall->pane_y_ticks[tall_volume.y_tick_offset].value, 0.0);
  ExpectNear(tall->pane_y_ticks[tall_volume.y_tick_offset + 1].value, 5.0);
  ExpectNear(tall->pane_y_ticks[tall_volume.y_tick_offset + 2].value, 10.0);
  ExpectNear(tall->pane_y_ticks[tall_volume.y_tick_offset + 3].value, 15.0);

  const auto short_pane = snapshot_at_height(315.0f);
  const auto& short_volume = short_pane->panes[1];
  assert(short_volume.plot.Height() < 88.0f);
  assert(short_volume.y_tick_count == 2);
  ExpectNear(short_pane->pane_y_ticks[short_volume.y_tick_offset].value, 0.0);
  ExpectNear(short_pane->pane_y_ticks[short_volume.y_tick_offset + 1].value,
             10.0);
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

void TestResizeOnlyChangesAdjacentPanes() {
  for (const double middle_weight : {1.0, 0.01}) {
    ChartEngine engine;
    engine.SetSize(500.0f, 400.0f);
    PaneConfig middle;
    middle.pane_id = "middle";
    middle.price_scale_id = "middle";
    middle.height_weight = middle_weight;
    PaneConfig bottom;
    bottom.pane_id = "bottom";
    bottom.price_scale_id = "bottom";
    engine.SetPanes({PaneConfig{}, middle, bottom}, true);
    const auto initial = engine.Snapshot();
    for (const float delta : {-10.0f, -10.0f, 1000.0f}) {
      const auto before = engine.Snapshot();
      assert(engine.ResizePaneSeparator(0, delta));
      const auto after = engine.Snapshot();
      const double expected =
          std::max(middle.min_height, before->panes[1].plot.Height() - delta);
      ExpectNear(after->panes[1].plot.Height(), expected,
                 kFloatGeometryTolerance);
      ExpectNear(after->panes[2].plot.top, initial->panes[2].plot.top,
                 kFloatGeometryTolerance);
    }
  }
}

void TestViewportInDataGapReportsEmptyRange() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  // Irregular timestamps with a large gap between 60000 and 600000.
  const double history[] = {
      0.0,  10.0, 12.0,     9.0,  11.0,     1.0,  60000.0, 11.0,
      13.0, 10.0, 12.0,     1.0,  600000.0, 20.0, 22.0,    19.0,
      21.0, 1.0,  660000.0, 21.0, 23.0,     20.0, 22.0,    1.0,
  };
  assert(engine.SetHistory(history, 24) == UpdateStatus::kApplied);

  // Zoom deep into the gap: the window ends up between two candles.
  assert(engine.Zoom(20.0, 400.0f));
  const auto snapshot = engine.Snapshot();
  assert(snapshot->visible_x_min > 60000.0);
  assert(snapshot->visible_x_max < 600000.0);
  assert(!snapshot->has_visible_candles);
  // Honest empty range: last < first, pointing at the insertion position.
  assert(snapshot->first_visible_index == 2);
  assert(snapshot->last_visible_index + 1 == snapshot->first_visible_index);
  // Autoscale anchors to the candles adjacent to the gap instead of the
  // whole store.
  assert(snapshot->visible_y_min < 9.5);
  assert(snapshot->visible_y_max > 21.0);
  // Neighboring candles project outside the plot, so extrema stay hidden.
  assert(!snapshot->visible_maximum.visible);
  assert(!snapshot->visible_minimum.visible);
  // No candle quads are tessellated for the main series: content contains
  // only the grid and the dashed current-price line.
  const size_t content_quads = ContentOf(*snapshot).size() / (size_t{6} * 6);
  const size_t grid_quads = snapshot->x_ticks.size() + snapshot->y_ticks.size();
  const size_t dash_quads = content_quads - grid_quads;
  const size_t expected_dashes =
      static_cast<size_t>(std::ceil(snapshot->plot.Width() / 6.0f));
  assert(dash_quads == expected_dashes);

  // Panning back to data restores a normal visible range.
  assert(engine.Pan(-8000.0f));
  const auto restored = engine.Snapshot();
  assert(restored->has_visible_candles);
  assert(restored->first_visible_index <= restored->last_visible_index);
}

void TestTimeModeAdditionalSeriesRendersInsideMainGap() {
  ChartEngine engine;
  engine.SetSize(800.0f, 500.0f);
  const double history[] = {
      0.0,  10.0, 12.0,     9.0,  11.0,     1.0,  60000.0, 11.0,
      13.0, 10.0, 12.0,     1.0,  600000.0, 20.0, 22.0,    19.0,
      21.0, 1.0,  660000.0, 21.0, 23.0,     20.0, 22.0,    1.0,
  };
  assert(engine.SetHistory(history, 24) == UpdateStatus::kApplied);
  assert(engine.Zoom(20.0, 400.0f));
  const auto gap = engine.Snapshot();
  assert(!gap->has_visible_candles);

  SeriesConfig histogram;
  histogram.series_id = "gap-data";
  histogram.type = SeriesType::kHistogram;
  histogram.pane_id = "main";
  histogram.price_scale_id = "main";
  assert(engine.AddSeries(histogram) == UpdateStatus::kApplied);
  const double point[] = {
      (gap->visible_x_min + gap->visible_x_max) * 0.5,
      500.0,
  };
  assert(engine.SetSeriesData("gap-data", point, 2, true) ==
         UpdateStatus::kApplied);

  const auto snapshot = engine.Snapshot();
  assert(!snapshot->has_visible_candles);
  assert(snapshot->visible_y_max > 500.0);
}

void TestLogicalSpacingAdditionalSeriesAlignment() {
  ChartEngine engine;
  ChartConfig config;
  config.logical_spacing = true;
  config.initial_visible_count = 5;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(600.0f, 360.0f);

  PaneConfig main;
  main.height_weight = 2.0;
  PaneConfig volume;
  volume.pane_id = "volume";
  volume.price_scale_id = "volume";
  volume.height_weight = 1.0;
  volume.volume_format = true;
  engine.SetPanes({main, volume}, false);

  SeriesConfig derived;
  derived.series_id = "volume";
  derived.type = SeriesType::kHistogram;
  derived.source = SeriesSource::kOhlcvVolume;
  derived.pane_id = "volume";
  derived.price_scale_id = "volume";
  assert(engine.AddSeries(derived) == UpdateStatus::kApplied);

  SeriesConfig overlay;
  overlay.series_id = "overlay";
  overlay.pane_id = "main";
  overlay.price_scale_id = "main";
  assert(engine.AddSeries(overlay) == UpdateStatus::kApplied);

  const double history[] = {
      0.0,  10.0, 13.0,     10.0, 12.0,     10.0, 60000.0, 11.0, 13.0,     10.0,
      12.0, 20.0, 120000.0, 10.0, 13.0,     10.0, 12.0,    30.0, 180000.0, 11.0,
      13.0, 10.0, 12.0,     40.0, 240000.0, 10.0, 13.0,    10.0, 12.0,     50.0,
  };
  assert(engine.SetHistory(history, 30) == UpdateStatus::kApplied);

  // The 90000 candle is not aligned to a main candle: in logical mode it has
  // no x position and must be excluded from both geometry and autoscale.
  const double overlay_candles[] = {
      0.0,  10.5, 12.5,     10.5, 12.0,    1.0,  60000.0, 10.5,
      12.5, 10.5, 12.0,     1.0,  90000.0, 1.0,  100.0,   1.0,
      90.0, 1.0,  120000.0, 10.5, 12.5,    10.5, 12.0,    1.0,
  };
  assert(engine.SetSeriesData("overlay", overlay_candles, 24, false) ==
         UpdateStatus::kApplied);

  const auto snapshot = engine.Snapshot();
  assert(snapshot->has_visible_candles);
  assert(snapshot->visible_y_min > 9.0);
  assert(snapshot->visible_y_max < 50.0);
  // Derived volume covers exactly the visible main candles.
  assert(snapshot->panes[1].visible_y_max >= 50.0);
}

void TestSetConfigWithEquivalentValuesKeepsViewport() {
  ChartEngine engine;
  ChartConfig config = FixedResolution(60000);
  config.initial_visible_count = 10;
  engine.SetConfig(config);
  engine.SetSize(800.0f, 500.0f);
  std::vector<double> history;
  for (int i = 0; i < 20; ++i) {
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
  assert(engine.Zoom(2.0, 400.0f));
  const auto zoomed = engine.Snapshot();

  // Reapplying equivalent resolution values must not reset the viewport.
  ChartConfig equivalent = config;
  equivalent.initial_visible_count = 10;
  engine.SetConfig(equivalent);
  const auto kept = engine.Snapshot();
  ExpectNear(kept->visible_x_min, zoomed->visible_x_min);
  ExpectNear(kept->visible_x_max, zoomed->visible_x_max);

  // A real resolution change still resets the viewport.
  ChartConfig changed = config;
  changed.resolution.fixed_duration_ms = 300000;
  engine.SetConfig(changed);
  const auto reset = engine.Snapshot();
  assert(reset->visible_x_min != zoomed->visible_x_min ||
         reset->visible_x_max != zoomed->visible_x_max);
}

void TestPaneLayoutEdgeCasesMatchHitTesting() {
  ChartEngine engine;
  engine.SetSize(400.0f, 200.0f);
  PaneConfig main;
  main.min_height = 150.0f;
  PaneConfig second;
  second.pane_id = "volume";
  second.price_scale_id = "volume";
  second.min_height = 150.0f;
  engine.SetPanes({main, second}, true);

  const double history[] = {0.0, 10.0, 12.0, 9.0, 11.0, 1.0};
  assert(engine.SetHistory(history, 6) == UpdateStatus::kApplied);
  const auto snapshot = engine.Snapshot();
  assert(snapshot->panes.size() == 2);
  // Min heights exceed the available space: the first pane wins the remaining
  // room and the last pane is clamped to the plot bottom.
  ExpectNear(snapshot->panes[0].plot.top, 8.0);
  ExpectNear(snapshot->panes[0].plot.Height(), 150.0);
  ExpectNear(snapshot->panes[1].plot.bottom, 200.0f - 26.0f);
  // Hit-testing sees the same geometry the renderer produced.
  const float boundary = snapshot->panes[0].plot.bottom;
  const auto separator = engine.SeparatorAt(boundary, 3.0f);
  assert(separator.has_value() && *separator == 0);
  assert(!engine.SeparatorAt(snapshot->panes[0].plot.top + 20.0f, 3.0f)
              .has_value());
}

void TestPriceLinesAndYAxisValueMapping() {
  ChartEngine engine;
  ChartConfig config;
  config.show_current_price = false;
  engine.SetConfig(config);
  engine.SetSize(600.0f, 320.0f);
  const double history[] = {
      0.0, 10.0, 14.0, 8.0, 12.0, 1.0, 60'000.0, 12.0, 18.0, 11.0, 16.0, 1.0,
  };
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  const auto baseline = engine.Snapshot();
  const double minimum = baseline->visible_y_min;
  const double maximum = baseline->visible_y_max;
  const double middle = (minimum + maximum) * 0.5;

  PriceLine first{"minimum",
                  minimum,
                  "Minimum",
                  "#00AAFF",
                  {0.0f, 2.0f / 3.0f, 1.0f, 1.0f}};
  PriceLine second{
      "middle", middle, "Middle", "#FF9900", {1.0f, 0.6f, 0.0f, 1.0f}};
  PriceLine hidden{
      "hidden", maximum + 1.0, "Hidden", "#FFFFFF", {1.0f, 1.0f, 1.0f, 1.0f}};
  assert(engine.SetPriceLine(first));
  assert(engine.SetPriceLine(second));
  assert(engine.SetPriceLine(hidden));
  const uint64_t revision = engine.Revision();
  assert(!engine.SetPriceLine(second));
  assert(engine.Revision() == revision);

  const auto snapshot = engine.Snapshot();
  ExpectNear(snapshot->visible_y_min, minimum);
  ExpectNear(snapshot->visible_y_max, maximum);
  assert(snapshot->price_lines.size() == 2);
  assert(snapshot->price_lines[0].id == "minimum");
  assert(snapshot->price_lines[1].id == "middle");
  ExpectNear(snapshot->price_lines[0].y, snapshot->plot.bottom, 1e-4);
  ExpectNear(snapshot->price_lines[1].y,
             (snapshot->plot.top + snapshot->plot.bottom) * 0.5, 1e-4);
  assert(engine.PriceLines().size() == 3);
  assert(engine.PriceLineAt(1).id == "middle");

  const auto top = engine.YAxisValueAt(snapshot->plot.top);
  const auto center =
      engine.YAxisValueAt((snapshot->plot.top + snapshot->plot.bottom) * 0.5f);
  const auto bottom = engine.YAxisValueAt(snapshot->plot.bottom);
  assert(top.has_value() && center.has_value() && bottom.has_value());
  ExpectNear(top->price, maximum);
  ExpectNear(center->price, middle);
  ExpectNear(bottom->price, minimum);
  assert(!engine.YAxisValueAt(snapshot->plot.bottom + 1.0f).has_value());

  PaneConfig main_pane;
  PaneConfig volume_pane;
  volume_pane.pane_id = "volume";
  volume_pane.price_scale_id = "volume";
  engine.SetPanes({main_pane, volume_pane}, true);
  SeriesConfig volume_series;
  volume_series.series_id = "volume";
  volume_series.type = SeriesType::kHistogram;
  volume_series.source = SeriesSource::kOhlcvVolume;
  volume_series.source_series_id = "main";
  volume_series.pane_id = "volume";
  volume_series.price_scale_id = "volume";
  assert(engine.AddSeries(volume_series) == UpdateStatus::kApplied);
  const auto multi_pane = engine.Snapshot();
  assert(multi_pane->panes.size() == 2);
  for (size_t index = 0; index < multi_pane->panes.size(); ++index) {
    const PaneSnapshot& pane = multi_pane->panes[index];
    const auto pane_top = engine.YAxisValueAt(pane.plot.top);
    const auto pane_middle =
        engine.YAxisValueAt((pane.plot.top + pane.plot.bottom) * 0.5f);
    const auto pane_bottom = engine.YAxisValueAt(pane.plot.bottom);
    assert(pane_top.has_value() && pane_middle.has_value() &&
           pane_bottom.has_value());
    assert(pane_top->pane_id == pane.pane_id);
    assert(pane_top->price_scale_id == pane.price_scale_id);
    assert(pane_top->pane_index == index);
    ExpectNear(pane_top->price, pane.visible_y_max);
    ExpectNear(pane_middle->price,
               (pane.visible_y_min + pane.visible_y_max) * 0.5);
    ExpectNear(pane_bottom->price, pane.visible_y_min);
  }
  const float separator_middle =
      (multi_pane->panes[0].plot.bottom + multi_pane->panes[1].plot.top) * 0.5f;
  assert(!engine.YAxisValueAt(separator_middle).has_value());

  volume_pane.scale_visible = false;
  engine.SetPanes({main_pane, volume_pane}, true);
  const auto hidden_scale = engine.Snapshot();
  const auto& hidden_plot = hidden_scale->panes[1].plot;
  assert(!engine.YAxisValueAt((hidden_plot.top + hidden_plot.bottom) * 0.5f)
              .has_value());

  assert(engine.RemovePriceLine("middle"));
  assert(!engine.RemovePriceLine("missing"));
  assert(engine.ClearPriceLines());
  assert(!engine.ClearPriceLines());
  assert(engine.PriceLineCount() == 0);

  assert(engine.SetPriceLine(first));
  engine.Clear();
  assert(engine.PriceLineCount() == 1);
  assert(engine.Snapshot()->price_lines.empty());

  config.show_y_axis = false;
  engine.SetConfig(config);
  assert(!engine.YAxisValueAt(100.0f).has_value());
}

}  // namespace

void RunPanesTests() {
  TestSnapshotAndAutoscale();
  TestDisplayScaleKeepsAxisDensityStable();
  TestOneTickRangeUsesScaleMargins();
  TestFlatRangeUsesMinMove();
  TestCustomScaleMargins();
  TestScaleMarginContentFractionBoundary();
  TestPaneInvariantWithEmptyConfiguration();
  TestVisiblePriceExtremes();
  TestAutoscaleSupportsDifferentMagnitudesAndNegativeValues();
  TestYAxisScalePersistsAcrossHorizontalPanAndResets();
  TestYAxisScaleHasIndependentOptionAndDefault();
  TestCurrentPriceRemainsVisibleOutsideHorizontalViewport();
  TestCurrentPricePinsToVerticalViewportEdges();
  TestDefaultScaleControlsResetViewport();
  TestViewportStopsFollowingAfterPan();
  TestViewportFollowsNewCandleAtLiveEdge();
  TestViewportFollowsNewTradeBucketAtLiveEdge();
  TestViewportResumesFollowingAfterReturningToLiveEdge();
  TestPanReportsViewportMovementAndBounds();
  TestGestureZoomReportsAbsoluteScaleAndClamps();
  TestProgrammaticZoomUsesRightEdgeAndClampsToHistory();
  TestFitContentShowsHistoryAndResetsYScale();
  TestViewportCommandsHandleEmptyHistory();
  TestScrollToRealTimePreservesScaleAndTracksLiveEdge();
  TestMultiPaneSeriesAndDerivedVolume();
  TestScaleYResultIdentifiesChangedPane();
  TestScaleYResultDistinguishesOverlayAndNoChange();
  TestPaneSeparatorUsesStrongerGridAlpha();
  TestVolumePaneTickMinimumDependsOnHeight();
  TestCustomHistogramAndRuntimePaneWeights();
  TestResizeOnlyChangesAdjacentPanes();
  TestViewportInDataGapReportsEmptyRange();
  TestTimeModeAdditionalSeriesRendersInsideMainGap();
  TestLogicalSpacingAdditionalSeriesAlignment();
  TestSetConfigWithEquivalentValuesKeepsViewport();
  TestPaneLayoutEdgeCasesMatchHitTesting();
  TestPriceLinesAndYAxisValueMapping();
}

}  // namespace trading_charts::test
