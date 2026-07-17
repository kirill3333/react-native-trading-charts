#include "../ChartEngine.h"

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
  testOldTradeIgnored();
  testRejectsUnalignedHistory();
  testSnapshotAndAutoscale();
  testDisplayScaleKeepsAxisDensityStable();
  testOneTickRangeUsesScaleMargins();
  testFlatRangeUsesMinMove();
  testCustomScaleMargins();
  testAutoscaleSupportsDifferentMagnitudesAndNegativeValues();
  testCrosshairUsesAutoscaleInverse();
  testYAxisScaleDirectionLimitsAndCrosshair();
  testYAxisScalePersistsAcrossHorizontalPanAndResets();
  testYAxisScaleRespectsZoomOption();
  testCurrentPriceRemainsVisibleOutsideHorizontalViewport();
  testTradeBatchMatchesSingles();
  testReadyCandleFeed();
  testViewportStopsFollowingAfterPan();
  testViewportFollowsNewCandleAtLiveEdge();
  testViewportFollowsNewTradeBucketAtLiveEdge();
  testViewportResumesFollowingAfterReturningToLiveEdge();
  testPanReportsViewportMovementAndBounds();
  testCrosshairHitTesting();
  testLargeHistoryAndTradeBurst();
  std::cout << "ChartEngineTests passed\n";
  return 0;
}
