// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <exception>
#include <iostream>
#include <limits>
#include <memory>
#include <string_view>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/tests/fixtures/binance_btcusdt_1m.h"

namespace {

using trading_charts::Candle;
using trading_charts::ChartConfig;
using trading_charts::ChartEngine;
using trading_charts::OutsideSessionPolicy;
using trading_charts::PaneConfig;
using trading_charts::PriceLine;
using trading_charts::RenderSnapshot;
using trading_charts::ResolutionUnit;
using trading_charts::SeriesConfig;
using trading_charts::SeriesSource;
using trading_charts::SeriesType;
using trading_charts::TradingCalendarConfig;
using trading_charts::TradingSessionConfig;
using trading_charts::UpdateStatus;
namespace fixture = trading_charts::test_fixtures::binance_btcusdt;

constexpr size_t kCandleWidth = trading_charts::kCandleValueCount;
constexpr size_t kTradeWidth = trading_charts::kTradeValueCount;
constexpr double kVolumeTolerance = 1e-8;
constexpr double kValueTolerance = 1e-9;

void ExpectNear(double actual, double expected,
                double tolerance = kValueTolerance) {
  assert(std::abs(actual - expected) <= tolerance);
}

ChartConfig BinanceMinuteConfig() {
  ChartConfig config;
  config.resolution.unit = ResolutionUnit::kMinute;
  config.resolution.multiplier = 1;
  config.initial_visible_count = 100;
  return config;
}

void SeedHistory(ChartEngine& engine) {
  engine.SetConfig(BinanceMinuteConfig());
  engine.SetSize(1200.0F, 720.0F);
  assert(engine.SetHistory(fixture::kHistory.data(),
                           fixture::kHistory.size()) == UpdateStatus::kApplied);
}

void ExpectCandle(const Candle& actual, const double* expected) {
  ExpectNear(actual.timestamp, expected[0]);
  ExpectNear(actual.open, expected[1]);
  ExpectNear(actual.high, expected[2]);
  ExpectNear(actual.low, expected[3]);
  ExpectNear(actual.close, expected[4]);
  ExpectNear(actual.volume, expected[5], kVolumeTolerance);
}

void ExpectCandlesEqual(const std::vector<Candle>& left,
                        const std::vector<Candle>& right) {
  assert(left.size() == right.size());
  for (size_t index = 0; index < left.size(); ++index) {
    ExpectNear(left[index].timestamp, right[index].timestamp);
    ExpectNear(left[index].open, right[index].open);
    ExpectNear(left[index].high, right[index].high);
    ExpectNear(left[index].low, right[index].low);
    ExpectNear(left[index].close, right[index].close);
    ExpectNear(left[index].volume, right[index].volume, kVolumeTolerance);
  }
}

struct Checkpoint {
  std::uint64_t revision = 0;
  std::uint64_t content_revision = 0;
  std::shared_ptr<const RenderSnapshot> snapshot;
};

Checkpoint Capture(ChartEngine& engine) {
  const auto snapshot = engine.Snapshot();
  assert(snapshot != nullptr);
  assert(snapshot->revision == engine.Revision());
  return {snapshot->revision, snapshot->content_revision, snapshot};
}

template <typename Operation>
void ExpectContentMutation(ChartEngine& engine, Operation operation) {
  const Checkpoint before = Capture(engine);
  operation();
  const Checkpoint after = Capture(engine);
  assert(after.revision > before.revision);
  assert(after.content_revision > before.content_revision);
  assert(after.snapshot != before.snapshot);
}

template <typename Operation>
void ExpectOverlayMutation(ChartEngine& engine, Operation operation) {
  const Checkpoint before = Capture(engine);
  operation();
  const Checkpoint after = Capture(engine);
  assert(after.revision > before.revision);
  assert(after.content_revision == before.content_revision);
  assert(after.snapshot != before.snapshot);
  assert(after.snapshot->content_vertices == before.snapshot->content_vertices);
}

template <typename Operation>
void ExpectNoMutation(ChartEngine& engine, Operation operation) {
  const Checkpoint before = Capture(engine);
  operation();
  const Checkpoint after = Capture(engine);
  assert(after.revision == before.revision);
  assert(after.content_revision == before.content_revision);
  assert(after.snapshot == before.snapshot);
}

void ExpectSnapshotSafe(const RenderSnapshot& snapshot) {
  assert(std::isfinite(snapshot.visible_x_min));
  assert(std::isfinite(snapshot.visible_x_max));
  assert(std::isfinite(snapshot.visible_y_min));
  assert(std::isfinite(snapshot.visible_y_max));
  assert(std::isfinite(snapshot.current_price));
  assert(snapshot.visible_x_max > snapshot.visible_x_min);
  assert(snapshot.visible_y_max > snapshot.visible_y_min);
  assert(snapshot.total_candle_count > 0);
  assert(snapshot.has_visible_candles);
  assert(snapshot.first_visible_index <= snapshot.last_visible_index);
  assert(snapshot.last_visible_index < snapshot.total_candle_count);
  assert(snapshot.content_vertices != nullptr);
  for (float value : *snapshot.content_vertices) {
    assert(std::isfinite(value));
  }
  for (float value : snapshot.overlay_vertices) {
    assert(std::isfinite(value));
  }
  for (const auto& tick : snapshot.x_ticks) {
    assert(std::isfinite(tick.value));
    assert(std::isfinite(tick.position));
  }
  for (const auto& tick : snapshot.y_ticks) {
    assert(std::isfinite(tick.value));
    assert(std::isfinite(tick.position));
  }
}

void ExpectSnapshotsEquivalent(const RenderSnapshot& left,
                               const RenderSnapshot& right) {
  assert(left.total_candle_count == right.total_candle_count);
  assert(left.first_visible_index == right.first_visible_index);
  assert(left.last_visible_index == right.last_visible_index);
  assert(left.has_visible_candles == right.has_visible_candles);
  ExpectNear(left.visible_x_min, right.visible_x_min);
  ExpectNear(left.visible_x_max, right.visible_x_max);
  ExpectNear(left.visible_y_min, right.visible_y_min);
  ExpectNear(left.visible_y_max, right.visible_y_max);
  ExpectNear(left.current_price, right.current_price);
  assert(left.x_ticks.size() == right.x_ticks.size());
  assert(left.y_ticks.size() == right.y_ticks.size());
  assert(left.content_vertices != nullptr);
  assert(right.content_vertices != nullptr);
  assert(*left.content_vertices == *right.content_vertices);
}

void TestFixtureIntegrityAndExchangeOracle() {
  static_assert(fixture::kHistory.size() ==
                fixture::kHistoryCandleCount * kCandleWidth);
  static_assert(fixture::kTrades.size() == fixture::kTradeCount * kTradeWidth);
  static_assert(fixture::kKlineUpdates.size() ==
                fixture::kKlineUpdateCount * kCandleWidth);
  static_assert(fixture::kFinalCandle.size() == kCandleWidth);
  static_assert(fixture::kHistoryCandleCount == 300);

  assert(fixture::kSymbol == std::string_view("BTCUSDT"));
  assert(fixture::kInterval == std::string_view("1m"));
  assert(fixture::kSourceSha256.size() == 2);
  assert(fixture::kSourceSha256[0].size() == 32);
  assert(fixture::kSourceSha256[1].size() == 32);
  assert(fixture::kLastTradeId - fixture::kFirstTradeId + 1 ==
         static_cast<std::int64_t>(fixture::kTradeCount));

  for (size_t candle = 0; candle < fixture::kHistoryCandleCount; ++candle) {
    const size_t offset = candle * kCandleWidth;
    const double timestamp = fixture::kHistory[offset];
    const double open = fixture::kHistory[offset + 1];
    const double high = fixture::kHistory[offset + 2];
    const double low = fixture::kHistory[offset + 3];
    const double close = fixture::kHistory[offset + 4];
    const double volume = fixture::kHistory[offset + 5];
    assert(std::isfinite(timestamp));
    assert(low <= std::min(open, close));
    assert(high >= std::max(open, close));
    assert(volume >= 0.0);
    if (candle > 0) {
      ExpectNear(timestamp, fixture::kHistory[offset - kCandleWidth] + 60000.0);
    }
  }
  ExpectNear(fixture::kHistory[fixture::kHistory.size() - kCandleWidth],
             static_cast<double>(fixture::kBucketStartMs) - 60000.0);

  const double bucket_start = static_cast<double>(fixture::kBucketStartMs);
  double previous_timestamp = -std::numeric_limits<double>::infinity();
  double open = 0.0;
  double high = -std::numeric_limits<double>::infinity();
  double low = std::numeric_limits<double>::infinity();
  double close = 0.0;
  double volume = 0.0;
  for (size_t trade = 0; trade < fixture::kTradeCount; ++trade) {
    const size_t offset = trade * kTradeWidth;
    const double timestamp = fixture::kTrades[offset];
    const double price = fixture::kTrades[offset + 1];
    const double size = fixture::kTrades[offset + 2];
    assert(timestamp >= bucket_start);
    assert(timestamp < bucket_start + 60000.0);
    assert(timestamp >= previous_timestamp);
    assert(std::isfinite(price) && price > 0.0);
    assert(std::isfinite(size) && size >= 0.0);
    if (trade == 0) {
      open = price;
    }
    high = std::max(high, price);
    low = std::min(low, price);
    close = price;
    volume += size;
    previous_timestamp = timestamp;
  }
  ExpectNear(fixture::kFinalCandle[0], bucket_start);
  ExpectNear(open, fixture::kFinalCandle[1]);
  ExpectNear(high, fixture::kFinalCandle[2]);
  ExpectNear(low, fixture::kFinalCandle[3]);
  ExpectNear(close, fixture::kFinalCandle[4]);
  ExpectNear(volume, fixture::kFinalCandle[5], kVolumeTolerance);

  for (size_t update = 0; update < fixture::kKlineUpdateCount; ++update) {
    ExpectNear(fixture::kKlineUpdates[update * kCandleWidth], bucket_start);
  }
  for (size_t field = 0; field < kCandleWidth; ++field) {
    ExpectNear(fixture::kKlineUpdates[fixture::kKlineUpdates.size() -
                                      kCandleWidth + field],
               fixture::kFinalCandle[field],
               field == 5 ? kVolumeTolerance : kValueTolerance);
  }
}

void ReplayInChunks(ChartEngine& engine) {
  constexpr std::array<size_t, 7> kChunkPattern = {1, 7, 31, 3, 64, 11, 127};
  size_t trade = 0;
  size_t pattern = 0;
  while (trade < fixture::kTradeCount) {
    const size_t count = std::min(kChunkPattern[pattern % kChunkPattern.size()],
                                  fixture::kTradeCount - trade);
    const Checkpoint before = Capture(engine);
    assert(engine.UpdateTrades(fixture::kTrades.data() + trade * kTradeWidth,
                               count * kTradeWidth) == UpdateStatus::kApplied);
    const Checkpoint after = Capture(engine);
    assert(after.revision == before.revision + 1);
    assert(after.content_revision == before.content_revision + 1);
    trade += count;
    ++pattern;
  }
}

void TestTradeBatchingAndKlineReplayConverge() {
  ChartEngine batch;
  SeedHistory(batch);
  const Checkpoint before_batch = Capture(batch);
  assert(batch.UpdateTrades(fixture::kTrades.data(), fixture::kTrades.size()) ==
         UpdateStatus::kApplied);
  const Checkpoint after_batch = Capture(batch);
  assert(after_batch.revision == before_batch.revision + 1);
  assert(after_batch.content_revision == before_batch.content_revision + 1);

  ChartEngine singles;
  SeedHistory(singles);
  for (size_t trade = 0; trade < fixture::kTradeCount; ++trade) {
    assert(singles.UpdateTrade(fixture::kTrades.data() + trade * kTradeWidth,
                               kTradeWidth) == UpdateStatus::kApplied);
  }

  ChartEngine chunks;
  SeedHistory(chunks);
  ReplayInChunks(chunks);

  ChartEngine kline_updates;
  SeedHistory(kline_updates);
  for (size_t update = 0; update < fixture::kKlineUpdateCount; ++update) {
    assert(kline_updates.UpdateCandle(
               fixture::kKlineUpdates.data() + update * kCandleWidth,
               kCandleWidth) == UpdateStatus::kApplied);
  }

  std::vector<double> complete_history(fixture::kHistory.begin(),
                                       fixture::kHistory.end());
  complete_history.insert(complete_history.end(), fixture::kFinalCandle.begin(),
                          fixture::kFinalCandle.end());
  ChartEngine replacement;
  replacement.SetConfig(BinanceMinuteConfig());
  replacement.SetSize(1200.0F, 720.0F);
  assert(replacement.SetHistory(complete_history.data(),
                                complete_history.size()) ==
         UpdateStatus::kApplied);

  ExpectCandlesEqual(batch.Candles(), singles.Candles());
  ExpectCandlesEqual(batch.Candles(), chunks.Candles());
  ExpectCandlesEqual(batch.Candles(), kline_updates.Candles());
  ExpectCandlesEqual(batch.Candles(), replacement.Candles());
  assert(batch.CandleCount() == fixture::kHistoryCandleCount + 1);
  ExpectCandle(batch.CandleAt(batch.CandleCount() - 1),
               fixture::kFinalCandle.data());

  const auto batch_snapshot = batch.Snapshot();
  const auto singles_snapshot = singles.Snapshot();
  const auto chunks_snapshot = chunks.Snapshot();
  const auto kline_snapshot = kline_updates.Snapshot();
  const auto replacement_snapshot = replacement.Snapshot();
  ExpectSnapshotSafe(*batch_snapshot);
  ExpectSnapshotsEquivalent(*batch_snapshot, *singles_snapshot);
  ExpectSnapshotsEquivalent(*batch_snapshot, *chunks_snapshot);
  ExpectSnapshotsEquivalent(*batch_snapshot, *kline_snapshot);
  ExpectSnapshotsEquivalent(*batch_snapshot, *replacement_snapshot);
}

void TestInvalidBatchesAreAtomic() {
  ChartEngine malformed;
  SeedHistory(malformed);
  std::vector<double> invalid(fixture::kTrades.begin(), fixture::kTrades.end());
  invalid.push_back(static_cast<double>(fixture::kBucketStartMs + 60000));
  invalid.push_back(fixture::kFinalCandle[4]);
  invalid.push_back(-1.0);
  ExpectNoMutation(malformed, [&] {
    assert(malformed.UpdateTrades(invalid.data(), invalid.size()) ==
           UpdateStatus::kInvalidInput);
  });

  const double first_second = std::floor(fixture::kTrades.front() / 1000.0);
  const double last_second = std::floor(
      fixture::kTrades[fixture::kTrades.size() - kTradeWidth] / 1000.0);
  assert(last_second > first_second);
  const int session_end =
      static_cast<int>(first_second + (last_second - first_second) / 2.0) %
      (24 * 60 * 60);
  assert(session_end > 0);

  ChartEngine rejected;
  ChartConfig config = BinanceMinuteConfig();
  TradingCalendarConfig& calendar = config.trade_aggregation.calendar;
  calendar.configured = true;
  calendar.time_zone = "UTC";
  calendar.transitions = {{0, 0}};
  calendar.sessions = {TradingSessionConfig{0b01111111, 0, session_end, 0, 0}};
  config.trade_aggregation.outside_session = OutsideSessionPolicy::kReject;
  rejected.SetConfig(config);
  rejected.SetSize(1200.0F, 720.0F);
  assert(
      rejected.SetHistory(fixture::kHistory.data(), fixture::kHistory.size()) ==
      UpdateStatus::kApplied);
  ExpectNoMutation(rejected, [&] {
    assert(rejected.UpdateTrades(fixture::kTrades.data(),
                                 fixture::kTrades.size()) ==
           UpdateStatus::kInvalidInput);
  });
  assert(rejected.CandleCount() == fixture::kHistoryCandleCount);
}

void TestOldShuffledAndEqualTimestampTrades() {
  ChartEngine mixed;
  SeedHistory(mixed);
  const size_t split = fixture::kTradeCount / 3;
  assert(split > 0);
  assert(mixed.UpdateTrades(fixture::kTrades.data(), split * kTradeWidth) ==
         UpdateStatus::kApplied);
  std::vector<double> old_then_new(fixture::kTrades.begin(),
                                   fixture::kTrades.begin() + kTradeWidth);
  old_then_new.insert(old_then_new.end(),
                      fixture::kTrades.begin() + split * kTradeWidth,
                      fixture::kTrades.end());
  assert(mixed.UpdateTrades(old_then_new.data(), old_then_new.size()) ==
         UpdateStatus::kApplied);
  ExpectCandle(mixed.CandleAt(mixed.CandleCount() - 1),
               fixture::kFinalCandle.data());

  const Checkpoint completed = Capture(mixed);
  std::array<double, kTradeWidth * 2> shuffled = {
      fixture::kTrades[kTradeWidth],
      fixture::kTrades[kTradeWidth + 1],
      fixture::kTrades[kTradeWidth + 2],
      fixture::kTrades[0],
      fixture::kTrades[1],
      fixture::kTrades[2],
  };
  assert(mixed.UpdateTrades(shuffled.data(), shuffled.size()) ==
         UpdateStatus::kIgnoredOldTimestamp);
  const Checkpoint after_shuffled = Capture(mixed);
  assert(after_shuffled.revision == completed.revision);
  assert(after_shuffled.snapshot == completed.snapshot);

  ChartEngine equal_timestamp;
  SeedHistory(equal_timestamp);
  std::array<double, kTradeWidth * 2> equal = {
      fixture::kTrades[0],
      fixture::kTrades[1],
      fixture::kTrades[2],
      fixture::kTrades[0],
      fixture::kTrades[kTradeWidth + 1],
      fixture::kTrades[kTradeWidth + 2],
  };
  assert(equal_timestamp.UpdateTrades(equal.data(), equal.size()) ==
         UpdateStatus::kApplied);
  const Candle candle =
      equal_timestamp.CandleAt(equal_timestamp.CandleCount() - 1);
  ExpectNear(candle.open, equal[1]);
  ExpectNear(candle.close, equal[4]);
  ExpectNear(candle.high, std::max(equal[1], equal[4]));
  ExpectNear(candle.low, std::min(equal[1], equal[4]));
  ExpectNear(candle.volume, equal[2] + equal[5], kVolumeTolerance);
}

void TestRealHistoryStateMutationContract() {
  ChartEngine engine;
  SeedHistory(engine);

  ChartConfig config = BinanceMinuteConfig();
  config.initial_visible_count = 120;
  ExpectContentMutation(engine, [&] { engine.SetConfig(config); });

  TradingCalendarConfig calendar;
  calendar.time_zone = "UTC";
  calendar.transitions = {{0, 0}};
  ExpectContentMutation(engine, [&] { engine.SetTradingCalendar(calendar); });

  PaneConfig volume;
  volume.pane_id = "volume";
  volume.price_scale_id = "volume";
  volume.height_weight = 0.35;
  volume.min_height = 40.0F;
  volume.volume_format = true;
  PaneConfig rsi_pane;
  rsi_pane.pane_id = "rsi";
  rsi_pane.price_scale_id = "rsi";
  rsi_pane.height_weight = 0.3;
  rsi_pane.min_height = 40.0F;
  PaneConfig macd_pane;
  macd_pane.pane_id = "macd";
  macd_pane.price_scale_id = "macd";
  macd_pane.height_weight = 0.3;
  macd_pane.min_height = 40.0F;
  ExpectContentMutation(engine, [&] {
    engine.SetPanes({PaneConfig{}, volume, rsi_pane, macd_pane}, true);
  });
  ExpectContentMutation(engine,
                        [&] { assert(engine.SetPaneHeight("volume", 0.5)); });
  ExpectNoMutation(engine,
                   [&] { assert(!engine.SetPaneHeight("volume", 0.5)); });
  ExpectContentMutation(engine, [&] { engine.SetSize(1280.0F, 760.0F); });
  ExpectNoMutation(engine, [&] { engine.SetSize(1280.0F, 760.0F); });
  ExpectContentMutation(engine,
                        [&] { assert(engine.ResizePaneSeparator(0, 20.0F)); });
  ExpectNoMutation(engine,
                   [&] { assert(!engine.ResizePaneSeparator(99, 20.0F)); });

  PriceLine line;
  line.id = "last-close";
  line.label = "BTCUSDT close";
  line.price = fixture::kHistory[fixture::kHistory.size() - 2];
  ExpectContentMutation(engine, [&] { assert(engine.SetPriceLine(line)); });
  ExpectNoMutation(engine, [&] { assert(!engine.SetPriceLine(line)); });
  line.price = fixture::kFinalCandle[4];
  ExpectContentMutation(engine, [&] { assert(engine.SetPriceLine(line)); });
  ExpectContentMutation(engine,
                        [&] { assert(engine.RemovePriceLine(line.id)); });
  ExpectNoMutation(engine, [&] { assert(!engine.RemovePriceLine(line.id)); });
  assert(engine.SetPriceLine(line));
  ExpectContentMutation(engine, [&] { assert(engine.ClearPriceLines()); });
  ExpectNoMutation(engine, [&] { assert(!engine.ClearPriceLines()); });

  SeriesConfig comparison;
  comparison.series_id = "comparison";
  comparison.type = SeriesType::kLine;
  ExpectContentMutation(engine, [&] {
    assert(engine.AddSeries(comparison) == UpdateStatus::kApplied);
  });
  ExpectNoMutation(engine, [&] {
    assert(engine.AddSeries(comparison) == UpdateStatus::kInvalidInput);
  });
  constexpr size_t kPrefixCandles = 100;
  const size_t suffix_offset = kPrefixCandles * kCandleWidth;
  ExpectContentMutation(engine, [&] {
    assert(engine.SetSeriesData("comparison",
                                fixture::kHistory.data() + suffix_offset,
                                fixture::kHistory.size() - suffix_offset,
                                false) == UpdateStatus::kApplied);
  });
  ExpectContentMutation(engine, [&] {
    assert(engine.PrependSeriesData("comparison", fixture::kHistory.data(),
                                    suffix_offset,
                                    false) == UpdateStatus::kApplied);
  });
  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateSeriesData("comparison", fixture::kFinalCandle.data(),
                                   fixture::kFinalCandle.size(),
                                   false) == UpdateStatus::kApplied);
  });
  ExpectNoMutation(engine, [&] {
    assert(engine.UpdateSeriesData("comparison", fixture::kHistory.data(),
                                   kCandleWidth, false) ==
           UpdateStatus::kIgnoredOldTimestamp);
  });

  SeriesConfig reported_volume;
  reported_volume.series_id = "reported-volume";
  reported_volume.pane_id = "volume";
  reported_volume.price_scale_id = "volume";
  reported_volume.type = SeriesType::kHistogram;
  ExpectContentMutation(engine, [&] {
    assert(engine.AddSeries(reported_volume) == UpdateStatus::kApplied);
  });
  std::vector<double> histogram;
  histogram.reserve(fixture::kHistoryCandleCount * 2);
  for (size_t candle = 0; candle < fixture::kHistoryCandleCount; ++candle) {
    const size_t offset = candle * kCandleWidth;
    histogram.push_back(fixture::kHistory[offset]);
    histogram.push_back(fixture::kHistory[offset + 5]);
  }
  constexpr size_t kHistogramPrefixValues = kPrefixCandles * 2;
  ExpectContentMutation(engine, [&] {
    assert(engine.SetSeriesData("reported-volume",
                                histogram.data() + kHistogramPrefixValues,
                                histogram.size() - kHistogramPrefixValues,
                                true) == UpdateStatus::kApplied);
  });
  ExpectContentMutation(engine, [&] {
    assert(engine.PrependSeriesData("reported-volume", histogram.data(),
                                    kHistogramPrefixValues,
                                    true) == UpdateStatus::kApplied);
  });
  const std::array<double, 2> final_volume = {fixture::kFinalCandle[0],
                                              fixture::kFinalCandle[5]};
  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateSeriesData("reported-volume", final_volume.data(),
                                   final_volume.size(),
                                   true) == UpdateStatus::kApplied);
  });

  SeriesConfig volume_series;
  volume_series.series_id = "volume";
  volume_series.pane_id = "volume";
  volume_series.price_scale_id = "volume";
  volume_series.type = SeriesType::kHistogram;
  volume_series.source = SeriesSource::kOhlcvVolume;
  ExpectContentMutation(engine, [&] {
    assert(engine.AddSeries(volume_series) == UpdateStatus::kApplied);
  });
  SeriesConfig sma;
  sma.series_id = "sma";
  sma.type = SeriesType::kLine;
  sma.source = SeriesSource::kOhlcvSma;
  sma.source_series_id = "main";
  sma.moving_average_period = 20;
  ExpectContentMutation(
      engine, [&] { assert(engine.AddSeries(sma) == UpdateStatus::kApplied); });
  SeriesConfig ema = sma;
  ema.series_id = "ema";
  ema.source = SeriesSource::kOhlcvEma;
  ExpectContentMutation(
      engine, [&] { assert(engine.AddSeries(ema) == UpdateStatus::kApplied); });
  SeriesConfig rsi;
  rsi.series_id = "rsi";
  rsi.pane_id = "rsi";
  rsi.price_scale_id = "rsi";
  rsi.type = SeriesType::kLine;
  rsi.source = SeriesSource::kOhlcvRsi;
  rsi.source_series_id = "main";
  ExpectContentMutation(
      engine, [&] { assert(engine.AddSeries(rsi) == UpdateStatus::kApplied); });
  SeriesConfig macd;
  macd.series_id = "macd";
  macd.pane_id = "macd";
  macd.price_scale_id = "macd";
  macd.type = SeriesType::kLine;
  macd.source = SeriesSource::kOhlcvMacd;
  macd.source_series_id = "main";
  ExpectContentMutation(engine, [&] {
    assert(engine.AddSeries(macd) == UpdateStatus::kApplied);
  });
  const auto indicators = engine.Snapshot();
  assert(indicators->indicator_legends.size() == 2);
  ExpectContentMutation(engine,
                        [&] { assert(engine.RemoveSeries("comparison")); });
  ExpectNoMutation(engine, [&] { assert(!engine.RemoveSeries("comparison")); });

  ExpectContentMutation(engine, [&] { assert(engine.Pan(100.0F)); });
  ExpectContentMutation(engine, [&] { assert(engine.Zoom(1.5, 600.0F)); });
  ExpectContentMutation(engine, [&] { engine.ZoomAtRightEdge(1.2); });
  ExpectContentMutation(engine, [&] { assert(engine.ScaleY(20.0F)); });
  ExpectContentMutation(engine,
                        [&] { assert(engine.ScaleYAt(-10.0F, 100.0F)); });
  ExpectContentMutation(engine, [&] { engine.ResetViewport(); });
  ExpectContentMutation(engine, [&] { engine.FitContent(); });

  ExpectOverlayMutation(engine,
                        [&] { engine.SetCrosshair(true, 600.0F, 260.0F); });
  ExpectNoMutation(engine, [&] { engine.SetCrosshair(true, 600.0F, 260.0F); });
  ExpectOverlayMutation(engine, [&] { assert(engine.Pan(-100.0F)); });
  engine.SetCrosshair(true, 600.0F, 260.0F);
  ExpectOverlayMutation(engine, [&] { assert(engine.Zoom(1.0, 600.0F)); });
  engine.SetCrosshair(true, 600.0F, 260.0F);
  ExpectOverlayMutation(engine, [&] { assert(engine.ScaleYAt(0.0F, 100.0F)); });
  ExpectNoMutation(engine, [&] {
    assert(!engine.Pan(std::numeric_limits<float>::quiet_NaN()));
  });

  const auto snapshot = engine.Snapshot();
  ExpectSnapshotSafe(*snapshot);
  ExpectContentMutation(engine, [&] { engine.Clear(); });
  assert(engine.CandleCount() == 0);
}

void TestHistoryPrependAndCandleUpdatesUseFixture() {
  constexpr size_t kPrefixCandles = 100;
  const size_t prefix_values = kPrefixCandles * kCandleWidth;
  ChartEngine engine;
  engine.SetConfig(BinanceMinuteConfig());
  engine.SetSize(1200.0F, 720.0F);
  assert(engine.SetHistory(fixture::kHistory.data() + prefix_values,
                           fixture::kHistory.size() - prefix_values) ==
         UpdateStatus::kApplied);
  const auto suffix_snapshot = engine.Snapshot();
  ExpectContentMutation(engine, [&] {
    assert(engine.PrependHistory(fixture::kHistory.data(), prefix_values) ==
           UpdateStatus::kApplied);
  });
  const auto complete_snapshot = engine.Snapshot();
  ExpectNear(complete_snapshot->visible_x_min, suffix_snapshot->visible_x_min);
  ExpectNear(complete_snapshot->visible_x_max, suffix_snapshot->visible_x_max);
  assert(engine.CandleCount() == fixture::kHistoryCandleCount);
  for (size_t candle = 0; candle < fixture::kHistoryCandleCount; ++candle) {
    ExpectCandle(engine.CandleAt(candle),
                 fixture::kHistory.data() + candle * kCandleWidth);
  }
  ExpectNoMutation(engine, [&] {
    assert(engine.PrependHistory(nullptr, 0) == UpdateStatus::kApplied);
  });
  ExpectNoMutation(engine, [&] {
    assert(engine.PrependHistory(fixture::kHistory.data(), kCandleWidth) ==
           UpdateStatus::kInvalidInput);
  });
  ExpectNoMutation(engine, [&] {
    assert(engine.PrependHistory(nullptr, kCandleWidth) ==
           UpdateStatus::kInvalidInput);
  });

  ChartEngine invalid_prefix;
  invalid_prefix.SetConfig(BinanceMinuteConfig());
  invalid_prefix.SetSize(1200.0F, 720.0F);
  assert(invalid_prefix.SetHistory(fixture::kHistory.data() + prefix_values,
                                   fixture::kHistory.size() - prefix_values) ==
         UpdateStatus::kApplied);
  std::vector<double> malformed_prefix(
      fixture::kHistory.begin(), fixture::kHistory.begin() + prefix_values);
  malformed_prefix[malformed_prefix.size() - 1] = -1.0;
  ExpectNoMutation(invalid_prefix, [&] {
    assert(invalid_prefix.PrependHistory(malformed_prefix.data(),
                                         malformed_prefix.size()) ==
           UpdateStatus::kInvalidInput);
  });

  ChartEngine empty;
  ExpectContentMutation(empty, [&] {
    assert(empty.PrependHistory(fixture::kHistory.data(), prefix_values) ==
           UpdateStatus::kApplied);
  });
  assert(empty.CandleCount() == kPrefixCandles);

  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateCandle(fixture::kFinalCandle.data(),
                               fixture::kFinalCandle.size()) ==
           UpdateStatus::kApplied);
  });
  ExpectNoMutation(engine, [&] {
    assert(engine.UpdateCandle(fixture::kHistory.data(), kCandleWidth) ==
           UpdateStatus::kIgnoredOldTimestamp);
  });
  assert(engine.CandleCount() == fixture::kHistoryCandleCount + 1);
  ExpectCandle(engine.CandleAt(engine.CandleCount() - 1),
               fixture::kFinalCandle.data());
}

void TestSetHistoryValidationIsAtomic() {
  ChartEngine engine;
  SeedHistory(engine);

  std::vector<double> duplicate_timestamp(fixture::kHistory.begin(),
                                          fixture::kHistory.end());
  const size_t last = duplicate_timestamp.size() - kCandleWidth;
  duplicate_timestamp[last] = duplicate_timestamp[last - kCandleWidth];
  ExpectNoMutation(engine, [&] {
    assert(engine.SetHistory(duplicate_timestamp.data(),
                             duplicate_timestamp.size()) ==
           UpdateStatus::kInvalidInput);
  });

  std::vector<double> invalid_ohlc(fixture::kHistory.begin(),
                                   fixture::kHistory.end());
  invalid_ohlc[2] = invalid_ohlc[1] - 1.0;
  ExpectNoMutation(engine, [&] {
    assert(engine.SetHistory(invalid_ohlc.data(), invalid_ohlc.size()) ==
           UpdateStatus::kInvalidInput);
  });
  ExpectNoMutation(engine, [&] {
    assert(engine.SetHistory(fixture::kHistory.data(),
                             fixture::kHistory.size() - 1) ==
           UpdateStatus::kInvalidInput);
  });
  ExpectNoMutation(engine, [&] {
    assert(engine.SetHistory(nullptr, kCandleWidth) ==
           UpdateStatus::kInvalidInput);
  });
  assert(engine.CandleCount() == fixture::kHistoryCandleCount);
  ExpectCandle(engine.CandleAt(0), fixture::kHistory.data());
  ExpectCandle(
      engine.CandleAt(engine.CandleCount() - 1),
      fixture::kHistory.data() + fixture::kHistory.size() - kCandleWidth);

  constexpr size_t kReplacementCandles = 120;
  const size_t replacement_offset =
      (fixture::kHistoryCandleCount - kReplacementCandles) * kCandleWidth;
  ExpectContentMutation(engine, [&] {
    assert(engine.SetHistory(fixture::kHistory.data() + replacement_offset,
                             kReplacementCandles * kCandleWidth) ==
           UpdateStatus::kApplied);
  });
  assert(engine.CandleCount() == kReplacementCandles);
  ExpectCandle(engine.CandleAt(0),
               fixture::kHistory.data() + replacement_offset);

  ExpectContentMutation(engine, [&] {
    assert(engine.SetHistory(nullptr, 0) == UpdateStatus::kApplied);
  });
  assert(engine.CandleCount() == 0);
  ExpectContentMutation(engine, [&] {
    assert(engine.SetHistory(nullptr, 0) == UpdateStatus::kApplied);
  });
}

void TestUpdateCandleReplacementAndValidation() {
  ChartEngine engine;
  SeedHistory(engine);

  assert(fixture::kKlineUpdateCount >= 2);
  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateCandle(fixture::kKlineUpdates.data(), kCandleWidth) ==
           UpdateStatus::kApplied);
  });
  assert(engine.CandleCount() == fixture::kHistoryCandleCount + 1);
  ExpectCandle(engine.CandleAt(engine.CandleCount() - 1),
               fixture::kKlineUpdates.data());

  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateCandle(fixture::kKlineUpdates.data() + kCandleWidth,
                               kCandleWidth) == UpdateStatus::kApplied);
  });
  assert(engine.CandleCount() == fixture::kHistoryCandleCount + 1);
  ExpectCandle(engine.CandleAt(engine.CandleCount() - 1),
               fixture::kKlineUpdates.data() + kCandleWidth);

  std::array<double, kCandleWidth> invalid;
  std::copy_n(fixture::kKlineUpdates.data() + 2 * kCandleWidth, kCandleWidth,
              invalid.begin());
  invalid[3] = invalid[2] + 1.0;
  ExpectNoMutation(engine, [&] {
    assert(engine.UpdateCandle(invalid.data(), invalid.size()) ==
           UpdateStatus::kInvalidInput);
  });
  ExpectNoMutation(engine, [&] {
    assert(engine.UpdateCandle(fixture::kFinalCandle.data(),
                               fixture::kFinalCandle.size() - 1) ==
           UpdateStatus::kInvalidInput);
  });
  ExpectNoMutation(engine, [&] {
    assert(engine.UpdateCandle(nullptr, kCandleWidth) ==
           UpdateStatus::kInvalidInput);
  });
  ExpectNoMutation(engine, [&] {
    assert(engine.UpdateCandle(fixture::kHistory.data(), kCandleWidth) ==
           UpdateStatus::kIgnoredOldTimestamp);
  });

  for (size_t update = 2; update < fixture::kKlineUpdateCount; ++update) {
    assert(engine.UpdateCandle(
               fixture::kKlineUpdates.data() + update * kCandleWidth,
               kCandleWidth) == UpdateStatus::kApplied);
  }
  ExpectCandle(engine.CandleAt(engine.CandleCount() - 1),
               fixture::kFinalCandle.data());
  ExpectSnapshotSafe(*engine.Snapshot());
}

void TestClearAndCandleReads() {
  ChartEngine engine;
  SeedHistory(engine);

  std::vector<Candle> copy = engine.Candles();
  assert(copy.size() == fixture::kHistoryCandleCount);
  ExpectCandle(copy.front(), fixture::kHistory.data());
  ExpectCandle(copy.back(), fixture::kHistory.data() +
                                fixture::kHistory.size() - kCandleWidth);
  copy.front().close = 0.0;
  ExpectCandle(engine.CandleAt(0), fixture::kHistory.data());
  const Candle missing = engine.CandleAt(engine.CandleCount());
  ExpectNear(missing.timestamp, 0.0);
  ExpectNear(missing.open, 0.0);
  ExpectNear(missing.high, 0.0);
  ExpectNear(missing.low, 0.0);
  ExpectNear(missing.close, 0.0);
  ExpectNear(missing.volume, 0.0);

  PriceLine line;
  line.id = "persisted";
  line.label = "Persisted after clear";
  line.price = fixture::kHistory[fixture::kHistory.size() - 2];
  assert(engine.SetPriceLine(line));
  engine.SetCrosshair(true, 600.0F, 260.0F);
  assert(engine.Snapshot()->crosshair_visible);

  ExpectContentMutation(engine, [&] { engine.Clear(); });
  assert(engine.CandleCount() == 0);
  assert(engine.Candles().empty());
  assert(engine.PriceLineCount() == 1);
  const auto cleared = engine.Snapshot();
  assert(!cleared->has_visible_candles);
  assert(!cleared->crosshair_visible);
  assert(cleared->total_candle_count == 0);

  ExpectContentMutation(engine, [&] { engine.Clear(); });
  assert(engine.PriceLineCount() == 1);
  ExpectContentMutation(engine, [&] {
    assert(
        engine.SetHistory(fixture::kHistory.data(), fixture::kHistory.size()) ==
        UpdateStatus::kApplied);
  });
  assert(engine.CandleCount() == fixture::kHistoryCandleCount);
  assert(engine.PriceLineCount() == 1);
  ExpectSnapshotSafe(*engine.Snapshot());
}

}  // namespace

int main() noexcept {
  try {
    TestFixtureIntegrityAndExchangeOracle();
    TestTradeBatchingAndKlineReplayConverge();
    TestInvalidBatchesAreAtomic();
    TestOldShuffledAndEqualTimestampTrades();
    TestRealHistoryStateMutationContract();
    TestHistoryPrependAndCandleUpdatesUseFixture();
    TestSetHistoryValidationIsAtomic();
    TestUpdateCandleReplacementAndValidation();
    TestClearAndCandleReads();
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
  std::cout << "Binance BTCUSDT replay tests passed\n";
  return 0;
}
