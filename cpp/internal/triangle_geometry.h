// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_TRIANGLE_GEOMETRY_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_TRIANGLE_GEOMETRY_H_

#include <algorithm>
#include <cstddef>
#include <vector>

#include "cpp/chart_engine.h"

namespace trading_charts::internal {

inline constexpr size_t kFloatsPerVertex = 6;
inline constexpr size_t kVerticesPerQuad = 6;
inline constexpr size_t kFloatsPerQuad = kFloatsPerVertex * kVerticesPerQuad;

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

}  // namespace trading_charts::internal

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_INTERNAL_TRIANGLE_GEOMETRY_H_
