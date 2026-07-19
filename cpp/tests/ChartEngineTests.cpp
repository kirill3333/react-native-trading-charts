#include "../ChartEngine.h"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

using tradingcharts::ChartConfig;
using tradingcharts::ChartEngine;
using tradingcharts::Candle;
using tradingcharts::UpdateStatus;

namespace {

void expectNear(double actual, double expected, double tolerance = 1e-9) {
  if (!(std::abs(actual - expected) < tolerance)) {
    std::cerr << "Expected " << actual << " to be within " << tolerance
              << " of " << expected << '\n';
    assert(false);
  }
}

float renderedCandleBodyWidth(const tradingcharts::RenderSnapshot& snapshot,
                              size_t candleOffset) {
  constexpr size_t kFloatsPerVertex = 6;
  constexpr size_t kVerticesPerQuad = 6;
  constexpr size_t kFloatsPerQuad = kFloatsPerVertex * kVerticesPerQuad;
  constexpr size_t kQuadsPerCandle = 2;
  const size_t gridQuadCount = snapshot.xTicks.size() + snapshot.yTicks.size();
  const size_t bodyQuad =
      gridQuadCount + candleOffset * kQuadsPerCandle + 1;
  const size_t offset = bodyQuad * kFloatsPerQuad;
  assert(offset + kFloatsPerQuad <= snapshot.vertices.size());

  float minimumX = snapshot.vertices[offset];
  float maximumX = minimumX;
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const float x = snapshot.vertices[offset + vertex * kFloatsPerVertex];
    minimumX = std::min(minimumX, x);
    maximumX = std::max(maximumX, x);
  }
  return maximumX - minimumX;
}

float renderedCandleBodyCenter(const tradingcharts::RenderSnapshot& snapshot,
                               size_t candleOffset) {
  constexpr size_t kFloatsPerVertex = 6;
  constexpr size_t kVerticesPerQuad = 6;
  constexpr size_t kFloatsPerQuad = kFloatsPerVertex * kVerticesPerQuad;
  constexpr size_t kQuadsPerCandle = 2;
  const size_t gridQuadCount = snapshot.xTicks.size() + snapshot.yTicks.size();
  const size_t bodyQuad =
      gridQuadCount + candleOffset * kQuadsPerCandle + 1;
  const size_t offset = bodyQuad * kFloatsPerQuad;
  assert(offset + kFloatsPerQuad <= snapshot.vertices.size());

  float minimumX = snapshot.vertices[offset];
  float maximumX = minimumX;
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const float x = snapshot.vertices[offset + vertex * kFloatsPerVertex];
    minimumX = std::min(minimumX, x);
    maximumX = std::max(maximumX, x);
  }
  return (minimumX + maximumX) * 0.5f;
}

void testTradeAggregation() {
  ChartEngine engine;
  ChartConfig config;
  config.timeframeMs = 60000.0;
  engine.setConfig(config);

  const double first[] = {1000.0, 10.0, 2.0};
  const double second[] = {2000.0, 12.0, 3.0};
  const double third[] = {3000.0, 9.0, 1.0};
  assert(engine.updateTrade(first, 3) == UpdateStatus::Applied);
  assert(engine.updateTrade(second, 3) == UpdateStatus::Applied);
  assert(engine.updateTrade(third, 3) == UpdateStatus::Applied);
  assert(engine.candleCount() == 1);
  const auto candle = engine.candleAt(0);
  expectNear(candle.timestamp, 0.0);
  expectNear(candle.open, 10.0);
  expectNear(candle.high, 12.0);
  expectNear(candle.low, 9.0);
  expectNear(candle.close, 9.0);
  expectNear(candle.volume, 6.0);
}

void testBucketTransitionAndNoGaps() {
  ChartEngine engine;
  const double trades[] = {
      1000.0, 10.0, 1.0,
      180000.0, 15.0, 2.0,
  };
  assert(engine.updateTrades(trades, 6) == UpdateStatus::Applied);
  assert(engine.candleCount() == 2);
  expectNear(engine.candleAt(1).timestamp, 180000.0);
}

void testHistoryContinuation() {
  ChartEngine engine;
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 4.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 5.0,
  };
  assert(engine.setHistory(history, 12) == UpdateStatus::Applied);
  const double trade[] = {61000.0, 14.0, 2.0};
  assert(engine.updateTrade(trade, 3) == UpdateStatus::Applied);
  assert(engine.candleCount() == 2);
  const auto candle = engine.candleAt(1);
  expectNear(candle.open, 11.0);
  expectNear(candle.high, 14.0);
  expectNear(candle.close, 14.0);
  expectNear(candle.volume, 7.0);
}

void testPrependHistoryPreservesViewport() {
  for (bool logicalSpacing : {false, true}) {
    ChartEngine engine;
    ChartConfig config;
    config.initialVisibleCount = 2;
    config.logicalSpacing = logicalSpacing;
    engine.setConfig(config);
    engine.setSize(800.0f, 500.0f);
    const double history[] = {
        120000.0, 10.0, 12.0, 9.0, 11.0, 1.0,
        180000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
        240000.0, 12.0, 14.0, 11.0, 13.0, 1.0,
    };
    const double older[] = {
        0.0, 8.0, 10.0, 7.0, 9.0, 1.0,
        60000.0, 9.0, 11.0, 8.0, 10.0, 1.0,
    };
    assert(engine.setHistory(history, 18) == UpdateStatus::Applied);
    const auto before = engine.snapshot();
    assert(before->hasVisibleCandles);
    assert(before->totalCandleCount == 3);

    assert(engine.prependHistory(older, 12) == UpdateStatus::Applied);
    const auto after = engine.snapshot();
    assert(engine.candleCount() == 5);
    assert(after->hasVisibleCandles);
    assert(after->totalCandleCount == 5);
    assert(after->firstVisibleIndex == before->firstVisibleIndex + 2);
    assert(after->lastVisibleIndex == before->lastVisibleIndex + 2);
    expectNear(after->visibleXMin, before->visibleXMin);
    expectNear(after->visibleXMax, before->visibleXMax);
  }
}

void testPrependHistoryRejectsOverlap() {
  ChartEngine engine;
  const double history[] = {60000.0, 10.0, 12.0, 9.0, 11.0, 1.0};
  const double overlap[] = {60000.0, 9.0, 11.0, 8.0, 10.0, 1.0};
  assert(engine.setHistory(history, 6) == UpdateStatus::Applied);
  assert(engine.prependHistory(overlap, 6) == UpdateStatus::InvalidInput);
  assert(engine.candleCount() == 1);
}

void testOldTradeIgnored() {
  ChartEngine engine;
  const double current[] = {70000.0, 10.0, 1.0};
  const double old[] = {60000.0, 20.0, 1.0};
  assert(engine.updateTrade(current, 3) == UpdateStatus::Applied);
  assert(engine.updateTrade(old, 3) == UpdateStatus::IgnoredOldTimestamp);
  expectNear(engine.candleAt(0).close, 10.0);
}

void testRejectsUnalignedHistory() {
  ChartEngine engine;
  const double history[] = {1.0, 10.0, 12.0, 9.0, 11.0, 4.0};
  assert(engine.setHistory(history, 6) == UpdateStatus::InvalidInput);
  assert(engine.candleCount() == 0);
}

void testSnapshotAndAutoscale() {
  ChartEngine engine;
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 4.0,
      60000.0, 11.0, 20.0, 10.0, 12.0, 5.0,
  };
  assert(engine.setHistory(history, 12) == UpdateStatus::Applied);
  const auto snapshot = engine.snapshot();
  assert(snapshot->visibleYMin < 9.0);
  assert(snapshot->visibleYMax > 20.0);
  assert(!snapshot->vertices.empty());
  assert(!snapshot->xTicks.empty());
  assert(!snapshot->yTicks.empty());
}

void testDisplayScaleKeepsAxisDensityStable() {
  ChartConfig logicalConfig;
  logicalConfig.initialVisibleCount = 48;

  ChartConfig denseConfig = logicalConfig;
  denseConfig.displayScale = 3.0f;
  denseConfig.xAxisHeight *= denseConfig.displayScale;
  denseConfig.yAxisWidth *= denseConfig.displayScale;

  ChartEngine logical;
  logical.setConfig(logicalConfig);
  logical.setSize(400.0f, 800.0f);

  ChartEngine dense;
  dense.setConfig(denseConfig);
  dense.setSize(1200.0f, 2400.0f);

  std::vector<double> history;
  history.reserve(60 * 6);
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

  assert(logical.setHistory(history.data(), history.size()) == UpdateStatus::Applied);
  assert(dense.setHistory(history.data(), history.size()) == UpdateStatus::Applied);

  const auto logicalSnapshot = logical.snapshot();
  const auto denseSnapshot = dense.snapshot();
  assert(logicalSnapshot->xTicks.size() == denseSnapshot->xTicks.size());
  assert(logicalSnapshot->yTicks.size() == denseSnapshot->yTicks.size());
  for (size_t i = 0; i < logicalSnapshot->xTicks.size(); ++i) {
    expectNear(logicalSnapshot->xTicks[i].value, denseSnapshot->xTicks[i].value);
  }
  for (size_t i = 0; i < logicalSnapshot->yTicks.size(); ++i) {
    expectNear(logicalSnapshot->yTicks[i].value, denseSnapshot->yTicks[i].value);
  }
}

void testOneTickRangeUsesScaleMargins() {
  ChartEngine engine;
  ChartConfig config;
  config.minMove = 0.0001;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 1.0004, 1.0005, 1.0004, 1.0004, 1.0,
      60000.0, 1.0004, 1.0005, 1.0004, 1.0004, 1.0,
  };
  assert(engine.setHistory(history, 12) == UpdateStatus::Applied);

  const auto snapshot = engine.snapshot();
  const double innerScale = 0.7;
  expectNear(snapshot->visibleYMin, 1.0004 - 0.0001 * 0.1 / innerScale);
  expectNear(snapshot->visibleYMax, 1.0005 + 0.0001 * 0.2 / innerScale);

  const double plotHeight = snapshot->plot.height();
  const double expectedLowY = snapshot->plot.bottom - plotHeight * 0.1;
  expectNear(snapshot->currentPriceY, expectedLowY, 1e-3);
  assert(snapshot->currentPriceY > snapshot->plot.top);
  assert(snapshot->currentPriceY < snapshot->plot.bottom);
}

void testFlatRangeUsesMinMove() {
  ChartEngine engine;
  ChartConfig config;
  config.minMove = 0.01;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);
  const double history[] = {0.0, 65.0, 65.0, 65.0, 65.0, 1.0};
  assert(engine.setHistory(history, 6) == UpdateStatus::Applied);

  const auto snapshot = engine.snapshot();
  const double rawMin = 65.0 - 5.0 * config.minMove;
  const double rawMax = 65.0 + 5.0 * config.minMove;
  const double rawRange = rawMax - rawMin;
  expectNear(snapshot->visibleYMin, rawMin - rawRange * 0.1 / 0.7);
  expectNear(snapshot->visibleYMax, rawMax + rawRange * 0.2 / 0.7);
  assert(!snapshot->yTicks.empty());
}

void testCustomScaleMargins() {
  ChartEngine engine;
  ChartConfig config;
  config.yScaleMarginTop = 0.25;
  config.yScaleMarginBottom = 0.15;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);
  const double history[] = {0.0, 10.0, 20.0, 10.0, 15.0, 1.0};
  assert(engine.setHistory(history, 6) == UpdateStatus::Applied);

  const auto snapshot = engine.snapshot();
  expectNear(snapshot->visibleYMin, 10.0 - 10.0 * 0.15 / 0.6);
  expectNear(snapshot->visibleYMax, 20.0 + 10.0 * 0.25 / 0.6);
}

void testVisiblePriceExtremes() {
  const double history[] = {
      0.0, 10.0, 100.0, 9.0, 10.0, 1.0,
      60000.0, 11.0, 20.0, 8.0, 12.0, 1.0,
      120000.0, 12.0, 30.0, 7.0, 13.0, 1.0,
      180000.0, 40.0, 44.0, 39.0, 43.0, 1.0,
      240000.0, 42.0, 48.0, 4.0, 45.0, 1.0,
      300000.0, 44.0, 48.0, 43.0, 47.0, 1.0,
  };

  for (bool logicalSpacing : {false, true}) {
    ChartEngine engine;
    ChartConfig config;
    config.initialVisibleCount = 3;
    config.logicalSpacing = logicalSpacing;
    engine.setConfig(config);
    engine.setSize(800.0f, 500.0f);
    assert(engine.setHistory(history, 36) == UpdateStatus::Applied);

    const auto initial = engine.snapshot();
    assert(initial->visibleMaximum.visible);
    assert(initial->visibleMinimum.visible);
    expectNear(initial->visibleMaximum.value, 48.0);
    expectNear(initial->visibleMinimum.value, 4.0);
    expectNear(initial->visibleMaximum.x, initial->visibleMinimum.x, 1e-5);
    expectNear(
        initial->visibleMaximum.y,
        initial->plot.bottom -
            (48.0 - initial->visibleYMin) /
                (initial->visibleYMax - initial->visibleYMin) *
                initial->plot.height(),
        1e-5);
    assert(initial->visibleMaximum.labelOnRight ==
           (initial->visibleMaximum.x <=
            (initial->plot.left + initial->plot.right) * 0.5f));

    assert(engine.pan(10000.0f));
    const auto historical = engine.snapshot();
    expectNear(historical->visibleMaximum.value, 100.0);
    expectNear(historical->visibleMinimum.value, 4.0);
    assert(!historical->visibleMinimum.labelOnRight);

    engine.scaleY(-historical->plot.height() * 100.0f);
    const auto verticallyClipped = engine.snapshot();
    assert(!verticallyClipped->visibleMaximum.visible);
    assert(!verticallyClipped->visibleMinimum.visible);
  }

  ChartEngine flat;
  flat.setSize(800.0f, 500.0f);
  const double flatHistory[] = {0.0, 65.0, 65.0, 65.0, 65.0, 1.0};
  assert(flat.setHistory(flatHistory, 6) == UpdateStatus::Applied);
  const auto flatSnapshot = flat.snapshot();
  assert(flatSnapshot->visibleMaximum.visible);
  assert(!flatSnapshot->visibleMinimum.visible);
  expectNear(flatSnapshot->visibleMaximum.value, 65.0);

  ChartEngine hidden;
  ChartConfig hiddenConfig;
  hiddenConfig.showPriceExtremes = false;
  hidden.setConfig(hiddenConfig);
  hidden.setSize(800.0f, 500.0f);
  assert(hidden.setHistory(history, 36) == UpdateStatus::Applied);
  const auto hiddenSnapshot = hidden.snapshot();
  assert(!hiddenSnapshot->visibleMaximum.visible);
  assert(!hiddenSnapshot->visibleMinimum.visible);

  ChartEngine empty;
  const auto emptySnapshot = empty.snapshot();
  assert(!emptySnapshot->visibleMaximum.visible);
  assert(!emptySnapshot->visibleMinimum.visible);
}

void testAutoscaleSupportsDifferentMagnitudesAndNegativeValues() {
  const std::vector<std::vector<double>> histories = {
      {0.0, 0.000000002, 0.000000003, 0.000000001, 0.000000002, 1.0},
      {0.0, 1000000000000.0, 1000000000500.0, 999999999500.0,
       1000000000250.0, 1.0},
      {0.0, -10.0, -8.0, -12.0, -9.0, 1.0},
  };

  for (const auto& history : histories) {
    ChartEngine engine;
    engine.setSize(800.0f, 500.0f);
    assert(engine.setHistory(history.data(), history.size()) == UpdateStatus::Applied);
    const auto snapshot = engine.snapshot();
    assert(std::isfinite(snapshot->visibleYMin));
    assert(std::isfinite(snapshot->visibleYMax));
    assert(snapshot->visibleYMax > snapshot->visibleYMin);
    assert(snapshot->currentPriceY > snapshot->plot.top);
    assert(snapshot->currentPriceY < snapshot->plot.bottom);
  }
}

void testCrosshairUsesAutoscaleInverse() {
  ChartEngine engine;
  engine.setSize(800.0f, 500.0f);
  const double history[] = {0.0, 1.0004, 1.0005, 1.0004, 1.00045, 1.0};
  assert(engine.setHistory(history, 6) == UpdateStatus::Applied);
  const auto initial = engine.snapshot();

  engine.setCrosshair(true, 400.0f, initial->currentPriceY);
  const auto snapshot = engine.snapshot();
  expectNear(snapshot->crosshairPrice, 1.00045);
}

void testYAxisScaleDirectionLimitsAndCrosshair() {
  ChartEngine engine;
  engine.setSize(800.0f, 500.0f);
  const double history[] = {0.0, 10.0, 20.0, 10.0, 15.0, 1.0};
  assert(engine.setHistory(history, 6) == UpdateStatus::Applied);

  const auto initial = engine.snapshot();
  const double initialSpan = initial->visibleYMax - initial->visibleYMin;
  const double initialCenter = (initial->visibleYMax + initial->visibleYMin) * 0.5;
  const float halfScaleDrag = static_cast<float>(-initial->plot.height() * std::log(2.0));
  engine.scaleY(halfScaleDrag);

  const auto zoomed = engine.snapshot();
  expectNear(zoomed->visibleYMax - zoomed->visibleYMin, initialSpan * 0.5, 1e-6);
  expectNear((zoomed->visibleYMax + zoomed->visibleYMin) * 0.5, initialCenter, 1e-9);

  const double targetPrice = initialCenter;
  const float targetY = zoomed->plot.bottom - static_cast<float>(
      (targetPrice - zoomed->visibleYMin) /
      (zoomed->visibleYMax - zoomed->visibleYMin)) * zoomed->plot.height();
  engine.setCrosshair(true, 400.0f, targetY);
  expectNear(engine.snapshot()->crosshairPrice, targetPrice, 1e-6);
  engine.scaleY(0.0f);
  assert(!engine.snapshot()->crosshairVisible);

  engine.resetViewport();
  engine.scaleY(-initial->plot.height() * 100.0f);
  const auto minimum = engine.snapshot();
  expectNear(minimum->visibleYMax - minimum->visibleYMin, initialSpan * 0.1, 1e-6);

  engine.resetViewport();
  engine.scaleY(initial->plot.height() * 100.0f);
  const auto maximum = engine.snapshot();
  expectNear(maximum->visibleYMax - maximum->visibleYMin, initialSpan * 10.0, 1e-6);
}

void testYAxisScalePersistsAcrossHorizontalPanAndResets() {
  ChartConfig config;
  config.initialVisibleCount = 3;
  ChartEngine autoscale;
  ChartEngine manualScale;
  autoscale.setConfig(config);
  manualScale.setConfig(config);
  autoscale.setSize(800.0f, 500.0f);
  manualScale.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
      120000.0, 12.0, 14.0, 11.0, 13.0, 1.0,
      180000.0, 40.0, 44.0, 39.0, 43.0, 1.0,
      240000.0, 42.0, 46.0, 41.0, 45.0, 1.0,
      300000.0, 44.0, 48.0, 43.0, 47.0, 1.0,
  };
  assert(autoscale.setHistory(history, 36) == UpdateStatus::Applied);
  assert(manualScale.setHistory(history, 36) == UpdateStatus::Applied);

  const auto initial = manualScale.snapshot();
  manualScale.scaleY(static_cast<float>(-initial->plot.height() * std::log(2.0)));
  autoscale.pan(500.0f);
  manualScale.pan(500.0f);

  const auto automatic = autoscale.snapshot();
  const auto manual = manualScale.snapshot();
  expectNear(
      manual->visibleYMax - manual->visibleYMin,
      (automatic->visibleYMax - automatic->visibleYMin) * 0.5,
      1e-6);
  expectNear(
      (manual->visibleYMax + manual->visibleYMin) * 0.5,
      (automatic->visibleYMax + automatic->visibleYMin) * 0.5,
      1e-9);

  autoscale.resetViewport();
  manualScale.resetViewport();
  expectNear(
      manualScale.snapshot()->visibleYMax - manualScale.snapshot()->visibleYMin,
      autoscale.snapshot()->visibleYMax - autoscale.snapshot()->visibleYMin);

  manualScale.scaleY(-100.0f);
  assert(manualScale.setHistory(history, 36) == UpdateStatus::Applied);
  expectNear(
      manualScale.snapshot()->visibleYMax - manualScale.snapshot()->visibleYMin,
      autoscale.snapshot()->visibleYMax - autoscale.snapshot()->visibleYMin);
}

void testYAxisScaleRespectsZoomOption() {
  ChartEngine engine;
  ChartConfig config;
  config.allowZoom = false;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);
  const double history[] = {0.0, 10.0, 20.0, 10.0, 15.0, 1.0};
  assert(engine.setHistory(history, 6) == UpdateStatus::Applied);

  const auto initial = engine.snapshot();
  engine.scaleY(-initial->plot.height());
  const auto unchanged = engine.snapshot();
  expectNear(unchanged->visibleYMin, initial->visibleYMin);
  expectNear(unchanged->visibleYMax, initial->visibleYMax);
}

void testCurrentPriceRemainsVisibleOutsideHorizontalViewport() {
  ChartEngine engine;
  ChartConfig config;
  config.initialVisibleCount = 3;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 11.0, 9.0, 10.0, 1.0,
      60000.0, 10.0, 11.0, 9.0, 10.0, 1.0,
      120000.0, 10.0, 11.0, 9.0, 10.0, 1.0,
      180000.0, 10.0, 11.0, 9.0, 10.0, 1.0,
      240000.0, 10.0, 11.0, 9.0, 10.0, 1.0,
      300000.0, 10.0, 11.0, 9.0, 10.0, 1.0,
  };
  assert(engine.setHistory(history, 36) == UpdateStatus::Applied);
  engine.pan(500.0f);

  const auto snapshot = engine.snapshot();
  assert(engine.candleAt(engine.candleCount() - 1).timestamp > snapshot->visibleXMax);
  assert(snapshot->currentPriceVisible);
  assert(snapshot->currentPriceY >= snapshot->plot.top);
  assert(snapshot->currentPriceY <= snapshot->plot.bottom);
}

void testCurrentPricePinsToVerticalViewportEdges() {
  const auto snapshotForCurrentPrice = [](double open, double high, double low,
                                          double close, bool pinToEdge,
                                          bool visible = true) {
    ChartEngine engine;
    ChartConfig config;
    config.initialVisibleCount = 3;
    config.showCurrentPrice = visible;
    config.pinCurrentPriceToEdge = pinToEdge;
    engine.setConfig(config);
    engine.setSize(800.0f, 500.0f);
    const double history[] = {
        0.0, 10.0, 11.0, 9.0, 10.0, 1.0,
        60000.0, 10.0, 11.0, 9.0, 10.0, 1.0,
        120000.0, 10.0, 11.0, 9.0, 10.0, 1.0,
        180000.0, 10.0, 11.0, 9.0, 10.0, 1.0,
        240000.0, 10.0, 11.0, 9.0, 10.0, 1.0,
        300000.0, open, high, low, close, 1.0,
    };
    assert(engine.setHistory(history, 36) == UpdateStatus::Applied);
    engine.pan(500.0f);
    return engine.snapshot();
  };

  const auto above = snapshotForCurrentPrice(99.0, 101.0, 98.0, 100.0, true);
  assert(above->currentPriceVisible);
  expectNear(above->currentPrice, 100.0);
  expectNear(above->currentPriceY, above->plot.top);

  const auto below = snapshotForCurrentPrice(1.0, 2.0, 0.0, 1.0, true);
  assert(below->currentPriceVisible);
  expectNear(below->currentPrice, 1.0);
  expectNear(below->currentPriceY, below->plot.bottom);

  const auto inside = snapshotForCurrentPrice(10.0, 11.0, 9.0, 10.0, true);
  assert(inside->currentPriceVisible);
  assert(inside->currentPriceY > inside->plot.top);
  assert(inside->currentPriceY < inside->plot.bottom);

  const auto unpinned = snapshotForCurrentPrice(99.0, 101.0, 98.0, 100.0, false);
  assert(!unpinned->currentPriceVisible);

  const auto hidden = snapshotForCurrentPrice(99.0, 101.0, 98.0, 100.0, true, false);
  assert(!hidden->currentPriceVisible);
  assert(above->vertices.size() == hidden->vertices.size());

  const auto insideHidden =
      snapshotForCurrentPrice(10.0, 11.0, 9.0, 10.0, true, false);
  assert(inside->vertices.size() > insideHidden->vertices.size());
}

void testDefaultScaleControlsResetViewport() {
  ChartEngine baseEngine;
  ChartConfig baseConfig;
  baseConfig.initialVisibleCount = 10;
  baseEngine.setConfig(baseConfig);
  baseEngine.setSize(800.0f, 500.0f);

  ChartEngine scaledEngine;
  ChartConfig scaledConfig = baseConfig;
  scaledConfig.defaultScale = 2.0;
  scaledEngine.setConfig(scaledConfig);
  scaledEngine.setSize(800.0f, 500.0f);

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
  assert(baseEngine.setHistory(history.data(), history.size()) == UpdateStatus::Applied);
  assert(scaledEngine.setHistory(history.data(), history.size()) == UpdateStatus::Applied);

  const auto base = baseEngine.snapshot();
  const auto scaled = scaledEngine.snapshot();
  const double baseSpan = base->visibleXMax - base->visibleXMin;
  const double scaledSpan = scaled->visibleXMax - scaled->visibleXMin;
  expectNear(scaled->visibleXMax, base->visibleXMax);
  expectNear(scaledSpan, baseSpan / 2.0);

  scaledEngine.pan(100.0f);
  scaledEngine.resetViewport();
  const auto reset = scaledEngine.snapshot();
  expectNear(reset->visibleXMax, scaled->visibleXMax);
  expectNear(reset->visibleXMax - reset->visibleXMin, scaledSpan);

  ChartConfig nextConfig = scaledConfig;
  nextConfig.defaultScale = 4.0;
  scaledEngine.setConfig(nextConfig);
  const auto unchanged = scaledEngine.snapshot();
  expectNear(unchanged->visibleXMin, reset->visibleXMin);
  expectNear(unchanged->visibleXMax, reset->visibleXMax);
  scaledEngine.resetViewport();
  const auto nextReset = scaledEngine.snapshot();
  expectNear(nextReset->visibleXMax - nextReset->visibleXMin, baseSpan / 4.0);
}

void testCurrentPriceLineIsOneUnitThick() {
  ChartEngine engine;
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
  };
  assert(engine.setHistory(history, 12) == UpdateStatus::Applied);
  const auto snapshot = engine.snapshot();
  assert(snapshot->currentPriceVisible);
  constexpr size_t kFloatsPerVertex = 6;
  constexpr size_t kVerticesPerQuad = 6;
  constexpr size_t kFloatsPerQuad = kFloatsPerVertex * kVerticesPerQuad;
  assert(snapshot->vertices.size() >= kFloatsPerQuad);
  const size_t offset = snapshot->vertices.size() - kFloatsPerQuad;
  float minimumY = snapshot->vertices[offset + 1];
  float maximumY = minimumY;
  for (size_t vertex = 1; vertex < kVerticesPerQuad; ++vertex) {
    const float y = snapshot->vertices[offset + vertex * kFloatsPerVertex + 1];
    minimumY = std::min(minimumY, y);
    maximumY = std::max(maximumY, y);
  }
  expectNear(maximumY - minimumY, 1.0, 1e-6);
}

void expectSameCandles(const ChartEngine& left, const ChartEngine& right) {
  assert(left.candleCount() == right.candleCount());
  for (size_t i = 0; i < left.candleCount(); ++i) {
    const Candle a = left.candleAt(i);
    const Candle b = right.candleAt(i);
    expectNear(a.timestamp, b.timestamp);
    expectNear(a.open, b.open);
    expectNear(a.high, b.high);
    expectNear(a.low, b.low);
    expectNear(a.close, b.close);
    expectNear(a.volume, b.volume);
  }
}

void testTradeBatchMatchesSingles() {
  const double trades[] = {
      1000.0, 10.0, 1.0,
      2000.0, 12.0, 2.0,
      61000.0, 11.0, 3.0,
      62000.0, 13.0, 4.0,
  };
  ChartEngine singles;
  ChartEngine batch;
  for (size_t i = 0; i < 12; i += 3) {
    assert(singles.updateTrade(trades + i, 3) == UpdateStatus::Applied);
  }
  assert(batch.updateTrades(trades, 12) == UpdateStatus::Applied);
  expectSameCandles(singles, batch);
}

void testReadyCandleFeed() {
  ChartEngine engine;
  const double history[] = {0.0, 10.0, 12.0, 9.0, 11.0, 4.0};
  const double replacement[] = {0.0, 10.0, 14.0, 8.0, 13.0, 8.0};
  const double appended[] = {60000.0, 13.0, 15.0, 12.0, 14.0, 2.0};
  assert(engine.setHistory(history, 6) == UpdateStatus::Applied);
  assert(engine.updateCandle(replacement, 6) == UpdateStatus::Applied);
  assert(engine.candleCount() == 1);
  expectNear(engine.candleAt(0).close, 13.0);
  assert(engine.updateCandle(appended, 6) == UpdateStatus::Applied);
  assert(engine.candleCount() == 2);
}

void testViewportStopsFollowingAfterPan() {
  ChartEngine engine;
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
      120000.0, 12.0, 14.0, 11.0, 13.0, 1.0,
      180000.0, 13.0, 15.0, 12.0, 14.0, 1.0,
  };
  assert(engine.setHistory(history, 24) == UpdateStatus::Applied);
  engine.zoom(2.0, 400.0f);
  engine.pan(250.0f);
  const double before = engine.snapshot()->visibleXMax;
  const double next[] = {240000.0, 14.0, 16.0, 13.0, 15.0, 1.0};
  assert(engine.updateCandle(next, 6) == UpdateStatus::Applied);
  expectNear(engine.snapshot()->visibleXMax, before);
}

void testViewportFollowsNewCandleAtLiveEdge() {
  ChartEngine engine;
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
      120000.0, 12.0, 14.0, 11.0, 13.0, 1.0,
      180000.0, 13.0, 15.0, 12.0, 14.0, 1.0,
  };
  assert(engine.setHistory(history, 24) == UpdateStatus::Applied);
  const double before = engine.snapshot()->visibleXMax;
  const double next[] = {240000.0, 14.0, 16.0, 13.0, 15.0, 1.0};
  assert(engine.updateCandle(next, 6) == UpdateStatus::Applied);
  expectNear(engine.snapshot()->visibleXMax, before + 60000.0);
}

void testViewportFollowsNewTradeBucketAtLiveEdge() {
  ChartEngine engine;
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
  };
  assert(engine.setHistory(history, 12) == UpdateStatus::Applied);
  const double before = engine.snapshot()->visibleXMax;
  const double trade[] = {120500.0, 14.0, 1.0};
  assert(engine.updateTrade(trade, 3) == UpdateStatus::Applied);
  expectNear(engine.snapshot()->visibleXMax, before + 60000.0);
}

void testViewportResumesFollowingAfterReturningToLiveEdge() {
  ChartEngine engine;
  ChartConfig config;
  config.initialVisibleCount = 3;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
      120000.0, 12.0, 14.0, 11.0, 13.0, 1.0,
      180000.0, 13.0, 15.0, 12.0, 14.0, 1.0,
      240000.0, 14.0, 16.0, 13.0, 15.0, 1.0,
      300000.0, 15.0, 17.0, 14.0, 16.0, 1.0,
  };
  assert(engine.setHistory(history, 36) == UpdateStatus::Applied);

  assert(engine.pan(250.0f));
  const double historicalEdge = engine.snapshot()->visibleXMax;
  const double firstNext[] = {360000.0, 16.0, 18.0, 15.0, 17.0, 1.0};
  assert(engine.updateCandle(firstNext, 6) == UpdateStatus::Applied);
  expectNear(engine.snapshot()->visibleXMax, historicalEdge);

  assert(engine.pan(-100000.0f));
  const double liveEdge = engine.snapshot()->visibleXMax;
  const double secondNext[] = {420000.0, 17.0, 19.0, 16.0, 18.0, 1.0};
  assert(engine.updateCandle(secondNext, 6) == UpdateStatus::Applied);
  expectNear(engine.snapshot()->visibleXMax, liveEdge + 60000.0);
}

void testPanReportsViewportMovementAndBounds() {
  ChartEngine engine;
  ChartConfig config;
  config.initialVisibleCount = 3;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
      120000.0, 12.0, 14.0, 11.0, 13.0, 1.0,
      180000.0, 13.0, 15.0, 12.0, 14.0, 1.0,
      240000.0, 14.0, 16.0, 13.0, 15.0, 1.0,
      300000.0, 15.0, 17.0, 14.0, 16.0, 1.0,
  };
  assert(engine.setHistory(history, 36) == UpdateStatus::Applied);

  assert(engine.pan(100.0f));
  assert(engine.pan(100000.0f));
  assert(!engine.pan(100.0f));
}

void testProgrammaticZoomUsesRightEdgeAndClampsToHistory() {
  ChartEngine engine;
  ChartConfig config;
  config.initialVisibleCount = 4;
  config.allowZoom = false;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
      120000.0, 12.0, 14.0, 11.0, 13.0, 1.0,
      180000.0, 13.0, 15.0, 12.0, 14.0, 1.0,
      240000.0, 14.0, 16.0, 13.0, 15.0, 1.0,
      300000.0, 15.0, 17.0, 14.0, 16.0, 1.0,
  };
  assert(engine.setHistory(history, 36) == UpdateStatus::Applied);

  const auto initial = engine.snapshot();
  const double initialSpan = initial->visibleXMax - initial->visibleXMin;
  const double rightEdge = initial->visibleXMax;
  engine.zoomAtRightEdge(2.0);
  const auto zoomedIn = engine.snapshot();
  expectNear(zoomedIn->visibleXMax - zoomedIn->visibleXMin, initialSpan / 2.0);
  expectNear(zoomedIn->visibleXMax, rightEdge);

  engine.zoomAtRightEdge(1e12);
  const auto minimum = engine.snapshot();
  expectNear(minimum->visibleXMax - minimum->visibleXMin, 180000.0);
  expectNear(minimum->visibleXMax, rightEdge);

  engine.resetViewport();
  engine.zoomAtRightEdge(0.5);
  const auto zoomedOut = engine.snapshot();
  expectNear(zoomedOut->visibleXMax - zoomedOut->visibleXMin, 480000.0);
  expectNear(zoomedOut->visibleXMax, rightEdge);

  engine.zoomAtRightEdge(1e-12);
  const auto clamped = engine.snapshot();
  expectNear(clamped->visibleXMin, -30000.0);
  expectNear(clamped->visibleXMax, 450000.0);
}

void testFitContentShowsHistoryAndResetsYScale() {
  ChartEngine engine;
  ChartConfig config;
  config.initialVisibleCount = 2;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
      120000.0, 12.0, 14.0, 11.0, 13.0, 1.0,
      180000.0, 40.0, 44.0, 39.0, 43.0, 1.0,
  };
  assert(engine.setHistory(history, 24) == UpdateStatus::Applied);

  const auto defaultViewport = engine.snapshot();
  engine.fitContent();
  const auto fitted = engine.snapshot();
  expectNear(fitted->visibleXMin, -30000.0);
  expectNear(fitted->visibleXMax, 330000.0);
  const double fittedYMin = fitted->visibleYMin;
  const double fittedYMax = fitted->visibleYMax;

  engine.scaleY(-fitted->plot.height() * 0.5f);
  engine.zoomAtRightEdge(2.0);
  engine.fitContent();
  const auto restored = engine.snapshot();
  expectNear(restored->visibleXMin, fitted->visibleXMin);
  expectNear(restored->visibleXMax, fitted->visibleXMax);
  expectNear(restored->visibleYMin, fittedYMin);
  expectNear(restored->visibleYMax, fittedYMax);

  engine.resetViewport();
  const auto reset = engine.snapshot();
  expectNear(reset->visibleXMin, defaultViewport->visibleXMin);
  expectNear(reset->visibleXMax, defaultViewport->visibleXMax);
}

void testViewportCommandsHandleEmptyHistory() {
  ChartEngine engine;
  engine.setSize(800.0f, 500.0f);
  engine.zoomAtRightEdge(2.0);
  engine.fitContent();
  const auto snapshot = engine.snapshot();
  expectNear(snapshot->visibleXMin, 0.0);
  expectNear(snapshot->visibleXMax, 1.0);
  assert(!snapshot->crosshairVisible);
}

void testCrosshairStatisticsAndLineStyles() {
  ChartEngine engine;
  ChartConfig config;
  config.showXAxis = false;
  config.showYAxis = false;
  config.showCurrentPrice = false;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);

  const double bullish[] = {0.0, 10.0, 15.0, 8.0, 12.0, 5.0};
  assert(engine.setHistory(bullish, 6) == UpdateStatus::Applied);
  const size_t baseVertexFloats = engine.snapshot()->vertices.size();
  engine.setCrosshair(true, 400.0f, 220.0f);
  const auto solid = engine.snapshot();
  expectNear(solid->selectedChange, 2.0);
  expectNear(solid->selectedChangePercent, 20.0);
  expectNear(solid->selectedAmplitudePercent, 70.0);
  assert(solid->selectedPercentagesValid);
  assert(solid->vertices.size() - baseVertexFloats == 2 * 6 * 6);

  engine.setCrosshair(false, 0.0f, 0.0f);
  config.crosshairDashed = true;
  config.displayScale = 2.0f;
  engine.setConfig(config);
  const size_t dashedBaseVertexFloats = engine.snapshot()->vertices.size();
  engine.setCrosshair(true, 400.0f, 220.0f);
  const auto dashed = engine.snapshot();
  assert(dashed->vertices.size() - dashedBaseVertexFloats > 2 * 6 * 6);
  for (size_t offset = dashedBaseVertexFloats; offset < dashed->vertices.size(); offset += 6) {
    assert(dashed->vertices[offset] >= dashed->plot.left - 0.5f);
    assert(dashed->vertices[offset] <= dashed->plot.right + 0.5f);
    assert(dashed->vertices[offset + 1] >= dashed->plot.top - 0.5f);
    assert(dashed->vertices[offset + 1] <= dashed->plot.bottom + 0.5f);
  }

  const double bearish[] = {0.0, 10.0, 11.0, 7.0, 8.0, 5.0};
  assert(engine.setHistory(bearish, 6) == UpdateStatus::Applied);
  engine.setCrosshair(true, 400.0f, 220.0f);
  const auto down = engine.snapshot();
  expectNear(down->selectedChange, -2.0);
  expectNear(down->selectedChangePercent, -20.0);
  expectNear(down->selectedAmplitudePercent, 40.0);
  assert(down->selectedPercentagesValid);

  const double zeroOpen[] = {0.0, 0.0, 2.0, 0.0, 1.0, 5.0};
  assert(engine.setHistory(zeroOpen, 6) == UpdateStatus::Applied);
  engine.setCrosshair(true, 400.0f, 220.0f);
  const auto zero = engine.snapshot();
  expectNear(zero->selectedChange, 1.0);
  assert(!zero->selectedPercentagesValid);
}

void testCrosshairHitTesting() {
  ChartEngine engine;
  engine.setSize(800.0f, 500.0f);
  const double history[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      60000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
  };
  assert(engine.setHistory(history, 12) == UpdateStatus::Applied);
  engine.setCrosshair(true, 400.0f, 220.0f);
  const auto snapshot = engine.snapshot();
  assert(snapshot->crosshairVisible);
  assert(snapshot->crosshairX >= snapshot->plot.left);
  assert(snapshot->crosshairX <= snapshot->plot.right);
  assert(snapshot->crosshairPrice >= snapshot->visibleYMin);
  assert(snapshot->crosshairPrice <= snapshot->visibleYMax);
}

void testHybridHistoryUsesLocalCandleWidths() {
  ChartEngine engine;
  ChartConfig config;
  config.timeframeMs = 1000.0;
  config.initialVisibleCount = 5;
  config.showCurrentPrice = false;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);

  const double candles[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      300000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
      600000.0, 12.0, 14.0, 11.0, 13.0, 1.0,
      601000.0, 13.0, 15.0, 12.0, 14.0, 1.0,
      602000.0, 14.0, 16.0, 13.0, 15.0, 1.0,
  };
  assert(engine.setHistory(candles, 30) == UpdateStatus::Applied);

  const auto snapshot = engine.snapshot();
  const float historicalWidth = renderedCandleBodyWidth(*snapshot, 1);
  const float liveWidth = renderedCandleBodyWidth(*snapshot, 3);
  assert(historicalWidth >= 10.0f);
  assert(liveWidth <= 2.0f);
  assert(historicalWidth > liveWidth * 5.0f);
}

void testLogicalSpacingUsesUniformCandleSlots() {
  ChartEngine engine;
  ChartConfig config;
  config.timeframeMs = 1000.0;
  config.initialVisibleCount = 5;
  config.logicalSpacing = true;
  config.showCurrentPrice = false;
  engine.setConfig(config);
  engine.setSize(800.0f, 500.0f);

  const double candles[] = {
      0.0, 10.0, 12.0, 9.0, 11.0, 1.0,
      300000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
      600000.0, 12.0, 14.0, 11.0, 13.0, 1.0,
      601000.0, 13.0, 15.0, 12.0, 14.0, 1.0,
      602000.0, 14.0, 16.0, 13.0, 15.0, 1.0,
  };
  assert(engine.setHistory(candles, 30) == UpdateStatus::Applied);

  const auto snapshot = engine.snapshot();
  expectNear(renderedCandleBodyWidth(*snapshot, 1),
             renderedCandleBodyWidth(*snapshot, 3), 1e-5);
  const float historicalStep =
      renderedCandleBodyCenter(*snapshot, 2) - renderedCandleBodyCenter(*snapshot, 1);
  const float liveStep =
      renderedCandleBodyCenter(*snapshot, 4) - renderedCandleBodyCenter(*snapshot, 3);
  expectNear(historicalStep, liveStep, 1e-5);

  engine.setCrosshair(true, renderedCandleBodyCenter(*snapshot, 3), 200.0f);
  const auto crosshair = engine.snapshot();
  expectNear(crosshair->selectedCandle.timestamp, 601000.0);
  assert(!crosshair->xTicks.empty());
  for (const auto& tick : crosshair->xTicks) {
    assert(tick.value == 0.0 || tick.value == 300000.0 ||
           tick.value == 600000.0 || tick.value == 601000.0 ||
           tick.value == 602000.0);
  }
}

void testLargeHistoryAndTradeBurst() {
  constexpr size_t candleCount = 50000;
  constexpr size_t tradeCount = 1000;
  ChartEngine engine;
  ChartConfig config;
  config.initialVisibleCount = static_cast<int>(candleCount);
  engine.setConfig(config);
  engine.setSize(1200.0f, 700.0f);

  std::vector<double> history;
  history.reserve(candleCount * 6);
  for (size_t i = 0; i < candleCount; ++i) {
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
  assert(engine.setHistory(history.data(), history.size()) == UpdateStatus::Applied);

  std::vector<double> trades;
  trades.reserve(tradeCount * 3);
  const double nextBucket = static_cast<double>(candleCount) * 60000.0;
  for (size_t i = 0; i < tradeCount; ++i) {
    trades.insert(trades.end(), {
        nextBucket + static_cast<double>(i),
        101.0 + static_cast<double>(i % 25) * 0.01,
        0.1,
    });
  }
  assert(engine.updateTrades(trades.data(), trades.size()) == UpdateStatus::Applied);
  assert(engine.candleCount() == candleCount + 1);

  const auto snapshot = engine.snapshot();
  assert(!snapshot->vertices.empty());
  // Geometry remains capped by LOD instead of growing linearly with 50k candles.
  assert(snapshot->vertices.size() < 1200000);
}

}  // namespace

int main() {
  testTradeAggregation();
  testBucketTransitionAndNoGaps();
  testHistoryContinuation();
  testPrependHistoryPreservesViewport();
  testPrependHistoryRejectsOverlap();
  testOldTradeIgnored();
  testRejectsUnalignedHistory();
  testSnapshotAndAutoscale();
  testDisplayScaleKeepsAxisDensityStable();
  testOneTickRangeUsesScaleMargins();
  testFlatRangeUsesMinMove();
  testCustomScaleMargins();
  testVisiblePriceExtremes();
  testAutoscaleSupportsDifferentMagnitudesAndNegativeValues();
  testCrosshairUsesAutoscaleInverse();
  testYAxisScaleDirectionLimitsAndCrosshair();
  testYAxisScalePersistsAcrossHorizontalPanAndResets();
  testYAxisScaleRespectsZoomOption();
  testCurrentPriceRemainsVisibleOutsideHorizontalViewport();
  testCurrentPricePinsToVerticalViewportEdges();
  testDefaultScaleControlsResetViewport();
  testCurrentPriceLineIsOneUnitThick();
  testTradeBatchMatchesSingles();
  testReadyCandleFeed();
  testViewportStopsFollowingAfterPan();
  testViewportFollowsNewCandleAtLiveEdge();
  testViewportFollowsNewTradeBucketAtLiveEdge();
  testViewportResumesFollowingAfterReturningToLiveEdge();
  testPanReportsViewportMovementAndBounds();
  testProgrammaticZoomUsesRightEdgeAndClampsToHistory();
  testFitContentShowsHistoryAndResetsYScale();
  testViewportCommandsHandleEmptyHistory();
  testCrosshairStatisticsAndLineStyles();
  testCrosshairHitTesting();
  testHybridHistoryUsesLocalCandleWidths();
  testLogicalSpacingUsesUniformCandleSlots();
  testLargeHistoryAndTradeBurst();
  std::cout << "ChartEngineTests passed\n";
  return 0;
}
