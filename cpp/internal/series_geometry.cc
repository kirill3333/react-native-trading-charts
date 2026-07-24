// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/series_geometry.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <vector>

#include "cpp/internal/triangle_geometry.h"

namespace trading_charts::internal {
namespace {

constexpr size_t kCandlestickQuadsPerSample = 2;
constexpr size_t kHollowCandlestickQuadsPerSample = 6;
constexpr size_t kBarQuadsPerSample = 3;
constexpr size_t kMaxVisibleSamples = 16384;
constexpr float kBarTickSlotRatio = 0.45f;

struct SeriesSample {
  const Candle& candle;
  float x = 0.0f;
  float slot_width = 0.0f;
  float open_y = 0.0f;
  float high_y = 0.0f;
  float low_y = 0.0f;
  float close_y = 0.0f;
};

size_t SampleStride(const SeriesGeometryInput& input) {
  const size_t visible_count = input.end_index - input.first_index;
  return std::max<size_t>(
      1, (visible_count + kMaxVisibleSamples - 1) / kMaxVisibleSamples);
}

size_t SampleCount(const SeriesGeometryInput& input) {
  const size_t visible_count = input.end_index - input.first_index;
  const size_t stride = SampleStride(input);
  return (visible_count + stride - 1) / stride;
}

double XDomainUnit(const SeriesGeometryInput& input) {
  return input.config.logical_spacing ? 1.0 : input.config.timeframe_ms;
}

double CandleX(const SeriesGeometryInput& input, size_t index) {
  return input.config.logical_spacing ? static_cast<double>(index)
                                      : input.candles[index].timestamp;
}

float ProjectX(const SeriesGeometryInput& input, double value) {
  return input.plot.left +
         static_cast<float>((value - input.visible_x_min) /
                            (input.visible_x_max - input.visible_x_min)) *
             input.plot.Width();
}

float ProjectY(const SeriesGeometryInput& input, double value) {
  return input.plot.bottom -
         static_cast<float>((value - input.visible_y_min) /
                            (input.visible_y_max - input.visible_y_min)) *
             input.plot.Height();
}

template <typename Callback>
void VisitVisibleSamples(const SeriesGeometryInput& input,
                         Callback&& callback) {
  const size_t stride = SampleStride(input);
  const double fallback_slot_domain =
      XDomainUnit(input) * static_cast<double>(stride);

  for (size_t index = input.first_index; index < input.end_index;
       index += stride) {
    const Candle& candle = input.candles[index];
    double slot_domain = fallback_slot_domain;
    if (!input.config.logical_spacing) {
      bool has_local_spacing = false;
      if (index >= stride) {
        const double previous_spacing =
            candle.timestamp - input.candles[index - stride].timestamp;
        if (previous_spacing > 0.0) {
          slot_domain = previous_spacing;
          has_local_spacing = true;
        }
      }
      if (index + stride < input.candles.size()) {
        const double next_spacing =
            input.candles[index + stride].timestamp - candle.timestamp;
        if (next_spacing > 0.0) {
          slot_domain = has_local_spacing ? std::min(slot_domain, next_spacing)
                                          : next_spacing;
        }
      }
    }

    const float slot_width =
        static_cast<float>(slot_domain /
                           (input.visible_x_max - input.visible_x_min)) *
        input.plot.Width();
    callback(SeriesSample{
        candle,
        ProjectX(input, CandleX(input, index)),
        slot_width,
        ProjectY(input, candle.open),
        ProjectY(input, candle.high),
        ProjectY(input, candle.low),
        ProjectY(input, candle.close),
    });
  }
}

void AppendCandlestickGeometry(const SeriesGeometryInput& input,
                               std::vector<float>& vertices) {
  VisitVisibleSamples(input, [&](const SeriesSample& sample) {
    const float body_width = std::clamp(sample.slot_width * 0.7f, 1.0f, 28.0f);
    const float wick_width = std::clamp(body_width * 0.08f, 1.0f, 2.0f);
    if (sample.x + body_width < input.plot.left ||
        sample.x - body_width > input.plot.right) {
      return;
    }

    const Color color = sample.candle.close >= sample.candle.open
                            ? input.config.up
                            : input.config.down;
    const float wick_top =
        std::clamp(sample.high_y, input.plot.top, input.plot.bottom);
    const float wick_bottom =
        std::clamp(sample.low_y, input.plot.top, input.plot.bottom);
    AppendQuad(vertices, sample.x - wick_width * 0.5f, wick_top,
               sample.x + wick_width * 0.5f,
               std::max(wick_bottom, wick_top + 1.0f), color);

    float body_top = std::clamp(std::min(sample.open_y, sample.close_y),
                                input.plot.top, input.plot.bottom);
    float body_bottom = std::clamp(std::max(sample.open_y, sample.close_y),
                                   input.plot.top, input.plot.bottom);
    if (body_bottom - body_top < 1.0f) {
      body_bottom = body_top + 1.0f;
    }
    AppendQuad(
        vertices, std::max(input.plot.left, sample.x - body_width * 0.5f),
        body_top, std::min(input.plot.right, sample.x + body_width * 0.5f),
        body_bottom, color);
  });
}

void AppendHollowCandlestickGeometry(const SeriesGeometryInput& input,
                                     std::vector<float>& vertices) {
  VisitVisibleSamples(input, [&](const SeriesSample& sample) {
    const float body_width = std::clamp(sample.slot_width * 0.7f, 1.0f, 28.0f);
    const float half_body_width = body_width * 0.5f;
    const float wick_width = std::clamp(body_width * 0.08f, 1.0f, 2.0f);
    if (sample.x + half_body_width < input.plot.left ||
        sample.x - half_body_width > input.plot.right) {
      return;
    }

    const bool is_up = sample.candle.close >= sample.candle.open;
    const Color color = is_up ? input.config.up : input.config.down;
    const float wick_top =
        std::clamp(sample.high_y, input.plot.top, input.plot.bottom);
    const float wick_bottom =
        std::clamp(sample.low_y, input.plot.top, input.plot.bottom);
    const float body_left =
        std::max(input.plot.left, sample.x - half_body_width);
    const float body_right =
        std::min(input.plot.right, sample.x + half_body_width);
    float body_top = std::clamp(std::min(sample.open_y, sample.close_y),
                                input.plot.top, input.plot.bottom);
    float body_bottom = std::clamp(std::max(sample.open_y, sample.close_y),
                                   input.plot.top, input.plot.bottom);
    if (body_bottom - body_top < 1.0f) {
      if (body_top + 1.0f <= input.plot.bottom) {
        body_bottom = body_top + 1.0f;
      } else {
        body_top = std::max(input.plot.top, body_bottom - 1.0f);
      }
    }

    if (!is_up) {
      AppendClippedQuad(vertices, sample.x - wick_width * 0.5f, wick_top,
                        sample.x + wick_width * 0.5f,
                        std::max(wick_bottom, wick_top + 1.0f), input.plot,
                        color);
      AppendQuad(vertices, body_left, body_top, body_right, body_bottom, color);
      return;
    }

    AppendClippedQuad(vertices, sample.x - wick_width * 0.5f, wick_top,
                      sample.x + wick_width * 0.5f, body_top, input.plot,
                      color);
    AppendClippedQuad(vertices, sample.x - wick_width * 0.5f, body_bottom,
                      sample.x + wick_width * 0.5f, wick_bottom, input.plot,
                      color);

    const float visible_body_width = body_right - body_left;
    const float visible_body_height = body_bottom - body_top;
    if (visible_body_width <= wick_width * 2.0f ||
        visible_body_height <= wick_width * 2.0f) {
      AppendQuad(vertices, body_left, body_top, body_right, body_bottom, color);
      return;
    }

    AppendQuad(vertices, body_left, body_top, body_right, body_top + wick_width,
               color);
    AppendQuad(vertices, body_left, body_bottom - wick_width, body_right,
               body_bottom, color);
    AppendQuad(vertices, body_left, body_top + wick_width,
               body_left + wick_width, body_bottom - wick_width, color);
    AppendQuad(vertices, body_right - wick_width, body_top + wick_width,
               body_right, body_bottom - wick_width, color);
  });
}

void AppendBarGeometry(const SeriesGeometryInput& input,
                       std::vector<float>& vertices) {
  const float line_width = input.config.bar_line_width;
  const float half_line_width = line_width * 0.5f;
  VisitVisibleSamples(input, [&](const SeriesSample& sample) {
    const float tick_length = sample.slot_width * kBarTickSlotRatio;
    if (sample.x + tick_length < input.plot.left ||
        sample.x - tick_length > input.plot.right) {
      return;
    }

    const Color color = sample.candle.close >= sample.candle.open
                            ? input.config.up
                            : input.config.down;
    float vertical_top = std::min(sample.high_y, sample.low_y);
    float vertical_bottom = std::max(sample.high_y, sample.low_y);
    if (vertical_bottom - vertical_top < line_width) {
      const float center = (vertical_top + vertical_bottom) * 0.5f;
      vertical_top = center - half_line_width;
      vertical_bottom = center + half_line_width;
    }

    AppendClippedQuad(vertices, sample.x - half_line_width, vertical_top,
                      sample.x + half_line_width, vertical_bottom, input.plot,
                      color);
    AppendClippedQuad(vertices, sample.x - tick_length,
                      sample.open_y - half_line_width, sample.x,
                      sample.open_y + half_line_width, input.plot, color);
    AppendClippedQuad(vertices, sample.x, sample.close_y - half_line_width,
                      sample.x + tick_length, sample.close_y + half_line_width,
                      input.plot, color);
  });
}

}  // namespace

size_t SeriesGeometryFloatCapacity(const SeriesGeometryInput& input) {
  size_t quads_per_sample = kCandlestickQuadsPerSample;
  switch (input.config.series_type) {
    case SeriesType::kBar:
      quads_per_sample = kBarQuadsPerSample;
      break;
    case SeriesType::kHollowCandlestick:
      quads_per_sample = kHollowCandlestickQuadsPerSample;
      break;
    case SeriesType::kCandlestick:
      break;
  }
  return SampleCount(input) * quads_per_sample * kFloatsPerQuad;
}

void AppendSeriesGeometry(const SeriesGeometryInput& input,
                          std::vector<float>& vertices) {
  switch (input.config.series_type) {
    case SeriesType::kBar:
      AppendBarGeometry(input, vertices);
      return;
    case SeriesType::kHollowCandlestick:
      AppendHollowCandlestickGeometry(input, vertices);
      return;
    case SeriesType::kCandlestick:
      AppendCandlestickGeometry(input, vertices);
      return;
  }
}

}  // namespace trading_charts::internal
