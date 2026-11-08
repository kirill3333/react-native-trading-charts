// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_TESTS_CHART_ENGINE_TEST_ACCESS_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_TESTS_CHART_ENGINE_TEST_ACCESS_H_

#include <cassert>
#include <cstddef>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

#include "cpp/chart_engine.h"

namespace trading_charts {

class ChartEngineTestAccess {
 public:
  static void ExitAfterContentMutation(ChartEngine& engine) {
    ChartEngine::MutationScope mutation(engine);
    mutation.ContentChanged();
    engine.width_ += 1.0F;
  }

  static void ExitAfterOverlayMutation(ChartEngine& engine) {
    ChartEngine::MutationScope mutation(engine);
    mutation.OverlayChanged();
    engine.crosshair_active_ = true;
    engine.crosshair_touch_x_ += 1.0F;
  }

  static void PromoteOverlayToContent(ChartEngine& engine) {
    ChartEngine::MutationScope mutation(engine);
    mutation.OverlayChanged();
    engine.crosshair_touch_x_ += 1.0F;
    mutation.ContentChanged();
    engine.width_ += 1.0F;
  }

  static void ThrowAfterContentMutation(ChartEngine& engine) {
    ChartEngine::MutationScope mutation(engine);
    mutation.ContentChanged();
    engine.width_ += 1.0F;
    throw std::runtime_error("mutation scope test");
  }

  static void ExitWithoutMutation(ChartEngine& engine) {
    ChartEngine::MutationScope mutation(engine);
  }

  static std::vector<Candle> SeriesCandles(ChartEngine& engine,
                                           const std::string& series_id) {
    std::lock_guard<std::mutex> lock(engine.mutex_);
    const SeriesData* series = engine.FindSeriesLocked(series_id);
    return series == nullptr ? std::vector<Candle>{} : series->candles;
  }

  static size_t MovingAverageStateCount(ChartEngine& engine,
                                        const std::string& series_id) {
    std::lock_guard<std::mutex> lock(engine.mutex_);
    const SeriesData* series = engine.FindSeriesLocked(series_id);
    return series == nullptr ? 0 : series->moving_average_states.size();
  }

  static std::vector<Candle> SignalCandles(ChartEngine& engine,
                                           const std::string& series_id) {
    std::lock_guard<std::mutex> lock(engine.mutex_);
    const SeriesData* series = engine.FindSeriesLocked(series_id);
    return series == nullptr ? std::vector<Candle>{} : series->signal_candles;
  }

  static std::vector<HistogramPoint> SeriesHistogram(
      ChartEngine& engine, const std::string& series_id) {
    std::lock_guard<std::mutex> lock(engine.mutex_);
    const SeriesData* series = engine.FindSeriesLocked(series_id);
    return series == nullptr ? std::vector<HistogramPoint>{}
                             : series->histogram;
  }

  static size_t MacdStateCount(ChartEngine& engine,
                               const std::string& series_id) {
    std::lock_guard<std::mutex> lock(engine.mutex_);
    const SeriesData* series = engine.FindSeriesLocked(series_id);
    return series == nullptr ? 0 : series->macd_states.size();
  }

  static PaneConfig PaneAt(ChartEngine& engine, size_t index) {
    std::lock_guard<std::mutex> lock(engine.mutex_);
    assert(index < engine.panes_.size());
    return engine.panes_[index];
  }
};

}  // namespace trading_charts

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_TESTS_CHART_ENGINE_TEST_ACCESS_H_
