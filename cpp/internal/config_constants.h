// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_CONFIG_CONSTANTS_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_CONFIG_CONSTANTS_H_

#include <cstddef>
#include <cstdint>

namespace trading_charts::internal {

inline constexpr double kMinYRangeMultiplier = 0.1;
inline constexpr double kMaxYRangeMultiplier = 10.0;
inline constexpr int kMinimumPricePrecision = 0;
inline constexpr int kMaximumPricePrecision = 12;
inline constexpr double kRsiMinimumValue = 0.0;
inline constexpr double kRsiMaximumValue = 100.0;
inline constexpr std::uint32_t kMinimumResolutionMultiplier = 1;
inline constexpr std::int64_t kMinimumFixedDurationMilliseconds = 1;
inline constexpr int kMinimumInitialVisibleCount = 1;
inline constexpr float kMinimumAxisDimension = 1.0f;
inline constexpr float kMinimumOpacity = 0.0f;
inline constexpr float kMaximumOpacity = 1.0f;
inline constexpr double kMaximumCombinedScaleMargin = 1.0;
inline constexpr size_t kMainPaneIndex = 0;
inline constexpr size_t kMinimumResizablePaneCount = 2;

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_CONFIG_CONSTANTS_H_
