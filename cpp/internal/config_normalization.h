// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_CONFIG_NORMALIZATION_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_CONFIG_NORMALIZATION_H_

#include "cpp/chart_engine.h"

namespace trading_charts::internal {

bool HasValidScaleMargins(double top, double bottom);
ChartConfig NormalizeChartConfig(ChartConfig config);
TradingCalendarConfig NormalizeTradingCalendar(TradingCalendarConfig calendar);
SeriesConfig NormalizeSeriesConfig(SeriesConfig config,
                                   const ChartConfig& chart_config);

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_CONFIG_NORMALIZATION_H_
