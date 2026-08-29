// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_TRADING_TIME_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_TRADING_TIME_H_

#include <cstdint>

#include "cpp/chart_engine.h"

namespace trading_charts::internal {

inline constexpr std::int64_t kMillisecondsPerSecond = 1000;
inline constexpr std::int64_t kSecondsPerMinute = 60;
inline constexpr std::int64_t kMinutesPerHour = 60;
inline constexpr std::int64_t kHoursPerDay = 24;
inline constexpr std::int64_t kDaysPerWeek = 7;
inline constexpr std::int64_t kMonthsPerYear = 12;
inline constexpr std::int64_t kMillisecondsPerMinute = 60000;
inline constexpr std::int64_t kMillisecondsPerHour = 3600000;
inline constexpr std::int64_t kMillisecondsPerDay = 86400000;

inline constexpr int kIsoMonday = 1;
inline constexpr int kIsoSunday = 7;

struct TradeBucket {
  std::int64_t key_timestamp_ms = 0;
  std::int64_t start_ms = 0;
  std::int64_t end_ms = 0;
};

enum class BucketLookupStatus : std::uint8_t {
  kFound,
  kOutsideSession,
  kInvalid,
};

struct BucketLookupResult {
  BucketLookupStatus status = BucketLookupStatus::kInvalid;
  TradeBucket bucket;
};

bool IsValidCivilDate(const CivilDate& date);
std::int64_t DaysFromCivil(const CivilDate& date);
CivilDate CivilFromDays(std::int64_t days);
double NominalResolutionMilliseconds(const Resolution& resolution);
bool IsCalendarResolution(const Resolution& resolution);
BucketLookupResult BucketForTimestamp(const ChartConfig& config,
                                      std::int64_t timestamp_ms);

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_TRADING_TIME_H_
