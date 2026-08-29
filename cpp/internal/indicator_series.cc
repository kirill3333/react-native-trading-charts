// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/indicator_series.h"

#include <algorithm>
#include <limits>
#include <vector>

namespace trading_charts::internal {
namespace {

double RsiValue(double average_gain, double average_loss) {
  if (average_gain == 0.0 && average_loss == 0.0) {
    return 50.0;
  }
  if (average_loss == 0.0) {
    return 100.0;
  }
  if (average_gain == 0.0) {
    return 0.0;
  }
  return 100.0 - 100.0 / (1.0 + average_gain / average_loss);
}

void RebuildRsiSeries(SeriesData& series, const std::vector<Candle>* source) {
  if (source == nullptr) {
    series.candles.clear();
    series.rsi_states.clear();
  }
}

void RebuildRsiSeries(SeriesData& series, const std::vector<Candle>& source,
                      size_t first_changed_source_index) {
  const size_t period = static_cast<size_t>(series.config.rsi_period);
  if (period == 0 || source.size() <= period) {
    series.candles.clear();
    series.rsi_states.clear();
    return;
  }

  size_t start = std::max(period, first_changed_source_index);
  const size_t output_start = start - period;
  if (start == period || output_start > series.rsi_states.size() ||
      output_start > series.candles.size()) {
    start = period;
    series.candles.clear();
    series.rsi_states.clear();
  } else {
    series.candles.resize(output_start);
    series.rsi_states.resize(output_start);
  }

  double average_gain = 0.0;
  double average_loss = 0.0;
  if (start == period) {
    for (size_t index = 1; index <= period; ++index) {
      const double delta = source[index].close - source[index - 1].close;
      average_gain += std::max(delta, 0.0);
      average_loss += std::max(-delta, 0.0);
    }
    average_gain /= static_cast<double>(period);
    average_loss /= static_cast<double>(period);
  } else {
    const RsiSmoothingState& previous = series.rsi_states.back();
    average_gain = previous.average_gain;
    average_loss = previous.average_loss;
  }

  series.candles.reserve(source.size() - period);
  series.rsi_states.reserve(source.size() - period);
  for (size_t index = start; index < source.size(); ++index) {
    if (index > period) {
      const double delta = source[index].close - source[index - 1].close;
      average_gain = (average_gain * static_cast<double>(period - 1) +
                      std::max(delta, 0.0)) /
                     static_cast<double>(period);
      average_loss = (average_loss * static_cast<double>(period - 1) +
                      std::max(-delta, 0.0)) /
                     static_cast<double>(period);
    }
    const double value = RsiValue(average_gain, average_loss);
    series.candles.push_back(
        Candle{source[index].timestamp, value, value, value, value, 0.0});
    series.rsi_states.push_back(RsiSmoothingState{average_gain, average_loss});
  }
}

void RebuildMovingAverageSeries(SeriesData& series,
                                const std::vector<Candle>* source) {
  if (source == nullptr) {
    series.candles.clear();
    series.moving_average_states.clear();
  }
}

void RebuildMovingAverageSeries(SeriesData& series,
                                const std::vector<Candle>& source,
                                size_t first_changed_source_index) {
  const size_t period =
      static_cast<size_t>(series.config.moving_average_period);
  if (period == 0 || source.size() < period) {
    series.candles.clear();
    series.moving_average_states.clear();
    return;
  }

  const size_t first_output_source_index = period - 1;
  size_t start =
      std::max(first_output_source_index, first_changed_source_index);
  size_t output_start = start - first_output_source_index;
  if (start == first_output_source_index ||
      output_start > series.moving_average_states.size() ||
      output_start > series.candles.size()) {
    start = first_output_source_index;
    series.candles.clear();
    series.moving_average_states.clear();
  } else {
    series.candles.resize(output_start);
    series.moving_average_states.resize(output_start);
  }

  double state = 0.0;
  if (start == first_output_source_index) {
    for (size_t index = 0; index < period; ++index) {
      state += CandleValue(source[index], series.config.line_source);
    }
    if (series.config.source == SeriesSource::kOhlcvEma) {
      state /= static_cast<double>(period);
    }
  } else {
    state = series.moving_average_states.back();
  }

  const size_t output_size = source.size() - first_output_source_index;
  series.candles.reserve(output_size);
  series.moving_average_states.reserve(output_size);
  const double alpha = 2.0 / (static_cast<double>(period) + 1.0);
  for (size_t index = start; index < source.size(); ++index) {
    if (index > first_output_source_index) {
      const double current =
          CandleValue(source[index], series.config.line_source);
      if (series.config.source == SeriesSource::kOhlcvSma) {
        state += current -
                 CandleValue(source[index - period], series.config.line_source);
      } else {
        state += alpha * (current - state);
      }
    }
    const double value = series.config.source == SeriesSource::kOhlcvSma
                             ? state / static_cast<double>(period)
                             : state;
    series.candles.push_back(
        Candle{source[index].timestamp, value, value, value, value, 0.0});
    series.moving_average_states.push_back(state);
  }
}

void RebuildMacdSeries(SeriesData& series, const std::vector<Candle>* source) {
  if (source == nullptr) {
    series.candles.clear();
    series.signal_candles.clear();
    series.histogram.clear();
    series.macd_states.clear();
  }
}

void RebuildMacdSeries(SeriesData& series, const std::vector<Candle>& source,
                       size_t first_changed_source_index) {
  const size_t fast_period = series.config.macd_fast_period;
  const size_t slow_period = series.config.macd_slow_period;
  const size_t signal_period = series.config.macd_signal_period;
  if (fast_period == 0 || slow_period == 0 || signal_period == 0 ||
      fast_period >= slow_period || source.empty()) {
    series.candles.clear();
    series.signal_candles.clear();
    series.histogram.clear();
    series.macd_states.clear();
    return;
  }

  size_t start = std::min(first_changed_source_index, source.size());
  if (start > series.macd_states.size()) {
    start = 0;
  }
  MacdSmoothingState state;
  if (start > 0) {
    state = series.macd_states[start - 1];
  }
  series.macd_states.resize(start);
  const double changed_timestamp =
      start < source.size() ? source[start].timestamp
                            : std::numeric_limits<double>::infinity();
  const auto truncate_candles = [&](std::vector<Candle>& values) {
    values.erase(
        std::lower_bound(values.begin(), values.end(), changed_timestamp,
                         [](const Candle& candle, double timestamp) {
                           return candle.timestamp < timestamp;
                         }),
        values.end());
  };
  truncate_candles(series.candles);
  truncate_candles(series.signal_candles);
  series.histogram.erase(
      std::lower_bound(series.histogram.begin(), series.histogram.end(),
                       changed_timestamp,
                       [](const HistogramPoint& point, double timestamp) {
                         return point.timestamp < timestamp;
                       }),
      series.histogram.end());

  const double fast_alpha = 2.0 / (static_cast<double>(fast_period) + 1.0);
  const double slow_alpha = 2.0 / (static_cast<double>(slow_period) + 1.0);
  const double signal_alpha = 2.0 / (static_cast<double>(signal_period) + 1.0);
  series.macd_states.reserve(source.size());
  series.candles.reserve(source.size() -
                         std::min(source.size(), slow_period - 1));
  for (size_t index = start; index < source.size(); ++index) {
    const double value = CandleValue(source[index], series.config.line_source);
    if (!state.fast_ready) {
      state.fast_sum += value;
      if (index + 1 == fast_period) {
        state.fast = state.fast_sum / static_cast<double>(fast_period);
        state.fast_ready = true;
      }
    } else {
      state.fast += fast_alpha * (value - state.fast);
    }
    if (!state.slow_ready) {
      state.slow_sum += value;
      if (index + 1 == slow_period) {
        state.slow = state.slow_sum / static_cast<double>(slow_period);
        state.slow_ready = true;
      }
    } else {
      state.slow += slow_alpha * (value - state.slow);
    }
    if (state.fast_ready && state.slow_ready) {
      const double macd = state.fast - state.slow;
      series.candles.push_back(
          Candle{source[index].timestamp, macd, macd, macd, macd, 0.0});
      if (!state.signal_ready) {
        state.signal_sum += macd;
        ++state.signal_count;
        if (state.signal_count == signal_period) {
          state.signal = state.signal_sum / static_cast<double>(signal_period);
          state.signal_ready = true;
        }
      } else {
        state.signal += signal_alpha * (macd - state.signal);
      }
      if (state.signal_ready) {
        series.signal_candles.push_back(
            Candle{source[index].timestamp, state.signal, state.signal,
                   state.signal, state.signal, 0.0});
        series.histogram.push_back(
            HistogramPoint{source[index].timestamp, macd - state.signal});
      }
    }
    series.macd_states.push_back(state);
  }
}

}  // namespace

void RebuildDerivedSeries(SeriesData& series, const std::vector<Candle>* source,
                          size_t first_changed_source_index) {
  switch (series.config.source) {
    case SeriesSource::kOhlcvRsi:
      if (source == nullptr) {
        RebuildRsiSeries(series, source);
      } else {
        RebuildRsiSeries(series, *source, first_changed_source_index);
      }
      break;
    case SeriesSource::kOhlcvSma:
    case SeriesSource::kOhlcvEma:
      if (source == nullptr) {
        RebuildMovingAverageSeries(series, source);
      } else {
        RebuildMovingAverageSeries(series, *source, first_changed_source_index);
      }
      break;
    case SeriesSource::kOhlcvMacd:
      if (source == nullptr) {
        RebuildMacdSeries(series, source);
      } else {
        RebuildMacdSeries(series, *source, first_changed_source_index);
      }
      break;
    case SeriesSource::kData:
    case SeriesSource::kOhlcvVolume:
      break;
  }
}

}  // namespace trading_charts::internal
