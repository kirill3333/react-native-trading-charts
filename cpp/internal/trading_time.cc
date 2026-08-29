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

constexpr int kUnixEpochIsoWeekday = 4;
constexpr int kSessionSearchRadiusDays = 2;
constexpr std::uint8_t kAllWeekdaysMask = 0x7FU;
constexpr int kNextDayOffset = 1;
constexpr int kMinimumCivilMonth = 1;
constexpr int kMaximumCivilMonth = 12;
constexpr int kMinimumCivilDay = 1;
constexpr int kMaximumCivilDay = 31;
constexpr int kUnixEpochYear = 1970;
constexpr unsigned kFebruary = 2;
constexpr unsigned kMarch = 3;
constexpr unsigned kMarchBasedJanuaryIndex = 10;
constexpr unsigned kMonthsAfterMarchThroughDecember = 9;
constexpr std::int64_t kYearsPerEra = 400;
constexpr unsigned kYearsPerLeapCycle = 4;
constexpr unsigned kYearsPerCentury = 100;
constexpr unsigned kDaysPerCommonYear = 365;
constexpr std::int64_t kDaysPerEra = 146097;
constexpr unsigned kDaysPerFourYearsBeforeLeapDay = 1460;
constexpr unsigned kDaysPerCenturyBeforeLeapDay = 36524;
constexpr unsigned kDaysPerEraBeforeFinalLeapDay = 146096;
constexpr std::int64_t kCivilToUnixEpochDayOffset = 719468;
constexpr unsigned kDaysPerFiveMarchBasedMonths = 153;
constexpr unsigned kMarchBasedMonthCycleLength = 5;
constexpr unsigned kMarchBasedCalendarOffset = 2;
constexpr double kNominalDaysPerMonth = 30.0;

std::int64_t FloorDivide(std::int64_t value, std::int64_t divisor) {
  const std::int64_t quotient = value / divisor;
  const std::int64_t remainder = value % divisor;
  return remainder < 0 ? quotient - 1 : quotient;
}

int IsoWeekday(std::int64_t days) {
  const int epoch_offset_from_monday = kUnixEpochIsoWeekday - kIsoMonday;
  const std::int64_t zero_based_weekday =
      (days + epoch_offset_from_monday) % kDaysPerWeek;
  const std::int64_t positive_weekday = zero_based_weekday < 0
                                            ? zero_based_weekday + kDaysPerWeek
                                            : zero_based_weekday;
  return static_cast<int>(positive_weekday) + kIsoMonday;
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
  const bool has_valid_bounds =
      start.has_value() && end.has_value() && *end > *start;
  const bool contains_timestamp =
      has_valid_bounds && timestamp_ms >= *start && timestamp_ms < *end;
  if (!contains_timestamp) {
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
  for (int delta = -kSessionSearchRadiusDays; delta <= kSessionSearchRadiusDays;
       ++delta) {
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
      const TradingSessionConfig full_day{kAllWeekdaysMask, 0, 0, 0,
                                          kNextDayOffset};
      if (MatchSegment(calendar, full_day, trading_day, timestamp_ms, result)) {
        return result;
      }
      continue;
    }
    const int weekday = IsoWeekday(trading_day);
    const std::uint8_t mask = static_cast<std::uint8_t>(
        1U << static_cast<unsigned>(weekday - kIsoMonday));
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
    const int week_start =
        calendar.week_starts_on == kIsoSunday ? kIsoSunday : kIsoMonday;
    const int distance =
        static_cast<int>((weekday - week_start + kDaysPerWeek) % kDaysPerWeek);
    const std::int64_t start = trading_day - distance;
    const std::int64_t epoch_week_start = -static_cast<std::int64_t>(
        (IsoWeekday(0) - week_start + kDaysPerWeek) % kDaysPerWeek);
    const std::int64_t group_days = multiplier * kDaysPerWeek;
    return epoch_week_start +
           FloorDivide(start - epoch_week_start, group_days) * group_days;
  }
  const CivilDate date = CivilFromDays(trading_day);
  constexpr std::int64_t kEpochMonthIndex =
      static_cast<std::int64_t>(kUnixEpochYear) * kMonthsPerYear;
  const std::int64_t month_index =
      static_cast<std::int64_t>(date.year) * kMonthsPerYear + date.month -
      kMinimumCivilMonth;
  const std::int64_t start_index =
      FloorDivide(month_index - kEpochMonthIndex, multiplier) * multiplier +
      kEpochMonthIndex;
  const std::int64_t year = FloorDivide(start_index, kMonthsPerYear);
  const int month = static_cast<int>(start_index - year * kMonthsPerYear) +
                    kMinimumCivilMonth;
  return DaysFromCivil(
      CivilDate{static_cast<int>(year), month, kMinimumCivilDay});
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
      return multiplier * kMillisecondsPerMinute;
    case ResolutionUnit::kHour:
      return multiplier * kMillisecondsPerHour;
    case ResolutionUnit::kDay:
    case ResolutionUnit::kWeek:
    case ResolutionUnit::kMonth:
      return 0;
  }
  return 0;
}

}  // namespace

bool IsValidCivilDate(const CivilDate& date) {
  if (date.month < kMinimumCivilMonth || date.month > kMaximumCivilMonth ||
      date.day < kMinimumCivilDay || date.day > kMaximumCivilDay) {
    return false;
  }
  return SameDate(CivilFromDays(DaysFromCivil(date)), date);
}

std::int64_t DaysFromCivil(const CivilDate& date) {
  int year = date.year;
  const unsigned month = static_cast<unsigned>(date.month);
  const unsigned day = static_cast<unsigned>(date.day);
  year -= month <= kFebruary ? 1 : 0;
  const std::int64_t era =
      FloorDivide(static_cast<std::int64_t>(year), kYearsPerEra);
  const unsigned year_of_era = static_cast<unsigned>(
      static_cast<std::int64_t>(year) - era * kYearsPerEra);
  const unsigned adjusted_month =
      month > kFebruary ? month - kMarch
                        : month + kMonthsAfterMarchThroughDecember;
  const unsigned day_of_year = (kDaysPerFiveMarchBasedMonths * adjusted_month +
                                kMarchBasedCalendarOffset) /
                                   kMarchBasedMonthCycleLength +
                               day - kMinimumCivilDay;
  const unsigned day_of_era = year_of_era * kDaysPerCommonYear +
                              year_of_era / kYearsPerLeapCycle -
                              year_of_era / kYearsPerCentury + day_of_year;
  return era * kDaysPerEra + static_cast<std::int64_t>(day_of_era) -
         kCivilToUnixEpochDayOffset;
}

CivilDate CivilFromDays(std::int64_t days) {
  days += kCivilToUnixEpochDayOffset;
  const std::int64_t era = FloorDivide(days, kDaysPerEra);
  const unsigned day_of_era = static_cast<unsigned>(days - era * kDaysPerEra);
  const unsigned year_of_era =
      (day_of_era - day_of_era / kDaysPerFourYearsBeforeLeapDay +
       day_of_era / kDaysPerCenturyBeforeLeapDay -
       day_of_era / kDaysPerEraBeforeFinalLeapDay) /
      kDaysPerCommonYear;
  int year =
      static_cast<int>(year_of_era) + static_cast<int>(era * kYearsPerEra);
  const unsigned day_of_year = day_of_era - (kDaysPerCommonYear * year_of_era +
                                             year_of_era / kYearsPerLeapCycle -
                                             year_of_era / kYearsPerCentury);
  const unsigned month_prime =
      (kMarchBasedMonthCycleLength * day_of_year + kMarchBasedCalendarOffset) /
      kDaysPerFiveMarchBasedMonths;
  const unsigned day =
      day_of_year -
      (kDaysPerFiveMarchBasedMonths * month_prime + kMarchBasedCalendarOffset) /
          kMarchBasedMonthCycleLength +
      kMinimumCivilDay;
  const unsigned month = month_prime < kMarchBasedJanuaryIndex
                             ? month_prime + kMarch
                             : month_prime - kMonthsAfterMarchThroughDecember;
  year += month <= kFebruary ? 1 : 0;
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
    return multiplier * static_cast<double>(kDaysPerWeek) *
           static_cast<double>(kMillisecondsPerDay);
  }
  return multiplier * kNominalDaysPerMonth *
         static_cast<double>(kMillisecondsPerDay);
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
  const bool timestamp_in_transition_range =
      timestamp_ms >= calendar.transition_range_start_ms &&
      timestamp_ms < calendar.transition_range_end_ms;
  const bool calendar_covers_timestamp =
      !calendar.configured || timestamp_in_transition_range;
  if (timestamp_ms < 0 || resolution.multiplier == 0U ||
      !calendar_covers_timestamp) {
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
