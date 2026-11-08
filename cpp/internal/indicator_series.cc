// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/indicator_series.h"

#include <algorithm>
#include <cmath>
#include <deque>
#include <limits>
#include <optional>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/config_constants.h"

namespace trading_charts::internal {
namespace {

#ifdef TRADING_CHARTS_TEST_REBUILDS
thread_local size_t full_rebuild_count = 0;
#endif

constexpr double kRsiNeutralValue = (kRsiMinimumValue + kRsiMaximumValue) / 2.0;
constexpr double kExponentialSmoothingNumerator = 2.0;
constexpr double kExponentialSmoothingDenominatorOffset = 1.0;

double ExponentialSmoothingAlpha(size_t period) {
  return kExponentialSmoothingNumerator /
         (static_cast<double>(period) + kExponentialSmoothingDenominatorOffset);
}

double RsiValue(double average_gain, double average_loss) {
  if (average_gain == 0.0 && average_loss == 0.0) {
    return kRsiNeutralValue;
  }
  if (average_loss == 0.0) {
    return kRsiMaximumValue;
  }
  if (average_gain == 0.0) {
    return kRsiMinimumValue;
  }
  const double relative_strength = average_gain / average_loss;
  return kRsiMaximumValue - kRsiMaximumValue / (1.0 + relative_strength);
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

  // Reserve full rebuilds only, so incremental push_back can grow
  // geometrically.
  if (start == period) {
    series.candles.reserve(source.size() - period);
    series.rsi_states.reserve(source.size() - period);
  }
  for (size_t index = start; index < source.size(); ++index) {
    if (index > period) {
      const double delta = source[index].close - source[index - 1].close;
      const size_t previous_period_sample_count = period - 1;
      average_gain =
          (average_gain * static_cast<double>(previous_period_sample_count) +
           std::max(delta, 0.0)) /
          static_cast<double>(period);
      average_loss =
          (average_loss * static_cast<double>(previous_period_sample_count) +
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

  if (start == first_output_source_index) {
    const size_t output_size = source.size() - first_output_source_index;
    series.candles.reserve(output_size);
    series.moving_average_states.reserve(output_size);
  }
  const double alpha = ExponentialSmoothingAlpha(period);
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

// Matches TA-Lib SAR's two-bar initialization and reversal/clamping order.
// Each saved state describes the next candidate, so replacing the live candle
// starts from the preceding completed candle rather than accumulating changes.
void RebuildSarSeries(SeriesData& series, const std::vector<Candle>* source,
                      size_t first_changed_source_index) {
  if (source == nullptr || source->size() < 2) {
    series.candles.clear();
    series.sar_states.clear();
    return;
  }
  size_t start =
      std::max<size_t>(1, std::min(first_changed_source_index, source->size()));
  if (start - 1 > series.sar_states.size() ||
      start - 1 > series.candles.size()) {
    start = 1;
  }
  series.candles.resize(start - 1);
  series.sar_states.resize(start - 1);
  SarState state;
  if (start == 1) {
    const Candle& first = (*source)[0];
    const Candle& second = (*source)[1];
    const double down = first.low - second.low;
    const double up = second.high - first.high;
    state.rising = !(down > 0.0 && down > up);
    state.next_sar = state.rising ? first.low : first.high;
    state.extreme = state.rising ? second.high : second.low;
    state.acceleration = series.config.sar_step;
    series.candles.reserve(source->size() - 1);
    series.sar_states.reserve(source->size() - 1);
  } else {
    state = series.sar_states.back();
  }
  for (size_t index = start; index < source->size(); ++index) {
    const Candle& current = (*source)[index];
    // TA-Lib uses today's range twice on the initialization iteration.
    const Candle& previous = (*source)[index == 1 ? index : index - 1];
    double value = state.next_sar;
    const bool reversed =
        state.rising ? current.low <= value : current.high >= value;
    state.reversal = reversed && index > 1;
    if (reversed) {
      state.rising = !state.rising;
      value = state.rising
                  ? std::min({state.extreme, previous.low, current.low})
                  : std::max({state.extreme, previous.high, current.high});
      state.extreme = state.rising ? current.high : current.low;
      state.acceleration = series.config.sar_step;
    } else if (state.rising ? current.high > state.extreme
                            : current.low < state.extreme) {
      state.extreme = state.rising ? current.high : current.low;
      state.acceleration = std::min(state.acceleration + series.config.sar_step,
                                    series.config.sar_maximum);
    }
    const double candidate =
        std::fma(state.acceleration, state.extreme - value, value);
    state.next_sar = state.rising
                         ? std::min({candidate, previous.low, current.low})
                         : std::max({candidate, previous.high, current.high});
    series.candles.push_back(
        Candle{current.timestamp, value, value, value, value, 0.0});
    series.sar_states.push_back(state);
  }
}

void RebuildBollSeries(SeriesData& series, const std::vector<Candle>* source,
                       size_t first_changed_source_index) {
  const size_t period = series.config.boll_period;
  if (source == nullptr || period == 0 || source->size() < period) {
    series.candles.clear();
    series.boll_states.clear();
    return;
  }
  const size_t first = period - 1;
  size_t start = std::max(first, first_changed_source_index);
  if (start - first > series.boll_states.size()) {
    start = first;
  }
  series.candles.resize(start - first);
  series.boll_states.resize(start - first);
  BollRollingState state;
  if (start > first) {
    state = series.boll_states.back();
  }
  if (start == first) {
    series.candles.reserve(source->size() - first);
    series.boll_states.reserve(source->size() - first);
  }
  const auto value_at = [&](size_t index) {
    return CandleValue((*source)[index], series.config.line_source);
  };
  const double count = static_cast<double>(period);
  for (size_t index = start; index < source->size(); ++index) {
    // Center values before Welford updates to preserve small spreads at large
    // prices. Rebase once per window to bound accumulated roundoff, O(n) total.
    if (index == first || (index - first) % period == 0) {
      state = BollRollingState{};
      state.origin = value_at(index - first);
      for (size_t offset = 0; offset < period; ++offset) {
        const double value = value_at(index - first + offset) - state.origin;
        const double delta = value - state.mean;
        state.mean += delta / static_cast<double>(offset + 1);
        state.m2 += delta * (value - state.mean);
      }
    } else {
      const double previous_mean = state.mean;
      const double incoming = value_at(index) - state.origin;
      const double outgoing = value_at(index - period) - state.origin;
      state.mean += (incoming - outgoing) / count;
      state.m2 += (incoming - outgoing) *
                  (incoming - state.mean + outgoing - previous_mean);
      state.m2 = std::max(0.0, state.m2);
    }
    const double middle = state.origin + state.mean;
    const double spread = series.config.boll_std_dev_multiplier *
                          std::sqrt(std::max(0.0, state.m2 / count));
    series.candles.push_back(Candle{(*source)[index].timestamp, middle,
                                    middle + spread, middle - spread, middle,
                                    0.0});
    series.boll_states.push_back(state);
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

  const double fast_alpha = ExponentialSmoothingAlpha(fast_period);
  const double slow_alpha = ExponentialSmoothingAlpha(slow_period);
  const double signal_alpha = ExponentialSmoothingAlpha(signal_period);
  if (start == 0) {
    series.macd_states.reserve(source.size());
    series.candles.reserve(source.size() -
                           std::min(source.size(), slow_period - 1));
  }
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

// KDJ samples use the existing line geometry storage. High, close and low
// carry K, D and J respectively and need not be ordered as OHLC prices.
void RebuildRangeOscillator(SeriesData& series,
                            const std::vector<Candle>* source,
                            size_t first_changed) {
  const bool kdj = series.config.source == SeriesSource::kOhlcvKdj;
  const size_t period =
      kdj ? series.config.kdj_period : series.config.williams_period;
  const size_t warmup = kdj ? 0 : period - 1;
  if (!source || source->size() <= warmup) {
    series.oscillator_window.reset();
    series.candles.clear();
    return;
  }
  const size_t start =
      std::clamp(first_changed, warmup,
                 std::min(source->size(), warmup + series.candles.size()));
  series.candles.resize(start - warmup);
  if (start == source->size()) {
    return;
  }
  double k = series.candles.empty() ? 50.0 : series.candles.back().high;
  double d = series.candles.empty() ? 50.0 : series.candles.back().close;
  if (!series.oscillator_window ||
      first_changed < series.oscillator_window->next_index) {
    series.oscillator_window.emplace();
    series.oscillator_window->next_index =
        start + 1 > period ? start + 1 - period : 0;
  }
  OscillatorWindow& window = *series.oscillator_window;
  for (size_t i = start; i < source->size(); ++i) {
    const Candle& candle = (*source)[i];
    while (window.next_index < i) {
      const size_t index = window.next_index++;
      const Candle& previous = (*source)[index];
      while (!window.highs.empty() &&
             (*source)[window.highs.back()].high <= previous.high) {
        window.highs.pop_back();
      }
      while (!window.lows.empty() &&
             (*source)[window.lows.back()].low >= previous.low) {
        window.lows.pop_back();
      }
      window.highs.push_back(index);
      window.lows.push_back(index);
    }
    while (!window.highs.empty() && i - window.highs.front() >= period) {
      window.highs.pop_front();
    }
    while (!window.lows.empty() && i - window.lows.front() >= period) {
      window.lows.pop_front();
    }
    const double high =
        window.highs.empty()
            ? candle.high
            : std::max(candle.high, (*source)[window.highs.front()].high);
    const double low =
        window.lows.empty()
            ? candle.low
            : std::min(candle.low, (*source)[window.lows.front()].low);
    if (kdj) {
      double j = 50.0;
      if (i > 0) {
        const double rsv =
            high == low ? 50.0 : (candle.close - low) / (high - low) * 100.0;
        k += (rsv - k) / series.config.kdj_m1;
        d += (k - d) / series.config.kdj_m1;
        j = series.config.kdj_m2 * k - 2.0 * d;
      }
      series.candles.push_back({candle.timestamp, k, k, j, d, 0.0});
    } else {
      const double wr =
          high == low ? -50.0 : -(high - candle.close) / (high - low) * 100.0;
      series.candles.push_back({candle.timestamp, wr, wr, wr, wr, 0.0});
    }
  }
}

}  // namespace

#ifdef TRADING_CHARTS_TEST_REBUILDS
size_t FullIndicatorRebuildCount() { return full_rebuild_count; }
#endif

void RebuildDerivedSeries(SeriesData& series, const std::vector<Candle>* source,
                          size_t first_changed_source_index) {
#ifdef TRADING_CHARTS_TEST_REBUILDS
  if (first_changed_source_index == 0) {
    ++full_rebuild_count;
  }
#endif
  switch (series.config.source) {
    case SeriesSource::kOhlcvRsi:
      if (source == nullptr) {
        RebuildRsiSeries(series, source);
      } else {
        RebuildRsiSeries(series, *source, first_changed_source_index);
      }
      break;
    case SeriesSource::kOhlcvWilliamsR:
    case SeriesSource::kOhlcvKdj:
      RebuildRangeOscillator(series, source, first_changed_source_index);
      break;
    case SeriesSource::kOhlcvSar:
      RebuildSarSeries(series, source, first_changed_source_index);
      break;
    case SeriesSource::kOhlcvBoll:
      RebuildBollSeries(series, source, first_changed_source_index);
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
