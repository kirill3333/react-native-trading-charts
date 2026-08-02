// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/trading_time.h"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <vector>

namespace trading_charts::internal {
namespace {

std::int64_t FloorDivide(std::int64_t value, std::int64_t divisor) {
  const std::int64_t quotient = value / divisor;
  const std::int64_t remainder = value % divisor;
  return remainder < 0 ? quotient - 1 : quotient;
}

int IsoWeekday(std::int64_t days) {
  // 1970-01-01 was Thursday (ISO 4).
  const std::int64_t value = (days + 3) % 7;
  return static_cast<int>(value < 0 ? value + 7 : value) + 1;
}

bool SameDate(const CivilDate& first, const CivilDate& second) {
  return first.year == second.year && first.month == second.month &&
         first.day == second.day;
}

int OffsetAtUtc(const TradingCalendarConfig& calendar,
                std::int64_t timestamp_ms) {
  if (calendar.transitions.empty()) {
    return 0;
  }
  const auto upper = std::upper_bound(
      calendar.transitions.begin(), calendar.transitions.end(), timestamp_ms,
      [](std::int64_t value, const TimeZoneTransition& transition) {
        return value < transition.at_utc_ms;
      });
  return upper == calendar.transitions.begin() ? upper->offset_seconds
                                               : (upper - 1)->offset_seconds;
}

std::optional<std::int64_t> LocalToUtc(const TradingCalendarConfig& calendar,
                                       std::int64_t local_ms,
                                       bool choose_latest) {
  if (!calendar.configured) {
    return local_ms;
  }
  bool found = false;
  std::int64_t selected = 0;
  int previous_offset = std::numeric_limits<int>::min();
  for (const TimeZoneTransition& transition : calendar.transitions) {
    const int offset = transition.offset_seconds;
    if (offset == previous_offset) {
      continue;
    }
    previous_offset = offset;
    const std::int64_t candidate =
        local_ms - static_cast<std::int64_t>(offset) * kMillisecondsPerSecond;
    if (candidate < calendar.transition_range_start_ms ||
        candidate >= calendar.transition_range_end_ms ||
        OffsetAtUtc(calendar, candidate) != offset) {
      continue;
    }
    if (!found ||
        (choose_latest ? candidate > selected : candidate < selected)) {
      selected = candidate;
      found = true;
    }
  }
  if (found) {
    return selected;
  }

  // Compatible disambiguation for a nonexistent local time: shift forward by
  // the UTC-offset gap. Session opens/closes almost never land here, but this
  // keeps DST behavior deterministic for 24-hour calendars.
  for (size_t index = 1; index < calendar.transitions.size(); ++index) {
    const TimeZoneTransition& transition = calendar.transitions[index];
    const int old_offset = calendar.transitions[index - 1].offset_seconds;
    const int new_offset = transition.offset_seconds;
    if (new_offset <= old_offset) {
      continue;
    }
    const std::int64_t local_before =
        transition.at_utc_ms +
        static_cast<std::int64_t>(old_offset) * kMillisecondsPerSecond;
    const std::int64_t local_after =
        transition.at_utc_ms +
        static_cast<std::int64_t>(new_offset) * kMillisecondsPerSecond;
    if (local_ms >= local_before && local_ms < local_after) {
      return local_ms -
             static_cast<std::int64_t>(old_offset) * kMillisecondsPerSecond;
    }
  }
  return std::nullopt;
}

const TradingCalendarOverrideConfig* FindOverride(
    const TradingCalendarConfig& calendar, const CivilDate& date) {
  const auto found = std::lower_bound(
      calendar.overrides.begin(), calendar.overrides.end(), date,
      [](const TradingCalendarOverrideConfig& value,
         const CivilDate& candidate) {
        return DaysFromCivil(value.date) < DaysFromCivil(candidate);
      });
  return found != calendar.overrides.end() && SameDate(found->date, date)
             ? &*found
             : nullptr;
}

bool IsHoliday(const TradingCalendarConfig& calendar, const CivilDate& date) {
  const auto found =
      std::lower_bound(calendar.holidays.begin(), calendar.holidays.end(), date,
                       [](const CivilDate& value, const CivilDate& candidate) {
                         return DaysFromCivil(value) < DaysFromCivil(candidate);
                       });
  return found != calendar.holidays.end() && SameDate(*found, date);
}

struct SessionMatch {
  std::int64_t trading_day = 0;
  std::int64_t start_ms = 0;
  std::int64_t end_ms = 0;
};

bool MatchSegment(const TradingCalendarConfig& calendar,
                  const TradingSessionConfig& segment, std::int64_t trading_day,
                  std::int64_t timestamp_ms, SessionMatch& result) {
  const std::int64_t start_local =
      (trading_day + static_cast<std::int64_t>(segment.start_day_offset)) *
          kMillisecondsPerDay +
      static_cast<std::int64_t>(segment.start_seconds) * kMillisecondsPerSecond;
  const std::int64_t end_local =
      (trading_day + static_cast<std::int64_t>(segment.end_day_offset)) *
          kMillisecondsPerDay +
      static_cast<std::int64_t>(segment.end_seconds) * kMillisecondsPerSecond;
  const std::optional<std::int64_t> start =
      LocalToUtc(calendar, start_local, false);
  const std::optional<std::int64_t> end = LocalToUtc(calendar, end_local, true);
  if (!start.has_value() || !end.has_value() || *end <= *start ||
      timestamp_ms < *start || timestamp_ms >= *end) {
    return false;
  }
  result = SessionMatch{trading_day, *start, *end};
  return true;
}

std::optional<SessionMatch> FindSession(const TradingCalendarConfig& calendar,
                                        std::int64_t timestamp_ms) {
  const int offset = OffsetAtUtc(calendar, timestamp_ms);
  const std::int64_t local_ms =
      timestamp_ms + static_cast<std::int64_t>(offset) * kMillisecondsPerSecond;
  const std::int64_t local_day = FloorDivide(local_ms, kMillisecondsPerDay);
  for (int delta = -2; delta <= 2; ++delta) {
    const std::int64_t trading_day = local_day + delta;
    const CivilDate date = CivilFromDays(trading_day);
    const TradingCalendarOverrideConfig* override =
        FindOverride(calendar, date);
    if (override != nullptr) {
      for (const TradingSessionConfig& segment : override->sessions) {
        SessionMatch result;
        if (MatchSegment(calendar, segment, trading_day, timestamp_ms,
                         result)) {
          return result;
        }
      }
      continue;
    }
    if (IsHoliday(calendar, date)) {
      continue;
    }
    if (calendar.sessions.empty()) {
      SessionMatch result;
      const TradingSessionConfig full_day{0x7FU, 0, 0, 0, 1};
      if (MatchSegment(calendar, full_day, trading_day, timestamp_ms, result)) {
        return result;
      }
      continue;
    }
    const int weekday = IsoWeekday(trading_day);
    const std::uint8_t mask =
        static_cast<std::uint8_t>(1U << static_cast<unsigned>(weekday - 1));
    for (const TradingSessionConfig& segment : calendar.sessions) {
      if ((segment.weekday_mask & mask) == 0U) {
        continue;
      }
      SessionMatch result;
      if (MatchSegment(calendar, segment, trading_day, timestamp_ms, result)) {
        return result;
      }
    }
  }
  return std::nullopt;
}

std::optional<SessionMatch> TradingDayAt(const TradingCalendarConfig& calendar,
                                         std::int64_t timestamp_ms) {
  if (calendar.configured) {
    return FindSession(calendar, timestamp_ms);
  }
  const int offset = OffsetAtUtc(calendar, timestamp_ms);
  const std::int64_t local_ms =
      timestamp_ms + static_cast<std::int64_t>(offset) * kMillisecondsPerSecond;
  const std::int64_t local_day = FloorDivide(local_ms, kMillisecondsPerDay);
  const std::int64_t start_local = local_day * kMillisecondsPerDay;
  const std::optional<std::int64_t> start =
      LocalToUtc(calendar, start_local, false);
  const std::optional<std::int64_t> end =
      LocalToUtc(calendar, start_local + kMillisecondsPerDay, true);
  if (!start.has_value() || !end.has_value()) {
    return std::nullopt;
  }
  return SessionMatch{local_day, *start, *end};
}

std::int64_t CalendarPeriodStart(const Resolution& resolution,
                                 const TradingCalendarConfig& calendar,
                                 std::int64_t trading_day) {
  const std::int64_t multiplier =
      static_cast<std::int64_t>(resolution.multiplier);
  if (resolution.unit == ResolutionUnit::kDay) {
    return FloorDivide(trading_day, multiplier) * multiplier;
  }
  if (resolution.unit == ResolutionUnit::kWeek) {
    const int weekday = IsoWeekday(trading_day);
    const int week_start = calendar.week_starts_on == 7 ? 7 : 1;
    const int distance = (weekday - week_start + 7) % 7;
    const std::int64_t start = trading_day - distance;
    const std::int64_t epoch_week_start =
        -static_cast<std::int64_t>((IsoWeekday(0) - week_start + 7) % 7);
    const std::int64_t group_days = multiplier * 7;
    return epoch_week_start +
           FloorDivide(start - epoch_week_start, group_days) * group_days;
  }
  const CivilDate date = CivilFromDays(trading_day);
  constexpr std::int64_t kEpochMonthIndex = 1970LL * 12LL;
  const std::int64_t month_index =
      static_cast<std::int64_t>(date.year) * 12 + date.month - 1;
  const std::int64_t start_index =
      FloorDivide(month_index - kEpochMonthIndex, multiplier) * multiplier +
      kEpochMonthIndex;
  const std::int64_t year = FloorDivide(start_index, 12);
  const int month = static_cast<int>(start_index - year * 12) + 1;
  return DaysFromCivil(CivilDate{static_cast<int>(year), month, 1});
}

std::int64_t FixedDurationMilliseconds(const Resolution& resolution) {
  const std::int64_t multiplier =
      static_cast<std::int64_t>(resolution.multiplier);
  switch (resolution.unit) {
    case ResolutionUnit::kFixed:
      return resolution.fixed_duration_ms;
    case ResolutionUnit::kSecond:
      return multiplier * kMillisecondsPerSecond;
    case ResolutionUnit::kMinute:
      return multiplier * 60 * kMillisecondsPerSecond;
    case ResolutionUnit::kHour:
      return multiplier * 60 * 60 * kMillisecondsPerSecond;
    case ResolutionUnit::kDay:
    case ResolutionUnit::kWeek:
    case ResolutionUnit::kMonth:
      return 0;
  }
  return 0;
}

}  // namespace

bool IsValidCivilDate(const CivilDate& date) {
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) {
    return false;
  }
  return SameDate(CivilFromDays(DaysFromCivil(date)), date);
}

std::int64_t DaysFromCivil(const CivilDate& date) {
  int year = date.year;
  const unsigned month = static_cast<unsigned>(date.month);
  const unsigned day = static_cast<unsigned>(date.day);
  year -= month <= 2U ? 1 : 0;
  const std::int64_t era = FloorDivide(static_cast<std::int64_t>(year), 400);
  const unsigned year_of_era =
      static_cast<unsigned>(static_cast<std::int64_t>(year) - era * 400);
  const unsigned adjusted_month = month > 2U ? month - 3U : month + 9U;
  const unsigned day_of_year = (153U * adjusted_month + 2U) / 5U + day - 1U;
  const unsigned day_of_era =
      year_of_era * 365U + year_of_era / 4U - year_of_era / 100U + day_of_year;
  return era * 146097 + static_cast<std::int64_t>(day_of_era) - 719468;
}

CivilDate CivilFromDays(std::int64_t days) {
  days += 719468;
  const std::int64_t era = FloorDivide(days, 146097);
  const unsigned day_of_era =
      static_cast<unsigned>(days - era * 146097);  // [0, 146096]
  const unsigned year_of_era = (day_of_era - day_of_era / 1460U +
                                day_of_era / 36524U - day_of_era / 146096U) /
                               365U;
  int year = static_cast<int>(year_of_era) + static_cast<int>(era * 400);
  const unsigned day_of_year =
      day_of_era - (365U * year_of_era + year_of_era / 4U - year_of_era / 100U);
  const unsigned month_prime = (5U * day_of_year + 2U) / 153U;
  const unsigned day = day_of_year - (153U * month_prime + 2U) / 5U + 1U;
  const unsigned month =
      month_prime < 10U ? month_prime + 3U : month_prime - 9U;
  year += month <= 2U ? 1 : 0;
  return CivilDate{year, static_cast<int>(month), static_cast<int>(day)};
}

double NominalResolutionMilliseconds(const Resolution& resolution) {
  const std::int64_t fixed = FixedDurationMilliseconds(resolution);
  if (fixed > 0) {
    return static_cast<double>(fixed);
  }
  const double multiplier = static_cast<double>(resolution.multiplier);
  if (resolution.unit == ResolutionUnit::kDay) {
    return multiplier * static_cast<double>(kMillisecondsPerDay);
  }
  if (resolution.unit == ResolutionUnit::kWeek) {
    return multiplier * 7.0 * static_cast<double>(kMillisecondsPerDay);
  }
  return multiplier * 30.0 * static_cast<double>(kMillisecondsPerDay);
}

bool IsCalendarResolution(const Resolution& resolution) {
  return resolution.unit == ResolutionUnit::kDay ||
         resolution.unit == ResolutionUnit::kWeek ||
         resolution.unit == ResolutionUnit::kMonth;
}

BucketLookupResult BucketForTimestamp(const ChartConfig& config,
                                      std::int64_t timestamp_ms) {
  const Resolution& resolution = config.resolution;
  const TradeAggregationConfig& aggregation = config.trade_aggregation;
  const TradingCalendarConfig& calendar = aggregation.calendar;
  if (timestamp_ms < 0 || resolution.multiplier == 0U ||
      (calendar.configured &&
       (timestamp_ms < calendar.transition_range_start_ms ||
        timestamp_ms >= calendar.transition_range_end_ms))) {
    return {BucketLookupStatus::kInvalid, {}};
  }

  const std::optional<SessionMatch> session =
      TradingDayAt(calendar, timestamp_ms);
  if (!session.has_value()) {
    return {BucketLookupStatus::kOutsideSession, {}};
  }

  if (IsCalendarResolution(resolution)) {
    const std::int64_t period_day =
        CalendarPeriodStart(resolution, calendar, session->trading_day);
    const std::int64_t local_start = period_day * kMillisecondsPerDay;
    const std::optional<std::int64_t> utc_start =
        LocalToUtc(calendar, local_start, false);
    if (!utc_start.has_value()) {
      return {BucketLookupStatus::kInvalid, {}};
    }
    const std::int64_t key =
        aggregation.candle_timestamp == CandleTimestampPolicy::kTradingDateUtc
            ? local_start
            : *utc_start;
    return {BucketLookupStatus::kFound,
            TradeBucket{key, *utc_start, session->end_ms}};
  }

  const std::int64_t duration = FixedDurationMilliseconds(resolution);
  if (duration <= 0) {
    return {BucketLookupStatus::kInvalid, {}};
  }
  std::int64_t origin = aggregation.origin_timestamp_ms;
  if (aggregation.bucket_origin == BucketOrigin::kEpoch) {
    origin = 0;
  } else if (aggregation.bucket_origin == BucketOrigin::kSession) {
    origin = session->start_ms;
  }
  const std::int64_t start =
      origin + FloorDivide(timestamp_ms - origin, duration) * duration;
  const std::int64_t end = aggregation.bucket_origin == BucketOrigin::kSession
                               ? std::min(start + duration, session->end_ms)
                               : start + duration;
  return {BucketLookupStatus::kFound, TradeBucket{start, start, end}};
}

}  // namespace trading_charts::internal
