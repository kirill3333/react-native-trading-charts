// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include "cpp/internal/series_geometry.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <vector>

#include "cpp/internal/trading_time.h"
#include "cpp/internal/triangle_geometry.h"

namespace trading_charts::internal {
namespace {

constexpr size_t kCandlestickQuadsPerSample = 2;
constexpr size_t kHollowCandlestickQuadsPerSample = 6;
constexpr size_t kBarQuadsPerSample = 3;
constexpr size_t kLineQuadsPerSample = 8;
constexpr size_t kAreaQuadsPerSample = kLineQuadsPerSample + 1;
constexpr size_t kRoundedCandlestickQuadsPerSample = 11;
constexpr size_t kRoundedHollowCandlestickQuadsPerSample = 22;
constexpr float kBarTickSlotRatio = 0.45f;
constexpr float kLineMiterLimit = 4.0f;
constexpr float kPi = 3.14159265358979323846f;
constexpr size_t kMaxCornerSegments = 4;
constexpr size_t kMaxRoundedBoundaryPoints = 4 * (kMaxCornerSegments + 1);

struct SeriesSample {
  const Candle& candle;
  float x = 0.0f;
  float slot_width = 0.0f;
  float open_y = 0.0f;
  float high_y = 0.0f;
  float low_y = 0.0f;
  float close_y = 0.0f;
};

struct LinePoint {
  double timestamp = 0.0;
  double value = 0.0;
  size_t index = 0;
  float x = 0.0f;
  float y = 0.0f;
};

struct Vector2 {
  float x = 0.0f;
  float y = 0.0f;
};

struct ColoredQuad {
  std::array<Vector2, 4> points;
  std::array<bool, 4> transparent{};
};

int RoundedCornerSegments(float radius, float display_scale) {
  const float scale = display_scale > 0.0f ? display_scale : 1.0f;
  return std::clamp(static_cast<int>(std::ceil(radius / (2.0f * scale))), 1,
                    static_cast<int>(kMaxCornerSegments));
}

size_t BuildRoundedRectBoundary(
    float left, float top, float right, float bottom, float radius,
    int corner_segments,
    std::array<Vector2, kMaxRoundedBoundaryPoints>& points) {
  const std::array<Vector2, 4> centers = {
      Vector2{right - radius, top + radius},
      Vector2{right - radius, bottom - radius},
      Vector2{left + radius, bottom - radius},
      Vector2{left + radius, top + radius},
  };
  const std::array<float, 4> start_angles = {
      -kPi * 0.5f,
      0.0f,
      kPi * 0.5f,
      kPi,
  };
  size_t count = 0;
  for (size_t corner = 0; corner < centers.size(); ++corner) {
    for (int segment = 0; segment <= corner_segments; ++segment) {
      const float amount =
          static_cast<float>(segment) / static_cast<float>(corner_segments);
      const float angle = start_angles[corner] + amount * kPi * 0.5f;
      points[count++] = Vector2{
          centers[corner].x + std::cos(angle) * radius,
          centers[corner].y + std::sin(angle) * radius,
      };
    }
  }
  return count;
}

void AppendSolidTriangle(std::vector<float>& vertices, Vector2 first,
                         Vector2 second, Vector2 third, const Rect& clip,
                         const Color& color) {
  AppendClippedTriangle(vertices, ColoredVertex{first.x, first.y, color},
                        ColoredVertex{second.x, second.y, color},
                        ColoredVertex{third.x, third.y, color}, clip);
}

void AppendRoundedRect(std::vector<float>& vertices, float left, float top,
                       float right, float bottom, float requested_radius,
                       float display_scale, const Rect& clip,
                       const Color& color) {
  if (!(right > left) || !(bottom > top)) {
    return;
  }
  const float radius = std::min(
      requested_radius, std::min((right - left) * 0.5f, (bottom - top) * 0.5f));
  if (!(radius > 0.0f)) {
    AppendClippedQuad(vertices, left, top, right, bottom, clip, color);
    return;
  }
  const int corner_segments = RoundedCornerSegments(radius, display_scale);
  std::array<Vector2, kMaxRoundedBoundaryPoints> boundary{};
  const size_t count = BuildRoundedRectBoundary(
      left, top, right, bottom, radius, corner_segments, boundary);
  const Vector2 center{(left + right) * 0.5f, (top + bottom) * 0.5f};
  for (size_t index = 0; index < count; ++index) {
    AppendSolidTriangle(vertices, center, boundary[index],
                        boundary[(index + 1) % count], clip, color);
  }
}

void AppendRoundedRectOutline(std::vector<float>& vertices, float left,
                              float top, float right, float bottom,
                              float requested_radius, float stroke_width,
                              float display_scale, const Rect& clip,
                              const Color& color) {
  const float radius = std::min(
      requested_radius, std::min((right - left) * 0.5f, (bottom - top) * 0.5f));
  const float inner_left = left + stroke_width;
  const float inner_top = top + stroke_width;
  const float inner_right = right - stroke_width;
  const float inner_bottom = bottom - stroke_width;
  if (!(radius > 0.0f) || !(inner_right > inner_left) ||
      !(inner_bottom > inner_top)) {
    AppendRoundedRect(vertices, left, top, right, bottom, requested_radius,
                      display_scale, clip, color);
    return;
  }

  const int corner_segments = RoundedCornerSegments(radius, display_scale);
  const float inner_radius =
      std::min(std::max(0.0f, radius - stroke_width),
               std::min((inner_right - inner_left) * 0.5f,
                        (inner_bottom - inner_top) * 0.5f));
  std::array<Vector2, kMaxRoundedBoundaryPoints> outer{};
  std::array<Vector2, kMaxRoundedBoundaryPoints> inner{};
  const size_t count = BuildRoundedRectBoundary(left, top, right, bottom,
                                                radius, corner_segments, outer);
  BuildRoundedRectBoundary(inner_left, inner_top, inner_right, inner_bottom,
                           inner_radius, corner_segments, inner);
  for (size_t index = 0; index < count; ++index) {
    const size_t next = (index + 1) % count;
    AppendSolidTriangle(vertices, outer[index], outer[next], inner[next], clip,
                        color);
    AppendSolidTriangle(vertices, outer[index], inner[next], inner[index], clip,
                        color);
  }
}

Vector2 Add(Vector2 first, Vector2 second) {
  return Vector2{first.x + second.x, first.y + second.y};
}

Vector2 Subtract(Vector2 first, Vector2 second) {
  return Vector2{first.x - second.x, first.y - second.y};
}

Vector2 Multiply(Vector2 value, float amount) {
  return Vector2{value.x * amount, value.y * amount};
}

float Dot(Vector2 first, Vector2 second) {
  return first.x * second.x + first.y * second.y;
}

float Cross(Vector2 first, Vector2 second) {
  return first.x * second.y - first.y * second.x;
}

float Length(Vector2 value) { return std::sqrt(Dot(value, value)); }

Vector2 Normalize(Vector2 value) {
  const float length = Length(value);
  return length > 1e-6f ? Multiply(value, 1.0f / length) : Vector2{};
}

Vector2 Direction(const LinePoint& first, const LinePoint& second) {
  return Normalize(Vector2{second.x - first.x, second.y - first.y});
}

Vector2 Normal(Vector2 direction) { return Vector2{-direction.y, direction.x}; }

Color LineColorAtY(const SeriesGeometryInput& input, float y,
                   float alpha_scale = 1.0f) {
  Color color = input.config.line;
  if (input.config.line_gradient_enabled && input.plot.Height() > 0.0f) {
    const float amount =
        std::clamp((y - input.plot.top) / input.plot.Height(), 0.0f, 1.0f);
    color = InterpolateColor(input.config.line_gradient_top,
                             input.config.line_gradient_bottom, amount);
  }
  color.a *= alpha_scale;
  return color;
}

ColoredVertex LineVertex(const SeriesGeometryInput& input, Vector2 point,
                         float alpha_scale = 1.0f) {
  return ColoredVertex{point.x, point.y,
                       LineColorAtY(input, point.y, alpha_scale)};
}

void AppendColoredQuad(const SeriesGeometryInput& input,
                       std::vector<float>& vertices, const ColoredQuad& quad) {
  const ColoredVertex a =
      LineVertex(input, quad.points[0], quad.transparent[0] ? 0.0f : 1.0f);
  const ColoredVertex b =
      LineVertex(input, quad.points[1], quad.transparent[1] ? 0.0f : 1.0f);
  const ColoredVertex c =
      LineVertex(input, quad.points[2], quad.transparent[2] ? 0.0f : 1.0f);
  const ColoredVertex d =
      LineVertex(input, quad.points[3], quad.transparent[3] ? 0.0f : 1.0f);
  AppendClippedTriangle(vertices, a, b, c, input.plot);
  AppendClippedTriangle(vertices, a, c, d, input.plot);
}

void AppendColoredTriangle(const SeriesGeometryInput& input,
                           std::vector<float>& vertices, Vector2 first,
                           Vector2 second, Vector2 third,
                           bool first_transparent = false,
                           bool second_transparent = false,
                           bool third_transparent = false) {
  AppendClippedTriangle(
      vertices, LineVertex(input, first, first_transparent ? 0.0f : 1.0f),
      LineVertex(input, second, second_transparent ? 0.0f : 1.0f),
      LineVertex(input, third, third_transparent ? 0.0f : 1.0f), input.plot);
}

class LineStrokeBuilder {
 public:
  LineStrokeBuilder(const SeriesGeometryInput& input,
                    std::vector<float>& vertices)
      : input_(input),
        vertices_(vertices),
        half_width_(input.config.line_width * 0.5f),
        fringe_(std::max(1.0f, input.config.display_scale)) {}

  void AddPoint(const LinePoint& point) {
    if (!has_first_) {
      first_ = point;
      has_first_ = true;
      return;
    }
    if (!has_second_) {
      if (SamePosition(first_, point)) {
        first_ = point;
        return;
      }
      second_ = point;
      has_second_ = true;
      return;
    }
    if (SamePosition(second_, point)) {
      second_ = point;
      return;
    }
    const Vector2 incoming = Direction(first_, second_);
    const Vector2 outgoing = Direction(second_, point);
    EmitSegment(first_, second_, incoming, first_segment_, false);
    EmitJoin(second_, incoming, outgoing);
    first_segment_ = false;
    first_ = second_;
    second_ = point;
  }

  void Finish() {
    if (has_first_ && has_second_) {
      const Vector2 direction = Direction(first_, second_);
      EmitSegment(first_, second_, direction, first_segment_, true);
    }
    has_first_ = false;
    has_second_ = false;
    first_segment_ = true;
  }

 private:
  static bool SamePosition(const LinePoint& first, const LinePoint& second) {
    return std::abs(first.x - second.x) <= 1e-5f &&
           std::abs(first.y - second.y) <= 1e-5f;
  }

  void EmitSegment(const LinePoint& start, const LinePoint& end,
                   Vector2 direction, bool start_cap, bool end_cap) {
    const Vector2 start_point{start.x, start.y};
    const Vector2 end_point{end.x, end.y};
    const Vector2 normal = Normal(direction);
    const Vector2 inner = Multiply(normal, half_width_);
    const Vector2 outer = Multiply(normal, half_width_ + fringe_);
    const Vector2 start_inner_left = Add(start_point, inner);
    const Vector2 start_inner_right = Subtract(start_point, inner);
    const Vector2 end_inner_left = Add(end_point, inner);
    const Vector2 end_inner_right = Subtract(end_point, inner);
    const Vector2 start_outer_left = Add(start_point, outer);
    const Vector2 start_outer_right = Subtract(start_point, outer);
    const Vector2 end_outer_left = Add(end_point, outer);
    const Vector2 end_outer_right = Subtract(end_point, outer);

    AppendColoredQuad(input_, vertices_,
                      ColoredQuad{{start_inner_left, end_inner_left,
                                   end_inner_right, start_inner_right}});
    AppendColoredQuad(input_, vertices_,
                      ColoredQuad{{start_outer_left, end_outer_left,
                                   end_inner_left, start_inner_left},
                                  {true, true}});
    AppendColoredQuad(input_, vertices_,
                      ColoredQuad{{start_inner_right, end_inner_right,
                                   end_outer_right, start_outer_right},
                                  {false, false, true, true}});

    if (start_cap) {
      const Vector2 cap = Multiply(direction, -fringe_);
      AppendColoredQuad(
          input_, vertices_,
          ColoredQuad{{Add(start_inner_right, cap), Add(start_inner_left, cap),
                       start_inner_left, start_inner_right},
                      {true, true}});
    }
    if (end_cap) {
      const Vector2 cap = Multiply(direction, fringe_);
      AppendColoredQuad(
          input_, vertices_,
          ColoredQuad{{end_inner_left, Add(end_inner_left, cap),
                       Add(end_inner_right, cap), end_inner_right},
                      {false, true, true}});
    }
  }

  void EmitJoin(const LinePoint& point, Vector2 incoming, Vector2 outgoing) {
    const float turn = Cross(incoming, outgoing);
    if (std::abs(turn) <= 1e-5f && Dot(incoming, outgoing) > 0.0f) {
      return;
    }

    const Vector2 center{point.x, point.y};
    const Vector2 incoming_normal = Normal(incoming);
    const Vector2 outgoing_normal = Normal(outgoing);
    const float outer_sign = turn < 0.0f ? 1.0f : -1.0f;
    const Vector2 previous_core =
        Add(center, Multiply(incoming_normal, half_width_ * outer_sign));
    const Vector2 next_core =
        Add(center, Multiply(outgoing_normal, half_width_ * outer_sign));
    const Vector2 previous_fringe =
        Add(center,
            Multiply(incoming_normal, (half_width_ + fringe_) * outer_sign));
    const Vector2 next_fringe =
        Add(center,
            Multiply(outgoing_normal, (half_width_ + fringe_) * outer_sign));

    const Vector2 miter = Normalize(Add(incoming_normal, outgoing_normal));
    const float denominator = std::abs(Dot(miter, outgoing_normal));
    const float miter_scale = denominator > 1e-4f
                                  ? 1.0f / denominator
                                  : std::numeric_limits<float>::infinity();
    if (Length(miter) > 1e-6f && miter_scale <= kLineMiterLimit) {
      const Vector2 miter_core =
          Add(center, Multiply(miter, half_width_ * miter_scale * outer_sign));
      const Vector2 miter_fringe = Add(
          center,
          Multiply(miter, (half_width_ + fringe_) * miter_scale * outer_sign));
      AppendColoredTriangle(input_, vertices_, center, previous_core,
                            miter_core);
      AppendColoredTriangle(input_, vertices_, center, miter_core, next_core);
      AppendColoredQuad(input_, vertices_,
                        ColoredQuad{{previous_fringe, miter_fringe, miter_core,
                                     previous_core},
                                    {true, true}});
      AppendColoredQuad(
          input_, vertices_,
          ColoredQuad{{miter_fringe, next_fringe, next_core, miter_core},
                      {true, true}});
    } else {
      AppendColoredTriangle(input_, vertices_, center, previous_core,
                            next_core);
      AppendColoredQuad(
          input_, vertices_,
          ColoredQuad{{previous_fringe, next_fringe, next_core, previous_core},
                      {true, true}});
    }

    // The inside edges of consecutive fixed-width segment quads overlap for
    // ordinary turns. At near-180-degree reversals they can separate, so fill
    // that small bevel explicitly without changing either segment's width.
    if (Dot(incoming, outgoing) < -0.95f) {
      const float inner_sign = -outer_sign;
      const Vector2 previous_inner =
          Add(center, Multiply(incoming_normal, half_width_ * inner_sign));
      const Vector2 next_inner =
          Add(center, Multiply(outgoing_normal, half_width_ * inner_sign));
      const Vector2 previous_inner_fringe =
          Add(center,
              Multiply(incoming_normal, (half_width_ + fringe_) * inner_sign));
      const Vector2 next_inner_fringe =
          Add(center,
              Multiply(outgoing_normal, (half_width_ + fringe_) * inner_sign));
      AppendColoredTriangle(input_, vertices_, center, previous_inner,
                            next_inner);
      AppendColoredQuad(input_, vertices_,
                        ColoredQuad{{previous_inner_fringe, next_inner_fringe,
                                     next_inner, previous_inner},
                                    {true, true}});
    }
  }

  const SeriesGeometryInput& input_;
  std::vector<float>& vertices_;
  float half_width_ = 1.0f;
  float fringe_ = 1.0f;
  LinePoint first_;
  LinePoint second_;
  bool has_first_ = false;
  bool has_second_ = false;
  bool first_segment_ = true;
};

LinePoint InterpolateLinePoint(const LinePoint& first, const LinePoint& second,
                               float amount) {
  const double precise_amount = static_cast<double>(amount);
  return LinePoint{
      first.timestamp + (second.timestamp - first.timestamp) * precise_amount,
      first.value + (second.value - first.value) * precise_amount,
      amount < 1.0f ? first.index : second.index,
      first.x + (second.x - first.x) * amount,
      first.y + (second.y - first.y) * amount,
  };
}

class DashedLineStrokeBuilder {
 public:
  DashedLineStrokeBuilder(const SeriesGeometryInput& input,
                          std::vector<float>& vertices)
      : stroke_(input, vertices),
        dash_(4.0f * std::max(input.config.display_scale, 1.0f)),
        gap_(3.0f * std::max(input.config.display_scale, 1.0f)),
        remaining_(dash_) {}

  void AddPoint(const LinePoint& point) {
    if (!has_previous_) {
      previous_ = point;
      has_previous_ = true;
      return;
    }
    const float dx = point.x - previous_.x;
    const float dy = point.y - previous_.y;
    const float length = std::hypot(dx, dy);
    if (!(length > 1e-5f)) {
      previous_ = point;
      return;
    }

    float consumed = 0.0f;
    while (consumed < length - 1e-5f) {
      const float step = std::min(remaining_, length - consumed);
      const LinePoint start =
          InterpolateLinePoint(previous_, point, consumed / length);
      const LinePoint end =
          InterpolateLinePoint(previous_, point, (consumed + step) / length);
      if (drawing_) {
        if (!dash_open_) {
          stroke_.AddPoint(start);
          dash_open_ = true;
        }
        stroke_.AddPoint(end);
      }
      consumed += step;
      remaining_ -= step;
      if (remaining_ <= 1e-5f) {
        if (drawing_ && dash_open_) {
          stroke_.Finish();
          dash_open_ = false;
        }
        drawing_ = !drawing_;
        remaining_ = drawing_ ? dash_ : gap_;
      }
    }
    previous_ = point;
  }

  void Finish() {
    if (dash_open_) {
      stroke_.Finish();
    }
    has_previous_ = false;
    dash_open_ = false;
    drawing_ = true;
    remaining_ = dash_;
  }

 private:
  LineStrokeBuilder stroke_;
  float dash_ = 4.0f;
  float gap_ = 3.0f;
  float remaining_ = 4.0f;
  LinePoint previous_;
  bool has_previous_ = false;
  bool dash_open_ = false;
  bool drawing_ = true;
};

class DashedLineCapacityBuilder {
 public:
  explicit DashedLineCapacityBuilder(float display_scale)
      : dash_(4.0f * std::max(display_scale, 1.0f)),
        gap_(3.0f * std::max(display_scale, 1.0f)),
        remaining_(dash_) {}

  void AddPoint(const LinePoint& point) {
    ++point_count_;
    if (!has_previous_) {
      previous_ = point;
      has_previous_ = true;
      return;
    }
    const float length =
        std::hypot(point.x - previous_.x, point.y - previous_.y);
    float consumed = 0.0f;
    while (consumed < length - 1e-5f) {
      const float step = std::min(remaining_, length - consumed);
      if (drawing_) {
        ++drawn_step_count_;
      }
      consumed += step;
      remaining_ -= step;
      if (remaining_ <= 1e-5f) {
        drawing_ = !drawing_;
        remaining_ = drawing_ ? dash_ : gap_;
      }
    }
    previous_ = point;
  }

  void Finish() {
    has_previous_ = false;
    drawing_ = true;
    remaining_ = dash_;
  }

  size_t DrawnStepCount() const { return drawn_step_count_; }
  size_t PointCount() const { return point_count_; }

 private:
  float dash_ = 4.0f;
  float gap_ = 3.0f;
  float remaining_ = 4.0f;
  LinePoint previous_;
  size_t drawn_step_count_ = 0;
  size_t point_count_ = 0;
  bool has_previous_ = false;
  bool drawing_ = true;
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
  return input.config.logical_spacing
             ? 1.0
             : NominalResolutionMilliseconds(input.config.resolution);
}

// Maps a series candle to its logical x domain. `hint` is a cursor into
// `logical_reference` that only moves forward: consecutive samples are
// timestamp-sorted, so the amortized lookup is O(1) instead of a binary
// search per sample. The caller seeds it with one binary search.
double CandleX(const SeriesGeometryInput& input, size_t index,
               std::vector<Candle>::const_iterator& hint) {
  if (!input.config.logical_spacing) {
    return input.candles[index].timestamp;
  }
  if (input.logical_reference == nullptr) {
    return static_cast<double>(index);
  }
  const double timestamp = input.candles[index].timestamp;
  const std::vector<Candle>& reference = *input.logical_reference;
  while (hint != reference.end() && hint->timestamp < timestamp) {
    ++hint;
  }
  if (hint == reference.end() || hint->timestamp != timestamp) {
    return std::numeric_limits<double>::quiet_NaN();
  }
  return static_cast<double>(std::distance(reference.begin(), hint));
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
  // Seed the monotonic logical-reference cursor with a single binary search;
  // afterwards CandleX advances it linearly.
  std::vector<Candle>::const_iterator hint = input.candles.begin();
  if (input.logical_reference != nullptr) {
    hint = input.first_index < input.end_index
               ? std::lower_bound(
                     input.logical_reference->begin(),
                     input.logical_reference->end(),
                     input.candles[input.first_index].timestamp,
                     [](const Candle& candle, double value) {
                       return candle.timestamp < value;
                     })
               : input.logical_reference->begin();
  }

  for (size_t index = input.first_index; index < input.end_index;
       index += stride) {
    const Candle& candle = input.candles[index];
    const double candle_x = CandleX(input, index, hint);
    if (!std::isfinite(candle_x)) {
      continue;
    }
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
        ProjectX(input, candle_x),
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
    const float body_left =
        std::max(input.plot.left, sample.x - body_width * 0.5f);
    const float body_right =
        std::min(input.plot.right, sample.x + body_width * 0.5f);
    if (input.config.candle_radius > 0.0f) {
      AppendRoundedRect(vertices, body_left, body_top, body_right, body_bottom,
                        input.config.candle_radius, input.config.display_scale,
                        input.plot, color);
    } else {
      AppendQuad(vertices, body_left, body_top, body_right, body_bottom, color);
    }
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
      if (input.config.candle_radius > 0.0f) {
        AppendRoundedRect(vertices, body_left, body_top, body_right,
                          body_bottom, input.config.candle_radius,
                          input.config.display_scale, input.plot, color);
      } else {
        AppendQuad(vertices, body_left, body_top, body_right, body_bottom,
                   color);
      }
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
      if (input.config.candle_radius > 0.0f) {
        AppendRoundedRect(vertices, body_left, body_top, body_right,
                          body_bottom, input.config.candle_radius,
                          input.config.display_scale, input.plot, color);
      } else {
        AppendQuad(vertices, body_left, body_top, body_right, body_bottom,
                   color);
      }
      return;
    }

    if (input.config.candle_radius > 0.0f) {
      AppendRoundedRectOutline(vertices, body_left, body_top, body_right,
                               body_bottom, input.config.candle_radius,
                               wick_width, input.config.display_scale,
                               input.plot, color);
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

Color AreaFillColorAtY(const SeriesGeometryInput& input, float y) {
  const float height = input.plot.Height();
  if (!(height > 0.0f)) {
    return input.config.area_fill_bottom;
  }
  const float amount = std::clamp((y - input.plot.top) / height, 0.0f, 1.0f);
  return InterpolateColor(input.config.area_fill_top,
                          input.config.area_fill_bottom, amount);
}

class AreaFillBuilder {
 public:
  AreaFillBuilder(const SeriesGeometryInput& input,
                  std::vector<float>& vertices)
      : input_(input), vertices_(vertices) {}

  void AddPoint(const LinePoint& point) {
    if (!has_previous_) {
      previous_ = point;
      has_previous_ = true;
      return;
    }
    if (previous_.x == point.x && previous_.y == point.y) {
      previous_ = point;
      return;
    }
    const ColoredVertex previous_top{previous_.x, previous_.y,
                                     AreaFillColorAtY(input_, previous_.y)};
    const ColoredVertex current_top{point.x, point.y,
                                    AreaFillColorAtY(input_, point.y)};
    const ColoredVertex current_bottom{point.x, input_.plot.bottom,
                                       input_.config.area_fill_bottom};
    const ColoredVertex previous_bottom{previous_.x, input_.plot.bottom,
                                        input_.config.area_fill_bottom};
    AppendClippedTriangle(vertices_, previous_top, current_top, current_bottom,
                          input_.plot);
    AppendClippedTriangle(vertices_, previous_top, current_bottom,
                          previous_bottom, input_.plot);
    previous_ = point;
  }

  void Finish() { has_previous_ = false; }

 private:
  const SeriesGeometryInput& input_;
  std::vector<float>& vertices_;
  LinePoint previous_;
  bool has_previous_ = false;
};

template <typename Builder>
void AppendLinePath(const SeriesGeometryInput& input, Builder& builder) {
  if (input.first_index >= input.end_index ||
      input.end_index > input.candles.size()) {
    return;
  }

  std::vector<Candle>::const_iterator hint = input.candles.begin();
  if (input.logical_reference != nullptr) {
    hint = std::lower_bound(input.logical_reference->begin(),
                            input.logical_reference->end(),
                            input.candles[input.first_index].timestamp,
                            [](const Candle& candle, double value) {
                              return candle.timestamp < value;
                            });
  }

  bool has_bucket = false;
  int64_t bucket_column = 0;
  LinePoint bucket_first;
  LinePoint bucket_minimum;
  LinePoint bucket_maximum;
  LinePoint bucket_last;
  const auto flush_bucket = [&]() {
    if (!has_bucket) {
      return;
    }
    std::array<LinePoint, 4> points{
        bucket_first,
        bucket_minimum,
        bucket_maximum,
        bucket_last,
    };
    std::sort(points.begin(), points.end(),
              [](const LinePoint& first, const LinePoint& second) {
                return first.index < second.index;
              });
    size_t previous_index = std::numeric_limits<size_t>::max();
    for (const LinePoint& point : points) {
      if (point.index != previous_index) {
        builder.AddPoint(point);
        previous_index = point.index;
      }
    }
    has_bucket = false;
  };

  bool has_previous_timestamp = false;
  double previous_timestamp = 0.0;
  for (size_t index = input.first_index; index < input.end_index; ++index) {
    const Candle& candle = input.candles[index];
    const double domain_x = CandleX(input, index, hint);
    if (!std::isfinite(domain_x)) {
      continue;
    }
    const double value = CandleValue(candle, input.config.line_source);
    const LinePoint point{
        candle.timestamp,       value, index, ProjectX(input, domain_x),
        ProjectY(input, value),
    };

    if (has_previous_timestamp && input.config.line_gap_threshold_ms > 0.0 &&
        candle.timestamp - previous_timestamp >
            input.config.line_gap_threshold_ms) {
      flush_bucket();
      builder.Finish();
    }
    previous_timestamp = candle.timestamp;
    has_previous_timestamp = true;

    const int64_t column =
        static_cast<int64_t>(std::floor(static_cast<double>(point.x)));
    if (!has_bucket || column != bucket_column) {
      flush_bucket();
      has_bucket = true;
      bucket_column = column;
      bucket_first = point;
      bucket_minimum = point;
      bucket_maximum = point;
      bucket_last = point;
      continue;
    }
    if (point.value < bucket_minimum.value) {
      bucket_minimum = point;
    }
    if (point.value > bucket_maximum.value) {
      bucket_maximum = point;
    }
    bucket_last = point;
  }
  flush_bucket();
  builder.Finish();
}

void AppendLineGeometry(const SeriesGeometryInput& input,
                        std::vector<float>& vertices) {
  if (input.config.line_dashed) {
    DashedLineStrokeBuilder stroke(input, vertices);
    AppendLinePath(input, stroke);
    return;
  }
  LineStrokeBuilder stroke(input, vertices);
  AppendLinePath(input, stroke);
}

void AppendAreaGeometry(const SeriesGeometryInput& input,
                        std::vector<float>& vertices) {
  AreaFillBuilder fill(input, vertices);
  AppendLinePath(input, fill);
  if (input.config.line_dashed) {
    DashedLineStrokeBuilder stroke(input, vertices);
    AppendLinePath(input, stroke);
    return;
  }
  LineStrokeBuilder stroke(input, vertices);
  AppendLinePath(input, stroke);
}

}  // namespace

size_t SeriesQuadsPerSample(SeriesType type) {
  switch (type) {
    case SeriesType::kBar:
      return kBarQuadsPerSample;
    case SeriesType::kHollowCandlestick:
      return kHollowCandlestickQuadsPerSample;
    case SeriesType::kCandlestick:
      return kCandlestickQuadsPerSample;
    case SeriesType::kHistogram:
      return 1;
    case SeriesType::kLine:
      return kLineQuadsPerSample;
    case SeriesType::kArea:
      return kAreaQuadsPerSample;
  }
  return kCandlestickQuadsPerSample;
}

size_t SeriesGeometryFloatCapacity(const SeriesGeometryInput& input) {
  if (input.config.series_type == SeriesType::kHistogram) {
    return 0;
  }
  if (IsLineLikeSeries(input.config.series_type)) {
    if (input.config.line_dashed) {
      DashedLineCapacityBuilder builder(input.config.display_scale);
      AppendLinePath(input, builder);
      const size_t stroke_quads =
          builder.DrawnStepCount() * kLineQuadsPerSample;
      const size_t fill_quads = input.config.series_type == SeriesType::kArea
                                    ? builder.PointCount()
                                    : 0;
      return (stroke_quads + fill_quads) * kFloatsPerQuad;
    }
    const size_t visible_count = input.end_index - input.first_index;
    const size_t columns =
        static_cast<size_t>(std::max(1.0f, std::ceil(input.plot.Width()))) + 2;
    const size_t point_count = std::min(visible_count, columns * 4);
    return point_count * SeriesQuadsPerSample(input.config.series_type) *
           kFloatsPerQuad;
  }
  size_t quads_per_sample = SeriesQuadsPerSample(input.config.series_type);
  if (input.config.candle_radius > 0.0f) {
    if (input.config.series_type == SeriesType::kCandlestick) {
      quads_per_sample = kRoundedCandlestickQuadsPerSample;
    } else if (input.config.series_type == SeriesType::kHollowCandlestick) {
      quads_per_sample = kRoundedHollowCandlestickQuadsPerSample;
    }
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
    case SeriesType::kHistogram:
      return;
    case SeriesType::kLine:
      AppendLineGeometry(input, vertices);
      return;
    case SeriesType::kArea:
      AppendAreaGeometry(input, vertices);
      return;
  }
}

}  // namespace trading_charts::internal
