// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_TRIANGLE_GEOMETRY_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_TRIANGLE_GEOMETRY_H_

#include <algorithm>
#include <array>
#include <cstddef>
#include <utility>
#include <vector>

#include "cpp/chart_engine.h"

namespace trading_charts::internal {

inline constexpr size_t kFloatsPerVertex = 6;
inline constexpr size_t kVerticesPerQuad = 6;
inline constexpr size_t kFloatsPerQuad = kFloatsPerVertex * kVerticesPerQuad;

struct ColoredVertex {
  float x = 0.0f;
  float y = 0.0f;
  Color color;
};

inline void AppendVertex(std::vector<float>& out, float x, float y,
                         const Color& color) {
  out.push_back(x);
  out.push_back(y);
  out.push_back(color.r);
  out.push_back(color.g);
  out.push_back(color.b);
  out.push_back(color.a);
}

inline void AppendQuad(std::vector<float>& out, float left, float top,
                       float right, float bottom, const Color& color) {
  if (!(right > left) || !(bottom > top)) {
    return;
  }
  AppendVertex(out, left, top, color);
  AppendVertex(out, right, top, color);
  AppendVertex(out, right, bottom, color);
  AppendVertex(out, left, top, color);
  AppendVertex(out, right, bottom, color);
  AppendVertex(out, left, bottom, color);
}

inline void AppendClippedQuad(std::vector<float>& out, float left, float top,
                              float right, float bottom, const Rect& clip,
                              const Color& color) {
  AppendQuad(out, std::max(left, clip.left), std::max(top, clip.top),
             std::min(right, clip.right), std::min(bottom, clip.bottom), color);
}

inline Color InterpolateColor(const Color& first, const Color& second,
                              float amount) {
  return Color{
      first.r + (second.r - first.r) * amount,
      first.g + (second.g - first.g) * amount,
      first.b + (second.b - first.b) * amount,
      first.a + (second.a - first.a) * amount,
  };
}

inline ColoredVertex InterpolateVertex(const ColoredVertex& first,
                                       const ColoredVertex& second,
                                       float amount) {
  return ColoredVertex{
      first.x + (second.x - first.x) * amount,
      first.y + (second.y - first.y) * amount,
      InterpolateColor(first.color, second.color, amount),
  };
}

inline void AppendTriangle(std::vector<float>& out, const ColoredVertex& first,
                           const ColoredVertex& second,
                           const ColoredVertex& third) {
  AppendVertex(out, first.x, first.y, first.color);
  AppendVertex(out, second.x, second.y, second.color);
  AppendVertex(out, third.x, third.y, third.color);
}

// Clips one colored triangle against an axis-aligned rect without heap
// allocation. Clipped vertices interpolate RGBA alongside their positions.
inline void AppendClippedTriangle(std::vector<float>& out,
                                  const ColoredVertex& first,
                                  const ColoredVertex& second,
                                  const ColoredVertex& third,
                                  const Rect& clip) {
  enum class Edge : std::uint8_t { kLeft, kRight, kTop, kBottom };
  std::array<ColoredVertex, 8> input{};
  std::array<ColoredVertex, 8> output{};
  input[0] = first;
  input[1] = second;
  input[2] = third;
  size_t input_count = 3;

  const auto inside = [&](const ColoredVertex& vertex, Edge edge) {
    switch (edge) {
      case Edge::kLeft:
        return vertex.x >= clip.left;
      case Edge::kRight:
        return vertex.x <= clip.right;
      case Edge::kTop:
        return vertex.y >= clip.top;
      case Edge::kBottom:
        return vertex.y <= clip.bottom;
    }
    return false;
  };
  const auto intersection = [&](const ColoredVertex& start,
                                const ColoredVertex& end, Edge edge) {
    const bool vertical = edge == Edge::kLeft || edge == Edge::kRight;
    const float boundary = edge == Edge::kLeft    ? clip.left
                           : edge == Edge::kRight ? clip.right
                           : edge == Edge::kTop   ? clip.top
                                                  : clip.bottom;
    const float start_value = vertical ? start.x : start.y;
    const float end_value = vertical ? end.x : end.y;
    const float amount = (boundary - start_value) / (end_value - start_value);
    return InterpolateVertex(start, end, std::clamp(amount, 0.0f, 1.0f));
  };

  for (Edge edge : {Edge::kLeft, Edge::kRight, Edge::kTop, Edge::kBottom}) {
    if (input_count == 0) {
      return;
    }
    size_t output_count = 0;
    ColoredVertex previous = input[input_count - 1];
    bool previous_inside = inside(previous, edge);
    for (size_t index = 0; index < input_count; ++index) {
      const ColoredVertex current = input[index];
      const bool current_inside = inside(current, edge);
      if (current_inside != previous_inside) {
        output[output_count++] = intersection(previous, current, edge);
      }
      if (current_inside) {
        output[output_count++] = current;
      }
      previous = current;
      previous_inside = current_inside;
    }
    input.swap(output);
    input_count = output_count;
  }

  for (size_t index = 1; index + 1 < input_count; ++index) {
    AppendTriangle(out, input[0], input[index], input[index + 1]);
  }
}

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_TRIANGLE_GEOMETRY_H_
