// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <benchmark/benchmark.h>

#include <cstddef>
#include <cstdint>
#include <memory>
#include <vector>

#include "cpp/chart_engine.h"

namespace {

using trading_charts::ChartConfig;
using trading_charts::ChartEngine;
using trading_charts::PaneConfig;
using trading_charts::RenderSnapshot;
using trading_charts::SeriesConfig;
using trading_charts::SeriesSource;
using trading_charts::SeriesType;
using trading_charts::UpdateStatus;

constexpr float kChartWidth = 1200.0f;
constexpr float kChartHeight = 800.0f;
constexpr double kMinuteMilliseconds = 60000.0;

std::vector<double> MakeHistory(size_t candle_count) {
  std::vector<double> history;
  history.reserve(candle_count * trading_charts::kCandleValueCount);
  for (size_t index = 0; index < candle_count; ++index) {
    const double wave = static_cast<double>(index % 200) * 0.05;
    const double open = 100.0 + wave;
    const double close = open + (index % 2 == 0 ? 0.4 : -0.35);
    history.push_back(static_cast<double>(index) * kMinuteMilliseconds);
    history.push_back(open);
    history.push_back(open + 0.8);
    history.push_back(open - 0.7);
    history.push_back(close);
    history.push_back(10.0 + static_cast<double>(index % 50));
  }
  return history;
}

std::vector<double> MakeTrades(size_t trade_count) {
  std::vector<double> trades;
  trades.reserve(trade_count * trading_charts::kTradeValueCount);
  for (size_t index = 0; index < trade_count; ++index) {
    trades.push_back(kMinuteMilliseconds + static_cast<double>(index) * 10.0);
    trades.push_back(101.0 + static_cast<double>(index % 40) * 0.01);
    trades.push_back(0.1 + static_cast<double>(index % 10) * 0.01);
  }
  return trades;
}

std::unique_ptr<ChartEngine> MakeEngine(size_t visible_count) {
  auto engine = std::make_unique<ChartEngine>();
  ChartConfig config;
  config.initial_visible_count = static_cast<int>(visible_count);
  engine->SetConfig(config);
  engine->SetSize(kChartWidth, kChartHeight);
  return engine;
}

bool AddRsi(benchmark::State& state, ChartEngine& engine) {
  PaneConfig main;
  main.height_weight = 3.0;
  PaneConfig pane;
  pane.pane_id = "rsi";
  pane.price_scale_id = "rsi";
  engine.SetPanes({main, pane}, false);
  SeriesConfig rsi;
  rsi.series_id = "rsi";
  rsi.pane_id = "rsi";
  rsi.price_scale_id = "rsi";
  rsi.type = SeriesType::kLine;
  rsi.source = SeriesSource::kOhlcvRsi;
  rsi.source_series_id = "main";
  if (engine.AddSeries(rsi) == UpdateStatus::kApplied) return true;
  state.SkipWithError("Unable to configure RSI benchmark series");
  return false;
}

bool LoadHistory(benchmark::State& state, ChartEngine& engine,
                 const std::vector<double>& history) {
  if (engine.SetHistory(history.data(), history.size()) ==
      UpdateStatus::kApplied) {
    return true;
  }
  state.SkipWithError("SetHistory rejected deterministic benchmark data");
  return false;
}

size_t VisibleCandleCount(const RenderSnapshot& snapshot) {
  if (!snapshot.has_visible_candles) return 0;
  return snapshot.last_visible_index - snapshot.first_visible_index + 1;
}

void SetSnapshotCounters(benchmark::State& state,
                         const RenderSnapshot& snapshot) {
  const size_t content_float_count =
      snapshot.content_vertices ? snapshot.content_vertices->size() : 0;
  state.counters["content_vertices"] =
      static_cast<double>(content_float_count / 6);
  state.counters["overlay_vertices"] =
      static_cast<double>(snapshot.overlay_vertices.size() / 6);
  state.counters["visible"] = static_cast<double>(VisibleCandleCount(snapshot));
}

void BM_SetHistory(benchmark::State& state) {
  const size_t candle_count = static_cast<size_t>(state.range(0));
  const std::vector<double> history = MakeHistory(candle_count);
  auto preflight = MakeEngine(candle_count);
  if (!LoadHistory(state, *preflight, history)) return;

  for (auto iteration : state) {
    benchmark::DoNotOptimize(iteration);
    state.PauseTiming();
    auto engine = MakeEngine(candle_count);
    state.ResumeTiming();

    UpdateStatus status = engine->SetHistory(history.data(), history.size());
    benchmark::DoNotOptimize(status);
    benchmark::ClobberMemory();

    state.PauseTiming();
    engine.reset();
    state.ResumeTiming();
  }

  state.SetItemsProcessed(state.iterations() *
                          static_cast<int64_t>(candle_count));
  state.SetBytesProcessed(state.iterations() *
                          static_cast<int64_t>(history.size()) *
                          static_cast<int64_t>(sizeof(double)));
  state.counters["candles"] = static_cast<double>(candle_count);
}

void BM_UpdateTrades(benchmark::State& state) {
  const size_t trade_count = static_cast<size_t>(state.range(0));
  const std::vector<double> history = MakeHistory(1);
  const std::vector<double> trades = MakeTrades(trade_count);
  auto preflight = MakeEngine(50);
  if (!LoadHistory(state, *preflight, history)) return;
  if (preflight->UpdateTrades(trades.data(), trades.size()) !=
      UpdateStatus::kApplied) {
    state.SkipWithError("UpdateTrades rejected deterministic benchmark data");
    return;
  }

  for (auto iteration : state) {
    benchmark::DoNotOptimize(iteration);
    state.PauseTiming();
    auto engine = MakeEngine(50);
    UpdateStatus history_status =
        engine->SetHistory(history.data(), history.size());
    benchmark::DoNotOptimize(history_status);
    state.ResumeTiming();

    UpdateStatus status = engine->UpdateTrades(trades.data(), trades.size());
    benchmark::DoNotOptimize(status);
    benchmark::ClobberMemory();

    state.PauseTiming();
    engine.reset();
    state.ResumeTiming();
  }

  state.SetItemsProcessed(state.iterations() *
                          static_cast<int64_t>(trade_count));
  state.SetBytesProcessed(state.iterations() *
                          static_cast<int64_t>(trades.size()) *
                          static_cast<int64_t>(sizeof(double)));
  state.counters["trades"] = static_cast<double>(trade_count);
}

void BM_RsiLiveUpdateAndSnapshot(benchmark::State& state) {
  const size_t candle_count = static_cast<size_t>(state.range(0));
  const std::vector<double> history = MakeHistory(candle_count);
  auto engine = MakeEngine(50);
  if (!AddRsi(state, *engine) || !LoadHistory(state, *engine, history)) return;
  benchmark::DoNotOptimize(engine->Snapshot().get());
  const double timestamp =
      history[history.size() - trading_charts::kCandleValueCount];
  bool higher = true;
  for (auto iteration : state) {
    benchmark::DoNotOptimize(iteration);
    const double close = higher ? 110.0 : 109.5;
    higher = !higher;
    const double candle[] = {timestamp, 109.0, 111.0, 108.0, close, 20.0};
    const UpdateStatus status =
        engine->UpdateCandle(candle, trading_charts::kCandleValueCount);
    if (status != UpdateStatus::kApplied) {
      state.SkipWithError("RSI live update was not applied");
      break;
    }
    const auto snapshot = engine->Snapshot();
    benchmark::DoNotOptimize(snapshot.get());
    benchmark::ClobberMemory();
  }
  state.SetItemsProcessed(state.iterations());
  state.counters["candles"] = static_cast<double>(candle_count);
}

void BM_SnapshotCold(benchmark::State& state) {
  const size_t total_count = static_cast<size_t>(state.range(0));
  const size_t visible_count = static_cast<size_t>(state.range(1));
  const std::vector<double> history = MakeHistory(total_count);
  auto preflight = MakeEngine(visible_count);
  if (!LoadHistory(state, *preflight, history)) return;

  std::shared_ptr<const RenderSnapshot> last_snapshot;
  for (auto iteration : state) {
    benchmark::DoNotOptimize(iteration);
    state.PauseTiming();
    auto engine = MakeEngine(visible_count);
    UpdateStatus history_status =
        engine->SetHistory(history.data(), history.size());
    benchmark::DoNotOptimize(history_status);
    state.ResumeTiming();

    last_snapshot = engine->Snapshot();
    benchmark::DoNotOptimize(last_snapshot.get());
    benchmark::ClobberMemory();

    state.PauseTiming();
    engine.reset();
    state.ResumeTiming();
  }

  SetSnapshotCounters(state, *last_snapshot);
  state.counters["candles"] = static_cast<double>(total_count);
}

void BM_SnapshotCached(benchmark::State& state) {
  const size_t total_count = static_cast<size_t>(state.range(0));
  const size_t visible_count = static_cast<size_t>(state.range(1));
  const std::vector<double> history = MakeHistory(total_count);
  auto engine = MakeEngine(visible_count);
  if (!LoadHistory(state, *engine, history)) return;
  const auto initial = engine->Snapshot();
  const auto cached = engine->Snapshot();
  if (cached != initial) {
    state.SkipWithError("Cached Snapshot did not reuse the published snapshot");
    return;
  }

  std::shared_ptr<const RenderSnapshot> last_snapshot;
  for (auto iteration : state) {
    benchmark::DoNotOptimize(iteration);
    last_snapshot = engine->Snapshot();
    benchmark::DoNotOptimize(last_snapshot.get());
  }

  SetSnapshotCounters(state, *last_snapshot);
  state.counters["candles"] = static_cast<double>(total_count);
}

void BM_SnapshotCrosshairOnly(benchmark::State& state) {
  const size_t total_count = static_cast<size_t>(state.range(0));
  const size_t visible_count = static_cast<size_t>(state.range(1));
  const std::vector<double> history = MakeHistory(total_count);
  auto engine = MakeEngine(visible_count);
  if (!LoadHistory(state, *engine, history)) return;
  const auto baseline = engine->Snapshot();
  const auto baseline_content = baseline->content_vertices;
  const uint64_t baseline_content_revision = baseline->content_revision;

  engine->SetCrosshair(true, 300.0f, 240.0f);
  const auto preflight = engine->Snapshot();
  if (preflight->content_vertices != baseline_content ||
      preflight->content_revision != baseline_content_revision) {
    state.SkipWithError("Crosshair snapshot rebuilt static content");
    return;
  }
  engine->SetCrosshair(false, 0.0f, 0.0f);
  const auto reset = engine->Snapshot();
  if (reset->content_vertices != baseline_content) {
    state.SkipWithError("Crosshair reset rebuilt static content");
    return;
  }

  bool alternate = false;
  std::shared_ptr<const RenderSnapshot> last_snapshot;
  for (auto iteration : state) {
    benchmark::DoNotOptimize(iteration);
    alternate = !alternate;
    engine->SetCrosshair(true, alternate ? 300.0f : 900.0f,
                         alternate ? 240.0f : 560.0f);
    last_snapshot = engine->Snapshot();
    benchmark::DoNotOptimize(last_snapshot.get());
    benchmark::ClobberMemory();
  }

  if (last_snapshot->content_vertices != baseline_content ||
      last_snapshot->content_revision != baseline_content_revision) {
    state.SkipWithError("Measured crosshair snapshot rebuilt static content");
    return;
  }
  SetSnapshotCounters(state, *last_snapshot);
  state.counters["candles"] = static_cast<double>(total_count);
}

void BM_PanAndSnapshot(benchmark::State& state) {
  const size_t total_count = static_cast<size_t>(state.range(0));
  const size_t visible_count = static_cast<size_t>(state.range(1));
  const std::vector<double> history = MakeHistory(total_count);
  auto engine = MakeEngine(visible_count);
  if (!LoadHistory(state, *engine, history)) return;
  benchmark::DoNotOptimize(engine->Snapshot().get());
  if (!engine->Pan(16.0f) || !engine->Pan(-16.0f)) {
    state.SkipWithError("Pan preflight reached a viewport boundary");
    return;
  }
  benchmark::DoNotOptimize(engine->Snapshot().get());

  bool pan_older = true;
  std::shared_ptr<const RenderSnapshot> last_snapshot;
  for (auto iteration : state) {
    benchmark::DoNotOptimize(iteration);
    bool moved = engine->Pan(pan_older ? 16.0f : -16.0f);
    pan_older = !pan_older;
    last_snapshot = engine->Snapshot();
    benchmark::DoNotOptimize(moved);
    benchmark::DoNotOptimize(last_snapshot.get());
    benchmark::ClobberMemory();
  }

  SetSnapshotCounters(state, *last_snapshot);
  state.counters["candles"] = static_cast<double>(total_count);
}

void BM_ZoomAndSnapshot(benchmark::State& state) {
  const size_t total_count = static_cast<size_t>(state.range(0));
  const size_t visible_count = static_cast<size_t>(state.range(1));
  const std::vector<double> history = MakeHistory(total_count);
  auto engine = MakeEngine(visible_count);
  if (!LoadHistory(state, *engine, history)) return;
  benchmark::DoNotOptimize(engine->Snapshot().get());
  constexpr double kZoomIn = 1.01;
  constexpr double kZoomOut = 1.0 / kZoomIn;
  constexpr float kFocusX = kChartWidth * 0.5f;
  if (!engine->Zoom(kZoomIn, kFocusX) || !engine->Zoom(kZoomOut, kFocusX)) {
    state.SkipWithError("Zoom preflight reached a viewport boundary");
    return;
  }
  benchmark::DoNotOptimize(engine->Snapshot().get());

  bool zoom_in = true;
  std::shared_ptr<const RenderSnapshot> last_snapshot;
  for (auto iteration : state) {
    benchmark::DoNotOptimize(iteration);
    bool zoomed = engine->Zoom(zoom_in ? kZoomIn : kZoomOut, kFocusX);
    zoom_in = !zoom_in;
    last_snapshot = engine->Snapshot();
    benchmark::DoNotOptimize(zoomed);
    benchmark::DoNotOptimize(last_snapshot.get());
    benchmark::ClobberMemory();
  }

  SetSnapshotCounters(state, *last_snapshot);
  state.counters["candles"] = static_cast<double>(total_count);
}

void SnapshotArguments(benchmark::Benchmark* benchmark_case) {
  benchmark_case->Args({1000, 50});
  benchmark_case->Args({10000, 50});
  benchmark_case->Args({10000, 500});
  benchmark_case->Args({100000, 50});
  benchmark_case->Args({100000, 500});
  benchmark_case->Args({100000, 5000});
}

void InteractionArguments(benchmark::Benchmark* benchmark_case) {
  benchmark_case->Args({10000, 50});
  benchmark_case->Args({10000, 500});
  benchmark_case->Args({100000, 5000});
}

BENCHMARK(BM_SetHistory)->Arg(1000)->Arg(10000)->Arg(100000);
BENCHMARK(BM_UpdateTrades)->Arg(1)->Arg(10)->Arg(100)->Arg(1000);
BENCHMARK(BM_RsiLiveUpdateAndSnapshot)->Arg(1000)->Arg(10000)->Arg(100000);
BENCHMARK(BM_SnapshotCold)->Apply(SnapshotArguments);
BENCHMARK(BM_SnapshotCached)->Apply(SnapshotArguments);
BENCHMARK(BM_SnapshotCrosshairOnly)->Apply(InteractionArguments);
BENCHMARK(BM_PanAndSnapshot)->Apply(InteractionArguments);
BENCHMARK(BM_ZoomAndSnapshot)->Apply(InteractionArguments);

}  // namespace
