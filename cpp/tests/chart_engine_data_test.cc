// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <cassert>
#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <iterator>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/trading_time.h"
#include "cpp/tests/chart_engine_test_access.h"
#include "cpp/tests/chart_engine_test_helpers.h"
#include "cpp/tests/chart_engine_test_suites.h"

namespace trading_charts::test {

namespace {

double UtcMilliseconds(int year, int month, int day, int hour = 0,
                       int minute = 0) {
  return static_cast<double>(trading_charts::internal::DaysFromCivil(
             trading_charts::CivilDate{year, month, day})) *
             static_cast<double>(
                 trading_charts::internal::kMillisecondsPerDay) +
         static_cast<double>((hour * 60 + minute) * 60 * 1000);
}

void TestTradeAggregation() {
  ChartEngine engine;
  ChartConfig config =
      ExplicitResolution(trading_charts::ResolutionUnit::kMinute);
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

void TestFixedResolutionAggregation() {
  ChartEngine engine;
  engine.SetConfig(FixedResolution(250));

  const double first[] = {124.0, 10.0, 1.0};
  const double second[] = {249.0, 11.0, 2.0};
  const double third[] = {250.0, 12.0, 3.0};
  assert(engine.UpdateTrade(first, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(second, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(third, 3) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 2);
  ExpectNear(engine.CandleAt(0).timestamp, 0.0);
  ExpectNear(engine.CandleAt(0).close, 11.0);
  ExpectNear(engine.CandleAt(1).timestamp, 250.0);
}

void TestCustomBucketOrigin() {
  ChartEngine engine;
  ChartConfig config =
      ExplicitResolution(trading_charts::ResolutionUnit::kHour);
  config.trade_aggregation.bucket_origin =
      trading_charts::BucketOrigin::kTimestamp;
  config.trade_aggregation.origin_timestamp_ms = 30LL * 60 * 1000;
  engine.SetConfig(config);

  const double first[] = {60.0 * 60.0 * 1000.0, 10.0, 1.0};
  const double second[] = {89.0 * 60.0 * 1000.0, 12.0, 2.0};
  const double third[] = {90.0 * 60.0 * 1000.0, 13.0, 3.0};
  assert(engine.UpdateTrade(first, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(second, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(third, 3) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 2);
  ExpectNear(engine.CandleAt(0).timestamp, 30.0 * 60.0 * 1000.0);
  ExpectNear(engine.CandleAt(1).timestamp, 90.0 * 60.0 * 1000.0);
}

ChartConfig WeekdaySessionConfig(trading_charts::ResolutionUnit unit) {
  ChartConfig config = ExplicitResolution(unit);
  auto& calendar = config.trade_aggregation.calendar;
  calendar.configured = true;
  calendar.time_zone = "UTC";
  calendar.transitions = {{0, 0}};
  calendar.sessions = {{
      0b00011111,
      9 * 3600 + 30 * 60,
      16 * 3600,
      0,
      0,
  }};
  config.trade_aggregation.bucket_origin =
      trading_charts::BucketOrigin::kSession;
  return config;
}

void TestSessionAlignedBucketsAndExclusiveClose() {
  ChartEngine engine;
  engine.SetConfig(WeekdaySessionConfig(trading_charts::ResolutionUnit::kHour));
  const double before_open[] = {UtcMilliseconds(2026, 8, 3, 9, 29), 9.0, 1.0};
  const double at_open[] = {UtcMilliseconds(2026, 8, 3, 9, 30), 10.0, 1.0};
  const double first_end[] = {UtcMilliseconds(2026, 8, 3, 10, 29), 12.0, 1.0};
  const double next[] = {UtcMilliseconds(2026, 8, 3, 10, 30), 13.0, 1.0};
  const double at_close[] = {UtcMilliseconds(2026, 8, 3, 16, 0), 14.0, 1.0};
  ExpectNoRenderMutation(engine, [&] {
    assert(engine.UpdateTrade(before_open, 3) ==
           UpdateStatus::kIgnoredOutsideSession);
  });
  assert(engine.UpdateTrade(at_open, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(first_end, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(next, 3) == UpdateStatus::kApplied);
  ExpectNoRenderMutation(engine, [&] {
    assert(engine.UpdateTrade(at_close, 3) ==
           UpdateStatus::kIgnoredOutsideSession);
  });
  const double older_after_ignored[] = {UtcMilliseconds(2026, 8, 3, 15, 0),
                                        15.0, 1.0};
  ExpectNoRenderMutation(engine, [&] {
    assert(engine.UpdateTrade(older_after_ignored, 3) ==
           UpdateStatus::kIgnoredOldTimestamp);
  });
  assert(engine.CandleCount() == 2);
  ExpectNear(engine.CandleAt(0).timestamp, UtcMilliseconds(2026, 8, 3, 9, 30));
  ExpectNear(engine.CandleAt(1).timestamp, UtcMilliseconds(2026, 8, 3, 10, 30));
}

void TestHolidayAndEarlyCloseOverride() {
  ChartEngine engine;
  ChartConfig config =
      WeekdaySessionConfig(trading_charts::ResolutionUnit::kMinute);
  config.trade_aggregation.calendar.holidays = {{2026, 8, 3}};
  trading_charts::TradingCalendarOverrideConfig early_close;
  early_close.date = {2026, 8, 4};
  early_close.sessions = {{0, 9 * 3600 + 30 * 60, 13 * 3600, 0, 0}};
  config.trade_aggregation.calendar.overrides = {early_close};
  engine.SetConfig(config);

  const double holiday[] = {UtcMilliseconds(2026, 8, 3, 10, 0), 10.0, 1.0};
  const double before_close[] = {UtcMilliseconds(2026, 8, 4, 12, 59), 11.0,
                                 1.0};
  const double after_close[] = {UtcMilliseconds(2026, 8, 4, 13, 1), 12.0, 1.0};
  assert(engine.UpdateTrade(holiday, 3) ==
         UpdateStatus::kIgnoredOutsideSession);
  assert(engine.UpdateTrade(before_close, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(after_close, 3) ==
         UpdateStatus::kIgnoredOutsideSession);
  assert(engine.CandleCount() == 1);
}

void TestHolidayAppliesToCalendarWithoutRecurringSessions() {
  ChartEngine engine;
  ChartConfig config = ExplicitResolution(trading_charts::ResolutionUnit::kDay);
  auto& calendar = config.trade_aggregation.calendar;
  calendar.configured = true;
  calendar.time_zone = "UTC";
  calendar.transitions = {{0, 0}};
  calendar.holidays = {{2026, 8, 3}};
  engine.SetConfig(config);

  const double holiday[] = {UtcMilliseconds(2026, 8, 3, 12, 0), 10.0, 1.0};
  const double next_day[] = {UtcMilliseconds(2026, 8, 4, 12, 0), 11.0, 1.0};
  assert(engine.UpdateTrade(holiday, 3) ==
         UpdateStatus::kIgnoredOutsideSession);
  assert(engine.UpdateTrade(next_day, 3) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 1);
  ExpectNear(engine.CandleAt(0).timestamp, UtcMilliseconds(2026, 8, 4));
}

void TestDstSessionBucketsUseUtcTransitions() {
  ChartEngine engine;
  ChartConfig config =
      ExplicitResolution(trading_charts::ResolutionUnit::kHour);
  auto& calendar = config.trade_aggregation.calendar;
  calendar.configured = true;
  calendar.time_zone = "America/New_York";
  calendar.transitions = {
      {0, -5 * 3600},
      {static_cast<std::int64_t>(UtcMilliseconds(2024, 3, 10, 7, 0)),
       -4 * 3600},
  };
  calendar.sessions = {{
      0b01000000,
      1 * 3600,
      4 * 3600,
      0,
      0,
  }};
  config.trade_aggregation.bucket_origin =
      trading_charts::BucketOrigin::kSession;
  engine.SetConfig(config);

  const double before_jump[] = {UtcMilliseconds(2024, 3, 10, 6, 30), 10.0, 1.0};
  const double after_jump[] = {UtcMilliseconds(2024, 3, 10, 7, 30), 11.0, 1.0};
  assert(engine.UpdateTrade(before_jump, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(after_jump, 3) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 2);
  ExpectNear(engine.CandleAt(0).timestamp, UtcMilliseconds(2024, 3, 10, 6, 0));
  ExpectNear(engine.CandleAt(1).timestamp, UtcMilliseconds(2024, 3, 10, 7, 0));
}

void TestCalendarMonthBucketsAreNotThirtyDays() {
  ChartEngine engine;
  ChartConfig config =
      ExplicitResolution(trading_charts::ResolutionUnit::kMonth);
  config.trade_aggregation.candle_timestamp =
      trading_charts::CandleTimestampPolicy::kTradingDateUtc;
  engine.SetConfig(config);
  const double january[] = {UtcMilliseconds(2024, 1, 31, 12, 0), 10.0, 1.0};
  const double february[] = {UtcMilliseconds(2024, 2, 29, 12, 0), 11.0, 1.0};
  const double march[] = {UtcMilliseconds(2024, 3, 1, 0, 0), 12.0, 1.0};
  assert(engine.UpdateTrade(january, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(february, 3) == UpdateStatus::kApplied);
  assert(engine.UpdateTrade(march, 3) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 3);
  ExpectNear(engine.CandleAt(0).timestamp, UtcMilliseconds(2024, 1, 1));
  ExpectNear(engine.CandleAt(1).timestamp, UtcMilliseconds(2024, 2, 1));
  ExpectNear(engine.CandleAt(2).timestamp, UtcMilliseconds(2024, 3, 1));
}

void TestCalendarWeekRespectsConfiguredWeekStart() {
  const double sunday[] = {UtcMilliseconds(2026, 8, 2, 12, 0), 10.0, 1.0};
  const double monday[] = {UtcMilliseconds(2026, 8, 3, 12, 0), 11.0, 1.0};

  ChartConfig monday_config =
      ExplicitResolution(trading_charts::ResolutionUnit::kWeek);
  monday_config.trade_aggregation.candle_timestamp =
      trading_charts::CandleTimestampPolicy::kTradingDateUtc;
  ChartEngine monday_engine;
  monday_engine.SetConfig(monday_config);
  assert(monday_engine.UpdateTrade(sunday, 3) == UpdateStatus::kApplied);
  assert(monday_engine.UpdateTrade(monday, 3) == UpdateStatus::kApplied);
  assert(monday_engine.CandleCount() == 2);
  ExpectNear(monday_engine.CandleAt(0).timestamp, UtcMilliseconds(2026, 7, 27));
  ExpectNear(monday_engine.CandleAt(1).timestamp, UtcMilliseconds(2026, 8, 3));

  ChartConfig sunday_config = monday_config;
  sunday_config.trade_aggregation.calendar.week_starts_on = 7;
  ChartEngine sunday_engine;
  sunday_engine.SetConfig(sunday_config);
  assert(sunday_engine.UpdateTrade(sunday, 3) == UpdateStatus::kApplied);
  assert(sunday_engine.UpdateTrade(monday, 3) == UpdateStatus::kApplied);
  assert(sunday_engine.CandleCount() == 1);
  ExpectNear(sunday_engine.CandleAt(0).timestamp, UtcMilliseconds(2026, 8, 2));
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

void TestMixedTradeBatchReportsAppliedChange() {
  ChartEngine engine;
  const double first[] = {1000.0, 10.0, 1.0};
  assert(engine.UpdateTrade(first, 3) == UpdateStatus::kApplied);

  // The old record is ignored, but the newer record mutates the current
  // candle. The aggregate status must still request a native frame.
  const double mixed[] = {
      999.0, 8.0, 1.0, 1001.0, 12.0, 2.0,
  };
  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateTrades(mixed, 6) == UpdateStatus::kApplied);
  });
  ExpectNear(engine.CandleAt(0).close, 12.0);
  ExpectNear(engine.CandleAt(0).volume, 3.0);
}

void TestRejectedTradeBatchDoesNotPartiallyMutate() {
  ChartEngine engine;
  ChartConfig config =
      WeekdaySessionConfig(trading_charts::ResolutionUnit::kHour);
  config.trade_aggregation.outside_session =
      trading_charts::OutsideSessionPolicy::kReject;
  engine.SetConfig(config);

  const auto snapshot = engine.Snapshot();
  const uint64_t revision = engine.Revision();
  const double trades[] = {
      UtcMilliseconds(2026, 8, 3, 10, 0), 10.0, 1.0,
      UtcMilliseconds(2026, 8, 3, 16, 0), 12.0, 1.0,
  };

  assert(engine.UpdateTrades(trades, std::size(trades)) ==
         UpdateStatus::kInvalidInput);
  assert(engine.CandleCount() == 0);
  assert(engine.Revision() == revision);
  assert(engine.Snapshot() == snapshot);
}

void TestRejectedTradeBatchStillIgnoresOldTimestamps() {
  ChartEngine engine;
  ChartConfig config =
      WeekdaySessionConfig(trading_charts::ResolutionUnit::kHour);
  config.trade_aggregation.outside_session =
      trading_charts::OutsideSessionPolicy::kReject;
  engine.SetConfig(config);

  const double initial[] = {
      UtcMilliseconds(2026, 8, 3, 10, 0),
      10.0,
      1.0,
  };
  assert(engine.UpdateTrade(initial, std::size(initial)) ==
         UpdateStatus::kApplied);
  const double trades[] = {
      UtcMilliseconds(2026, 8, 3, 9, 0),  8.0,  1.0,
      UtcMilliseconds(2026, 8, 3, 11, 0), 12.0, 1.0,
  };

  assert(engine.UpdateTrades(trades, std::size(trades)) ==
         UpdateStatus::kApplied);
  assert(engine.CandleCount() == 2);
  ExpectNear(engine.CandleAt(1).close, 12.0);
}

void TestMutationScopePublishesOnEveryExitPath() {
  ChartEngine engine;
  engine.SetSize(320.0F, 240.0F);
  const double history[] = {0.0, 10.0, 12.0, 9.0, 11.0, 1.0};
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);

  ExpectNoRenderMutation(engine, [&] {
    trading_charts::ChartEngineTestAccess::ExitWithoutMutation(engine);
  });
  ExpectContentMutation(engine, [&] {
    trading_charts::ChartEngineTestAccess::ExitAfterContentMutation(engine);
  });
  ExpectOverlayMutation(engine, [&] {
    trading_charts::ChartEngineTestAccess::ExitAfterOverlayMutation(engine);
  });
  ExpectContentMutation(engine, [&] {
    trading_charts::ChartEngineTestAccess::PromoteOverlayToContent(engine);
  });

  bool caught = false;
  ExpectContentMutation(engine, [&] {
    try {
      trading_charts::ChartEngineTestAccess::ThrowAfterContentMutation(engine);
    } catch (const std::runtime_error&) {
      caught = true;
    }
  });
  assert(caught);
}

void TestConfigurationAndPresentationMutationContract() {
  ChartEngine engine;

  ChartConfig config;
  config.initial_visible_count = 4;
  ExpectContentMutation(engine, [&] { engine.SetConfig(config); });

  trading_charts::TradingCalendarConfig calendar;
  calendar.configured = true;
  ExpectContentMutation(engine, [&] { engine.SetTradingCalendar(calendar); });

  PaneConfig secondary;
  secondary.pane_id = "secondary";
  secondary.price_scale_id = "secondary";
  secondary.min_height = 20.0F;
  ExpectContentMutation(
      engine, [&] { engine.SetPanes({PaneConfig{}, secondary}, true); });
  ExpectContentMutation(
      engine, [&] { assert(engine.SetPaneHeight("secondary", 2.0)); });
  ExpectNoRenderMutation(
      engine, [&] { assert(!engine.SetPaneHeight("secondary", 2.0)); });

  ExpectContentMutation(engine, [&] { engine.SetSize(400.0F, 320.0F); });
  ExpectNoRenderMutation(engine, [&] { engine.SetSize(400.0F, 320.0F); });
  ExpectContentMutation(engine,
                        [&] { assert(engine.ResizePaneSeparator(0, 12.0F)); });
  ExpectNoRenderMutation(
      engine, [&] { assert(!engine.ResizePaneSeparator(9, 12.0F)); });

  PriceLine line;
  line.id = "entry";
  line.price = 100.0;
  line.label = "Entry";
  ExpectContentMutation(engine, [&] { assert(engine.SetPriceLine(line)); });
  ExpectNoRenderMutation(engine, [&] { assert(!engine.SetPriceLine(line)); });
  line.price = 101.0;
  ExpectContentMutation(engine, [&] { assert(engine.SetPriceLine(line)); });
  ExpectContentMutation(engine,
                        [&] { assert(engine.RemovePriceLine("entry")); });
  ExpectNoRenderMutation(engine,
                         [&] { assert(!engine.RemovePriceLine("entry")); });
  assert(engine.SetPriceLine(line));
  ExpectContentMutation(engine, [&] { assert(engine.ClearPriceLines()); });
  ExpectNoRenderMutation(engine, [&] { assert(!engine.ClearPriceLines()); });
}

void TestSeriesMutationContract() {
  ChartEngine engine;
  SeriesConfig series;
  series.series_id = "comparison";
  series.type = SeriesType::kLine;

  ExpectContentMutation(engine, [&] {
    assert(engine.AddSeries(series) == UpdateStatus::kApplied);
  });
  ExpectNoRenderMutation(engine, [&] {
    assert(engine.AddSeries(series) == UpdateStatus::kInvalidInput);
  });

  const double initial[] = {60000.0, 10.0, 12.0, 9.0, 11.0, 1.0};
  ExpectContentMutation(engine, [&] {
    assert(engine.SetSeriesData("comparison", initial, std::size(initial),
                                false) == UpdateStatus::kApplied);
  });
  const double older[] = {0.0, 9.0, 11.0, 8.0, 10.0, 1.0};
  ExpectContentMutation(engine, [&] {
    assert(engine.PrependSeriesData("comparison", older, std::size(older),
                                    false) == UpdateStatus::kApplied);
  });
  const double newer[] = {120000.0, 11.0, 13.0, 10.0, 12.0, 1.0};
  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateSeriesData("comparison", newer, std::size(newer),
                                   false) == UpdateStatus::kApplied);
  });
  ExpectNoRenderMutation(engine, [&] {
    assert(
        engine.UpdateSeriesData("comparison", older, std::size(older), false) ==
        UpdateStatus::kIgnoredOldTimestamp);
  });
  ExpectContentMutation(engine,
                        [&] { assert(engine.RemoveSeries("comparison")); });
  ExpectNoRenderMutation(engine,
                         [&] { assert(!engine.RemoveSeries("comparison")); });
}

void TestMarketDataMutationContract() {
  ChartEngine engine;
  const double history[] = {
      60000.0,  10.0, 12.0, 9.0,  11.0, 1.0,
      120000.0, 11.0, 13.0, 10.0, 12.0, 1.0,
  };
  ExpectContentMutation(engine, [&] {
    assert(engine.SetHistory(history, std::size(history)) ==
           UpdateStatus::kApplied);
  });
  ExpectNoRenderMutation(engine, [&] {
    assert(engine.PrependHistory(nullptr, 0) == UpdateStatus::kApplied);
  });

  const double older[] = {0.0, 9.0, 11.0, 8.0, 10.0, 1.0};
  ExpectContentMutation(engine, [&] {
    assert(engine.PrependHistory(older, std::size(older)) ==
           UpdateStatus::kApplied);
  });
  const double replacement[] = {
      120000.0, 11.0, 14.0, 10.0, 13.0, 2.0,
  };
  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateCandle(replacement, std::size(replacement)) ==
           UpdateStatus::kApplied);
  });
  ExpectNoRenderMutation(engine, [&] {
    assert(engine.UpdateCandle(older, std::size(older)) ==
           UpdateStatus::kIgnoredOldTimestamp);
  });

  const double trade[] = {121000.0, 15.0, 1.0};
  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateTrade(trade, std::size(trade)) ==
           UpdateStatus::kApplied);
  });
  const double trades[] = {
      122000.0, 14.0, 1.0, 180000.0, 16.0, 1.0,
  };
  ExpectContentMutation(engine, [&] {
    assert(engine.UpdateTrades(trades, std::size(trades)) ==
           UpdateStatus::kApplied);
  });
  ExpectNoRenderMutation(engine, [&] {
    assert(engine.UpdateTrades(nullptr, 0) == UpdateStatus::kApplied);
  });
  const double invalid[] = {240000.0, 17.0, -1.0};
  ExpectNoRenderMutation(engine, [&] {
    assert(engine.UpdateTrades(invalid, std::size(invalid)) ==
           UpdateStatus::kInvalidInput);
  });
  const double ignored[] = {
      60'000.0, 9.0, 1.0, 120'000.0, 10.0, 1.0,
  };
  ExpectNoRenderMutation(engine, [&] {
    assert(engine.UpdateTrades(ignored, std::size(ignored)) ==
           UpdateStatus::kIgnoredOldTimestamp);
  });
  ExpectContentMutation(engine, [&] { engine.Clear(); });
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

void TestAcceptsFeedDefinedCandleTimestamps() {
  ChartEngine engine;
  const double history[] = {
      1000.0, 10.0, 12.0, 9.0, 11.0, 4.0, 61000.0, 11.0, 13.0, 10.0, 12.0, 5.0,
  };
  const double older[] = {17.0, 9.0, 11.0, 8.0, 10.0, 3.0};
  const double next[] = {121123.0, 12.0, 14.0, 11.0, 13.0, 6.0};
  assert(engine.SetHistory(history, 12) == UpdateStatus::kApplied);
  assert(engine.PrependHistory(older, 6) == UpdateStatus::kApplied);
  assert(engine.UpdateCandle(next, 6) == UpdateStatus::kApplied);
  assert(engine.CandleCount() == 4);
  ExpectNear(engine.CandleAt(0).timestamp, 17.0);
  ExpectNear(engine.CandleAt(3).timestamp, 121123.0);
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
  assert(!ContentOf(*snapshot).empty());
  // Geometry remains capped by LOD instead of growing linearly with 50k
  // candles.
  assert(ContentOf(*snapshot).size() < 1500000);
}

void TestClearPreservesChartDefinitions() {
  ChartEngine engine;
  engine.SetSize(400.0f, 300.0f);
  const double history[] = {
      0.0,     100.0, 110.0, 90.0,  105.0, 1.0,
      60000.0, 105.0, 115.0, 100.0, 110.0, 2.0,
  };
  SeriesConfig runtime;
  runtime.series_id = "runtime";
  runtime.type = SeriesType::kLine;
  assert(engine.AddSeries(runtime) == UpdateStatus::kApplied);
  assert(engine.SetSeriesData(runtime.series_id, history, std::size(history),
                              false) == UpdateStatus::kApplied);
  PriceLine line;
  line.id = "marker";
  line.label = "Marker";
  line.price = 105.0;
  assert(engine.SetPriceLine(line));
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);

  ExpectContentMutation(engine, [&] { engine.Clear(); });
  assert(engine.CandleCount() == 0);
  assert(trading_charts::ChartEngineTestAccess::SeriesCandles(engine, "runtime")
             .empty());
  assert(engine.PriceLineCount() == 1);
  assert(engine.Snapshot()->price_lines.empty());
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  assert(engine.Snapshot()->price_lines.size() == 1);
  // The public data-only clear must leave the runtime definition usable.
  assert(engine.SetSeriesData(runtime.series_id, history, std::size(history),
                              false) == UpdateStatus::kApplied);
}

void TestResetForReuseStartsNewChart() {
  ChartEngine engine;
  engine.SetSize(400.0f, 300.0f);
  ChartConfig config;
  config.logical_spacing = true;
  config.default_scale = 2.0;
  config.default_y_scale = 2.0;
  engine.SetConfig(config);
  PaneConfig extra;
  extra.pane_id = "extra";
  extra.price_scale_id = "extra";
  engine.SetPanes({PaneConfig{}, extra}, true);
  assert(engine.SetPaneHeight("extra", 3.0));
  SeriesConfig runtime;
  runtime.series_id = "runtime";
  runtime.type = SeriesType::kLine;
  assert(engine.AddSeries(runtime) == UpdateStatus::kApplied);
  SeriesConfig derived = runtime;
  derived.series_id = "derived";
  derived.source = SeriesSource::kOhlcvSma;
  derived.source_series_id = "main";
  derived.declarative = true;
  assert(engine.AddSeries(derived) == UpdateStatus::kApplied);
  const double history[] = {
      0.0,     100.0, 110.0, 90.0,  105.0, 1.0,
      60000.0, 105.0, 115.0, 100.0, 110.0, 2.0,
  };
  assert(engine.SetHistory(history, std::size(history)) ==
         UpdateStatus::kApplied);
  assert(engine.SetSeriesData(runtime.series_id, history, std::size(history),
                              false) == UpdateStatus::kApplied);
  PriceLine line;
  line.id = "old-chart";
  line.label = "Old chart";
  line.price = 110.0;
  assert(engine.SetPriceLine(line));
  engine.SetCrosshair(true, 200.0f, 50.0f);
  const auto old_snapshot = engine.Snapshot();
  assert(old_snapshot->crosshair_visible);
  assert(old_snapshot->price_lines.size() == 1);
  const auto old_vertices = *old_snapshot->content_vertices;

  ExpectContentMutation(engine, [&] { engine.ResetForReuse(); });
  const auto empty = engine.Snapshot();
  assert(engine.Candles().empty());
  assert(engine.PriceLines().empty());
  assert(!empty->has_visible_candles && !empty->crosshair_visible);
  assert(empty->price_lines.empty() && empty->overlay_vertices.empty());
  assert(empty->width == 400.0f && empty->height == 300.0f);
  assert(!empty->config.logical_spacing);
  ExpectNear(empty->config.default_scale, 1.0);
  ExpectNear(empty->config.default_y_scale, 1.0);
  ExpectNoRenderMutation(engine, [&] {
    assert(!engine.RemoveSeries("runtime"));
    assert(!engine.RemoveSeries("derived"));
    assert(!engine.SetPaneHeight("extra", 2.0));
    assert(!engine.ResizePaneSeparator(0, 10.0f));
    assert(engine.SetSeriesData("runtime", history, std::size(history),
                                false) == UpdateStatus::kInvalidInput);
  });

  // Reapply identical props and new history, as Fabric does for another chart.
  ChartEngine fresh;
  fresh.SetSize(400.0f, 300.0f);
  for (ChartEngine* chart : {&engine, &fresh}) {
    chart->SetConfig(config);
    chart->SetPanes({PaneConfig{}, extra}, true);
    assert(chart->AddSeries(derived) == UpdateStatus::kApplied);
    assert(chart->SetHistory(history, std::size(history)) ==
           UpdateStatus::kApplied);
    chart->SetCrosshair(true, 200.0f, 50.0f);
  }
  const auto reused = engine.Snapshot();
  const auto expected = fresh.Snapshot();
  assert(reused->price_lines.empty());
  assert(reused->crosshair_series_values.size() == 1);
  assert(reused->crosshair_series_values.front().series_id == "derived");
  ExpectNear(reused->panes[1].height_weight, 1.0);
  ExpectNear(reused->visible_x_min, expected->visible_x_min);
  ExpectNear(reused->visible_x_max, expected->visible_x_max);
  assert(*reused->content_vertices == *expected->content_vertices);
  assert(reused->overlay_vertices == expected->overlay_vertices);
  assert(old_snapshot->price_lines.front().id == "old-chart");
  assert(*old_snapshot->content_vertices == old_vertices);

  // Reusing the same IDs and receiving older trades must work in a new
  // lifetime.
  assert(engine.AddSeries(runtime) == UpdateStatus::kApplied);
  const double newer_trade[] = {120000.0, 111.0, 1.0};
  assert(engine.UpdateTrade(newer_trade, std::size(newer_trade)) ==
         UpdateStatus::kApplied);
  ExpectContentMutation(engine, [&] { engine.ResetForReuse(); });
  const double older_trade[] = {0.0, 50.0, 1.0};
  assert(engine.UpdateTrade(older_trade, std::size(older_trade)) ==
         UpdateStatus::kApplied);
  assert(engine.CandleCount() == 1);
  ExpectNear(engine.CandleAt(0).close, 50.0);
}

}  // namespace

void RunDataTests() {
  TestTradeAggregation();
  TestFixedResolutionAggregation();
  TestCustomBucketOrigin();
  TestSessionAlignedBucketsAndExclusiveClose();
  TestHolidayAndEarlyCloseOverride();
  TestHolidayAppliesToCalendarWithoutRecurringSessions();
  TestDstSessionBucketsUseUtcTransitions();
  TestCalendarMonthBucketsAreNotThirtyDays();
  TestCalendarWeekRespectsConfiguredWeekStart();
  TestBucketTransitionAndNoGaps();
  TestMixedTradeBatchReportsAppliedChange();
  TestRejectedTradeBatchDoesNotPartiallyMutate();
  TestRejectedTradeBatchStillIgnoresOldTimestamps();
  TestMutationScopePublishesOnEveryExitPath();
  TestConfigurationAndPresentationMutationContract();
  TestSeriesMutationContract();
  TestMarketDataMutationContract();
  TestHistoryContinuation();
  TestPrependHistoryPreservesViewport();
  TestCandlesReturnsAtomicCopyOfCurrentStore();
  TestPrependHistoryRejectsOverlap();
  TestOldTradeIgnored();
  TestAcceptsFeedDefinedCandleTimestamps();
  TestTradeBatchMatchesSingles();
  TestReadyCandleFeed();
  TestLargeHistoryAndTradeBurst();
  TestClearPreservesChartDefinitions();
  TestResetForReuseStartsNewChart();
}

}  // namespace trading_charts::test
