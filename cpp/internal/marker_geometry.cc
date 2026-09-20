// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT
#include "cpp/internal/marker_geometry.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <memory>
#include <string>
#include <vector>

namespace trading_charts::internal {
namespace {
using Point = std::array<float, 2>;
using Vertex = std::array<float, kMarkerFloatsPerVertex>;
using MarkerColor = std::array<float, 4>;
constexpr float kPi = 3.14159265358979323846f;
constexpr size_t kCornerSegments = 12;
constexpr size_t kPerimeterPoints = (kCornerSegments + 1) * 4;
constexpr float kWhiteU = 15.5f / 16.0f;
constexpr float kWhiteV = 5.5f / 6.0f;

MarkerColor ReadColor(const Marker& marker, MarkerField field) {
  const size_t start = static_cast<size_t>(field);
  return {static_cast<float>(marker.values[start]),
          static_cast<float>(marker.values[start + 1]),
          static_cast<float>(marker.values[start + 2]),
          static_cast<float>(marker.values[start + 3])};
}

// Interpolate UVs as well as positions when clipping. This keeps text and
// rounded borders inside the exact main-pane rect without platform layout.
void Triangle(MarkerSnapshot* out, const Vertex& a, const Vertex& b,
              const Vertex& c, const Rect& clip) {
  std::array<Vertex, 8> input{};
  std::array<Vertex, 8> output{};
  input[0] = a;
  input[1] = b;
  input[2] = c;
  size_t count = 3;
  const std::array<float, 4> bounds{clip.left, clip.right, clip.top,
                                    clip.bottom};
  for (size_t edge = 0; edge < 4 && count > 0; ++edge) {
    const size_t axis = edge / 2;
    const auto inside = [&](const Vertex& vertex) {
      return edge % 2 == 0 ? vertex[axis] >= bounds[edge]
                           : vertex[axis] <= bounds[edge];
    };
    size_t next_count = 0;
    Vertex previous = input[count - 1];
    bool was_inside = inside(previous);
    for (size_t index = 0; index < count; ++index) {
      const Vertex current = input[index];
      const bool is_inside = inside(current);
      if (is_inside != was_inside) {
        const float t =
            (bounds[edge] - previous[axis]) / (current[axis] - previous[axis]);
        Vertex intersection{};
        for (size_t component = 0; component < intersection.size();
             ++component) {
          intersection[component] =
              previous[component] +
              t * (current[component] - previous[component]);
        }
        output[next_count++] = intersection;
      }
      if (is_inside) {
        output[next_count++] = current;
      }
      previous = current;
      was_inside = is_inside;
    }
    input.swap(output);
    count = next_count;
  }
  for (size_t index = 1; index + 1 < count; ++index) {
    for (const Vertex& vertex : {input[0], input[index], input[index + 1]}) {
      out->vertices.insert(out->vertices.end(), vertex.begin(), vertex.end());
    }
  }
}

Vertex MakeVertex(Point point, const MarkerColor& color, float u = kWhiteU,
                  float v = kWhiteV) {
  return {point[0], point[1], u, v, color[0], color[1], color[2], color[3]};
}

std::array<Point, kPerimeterPoints> Perimeter(const Rect& rect, float radius) {
  std::array<Point, kPerimeterPoints> points{};
  const std::array<Point, 4> centers{
      {{rect.right - radius, rect.top + radius},
       {rect.right - radius, rect.bottom - radius},
       {rect.left + radius, rect.bottom - radius},
       {rect.left + radius, rect.top + radius}}};
  for (size_t corner = 0; corner < 4; ++corner) {
    for (size_t step = 0; step <= kCornerSegments; ++step) {
      const float angle =
          (static_cast<float>(corner) - 1.0f +
           static_cast<float>(step) / static_cast<float>(kCornerSegments)) *
          kPi / 2.0f;
      points[corner * (kCornerSegments + 1) + step] = {
          centers[corner][0] + std::cos(angle) * radius,
          centers[corner][1] + std::sin(angle) * radius};
    }
  }
  return points;
}

void Badge(MarkerSnapshot* out, const Marker& marker, const Rect& box,
           const Rect& clip, float scale) {
  const auto dim = [&](MarkerField field) {
    return static_cast<float>(marker.Get(field)) * scale;
  };
  const float radius = std::min(dim(MarkerField::kBorderRadius),
                                std::min(box.Width(), box.Height()) / 2.0f);
  const float border = std::min(dim(MarkerField::kBorderWidth),
                                std::min(box.Width(), box.Height()) / 2.0f);
  const Rect inner{box.left + border, box.top + border, box.right - border,
                   box.bottom - border};
  const auto outer_points = Perimeter(box, radius);
  if (marker.descriptor) {
    out->hit_regions.push_back({outer_points,
                                {clip.left, clip.top, clip.right, clip.bottom},
                                marker.descriptor});
  }
  const auto inner_points = Perimeter(inner, std::max(0.0f, radius - border));
  const MarkerColor fill = ReadColor(marker, MarkerField::kBackgroundR);
  const MarkerColor stroke = ReadColor(marker, MarkerField::kBorderR);
  const Vertex center = MakeVertex(
      {(box.left + box.right) / 2.0f, (box.top + box.bottom) / 2.0f}, fill);
  for (size_t index = 0; index < kPerimeterPoints; ++index) {
    const size_t next = (index + 1) % kPerimeterPoints;
    Triangle(out, center, MakeVertex(inner_points[index], fill),
             MakeVertex(inner_points[next], fill), clip);
    if (border > 0.0f) {
      Triangle(out, MakeVertex(outer_points[index], stroke),
               MakeVertex(outer_points[next], stroke),
               MakeVertex(inner_points[index], stroke), clip);
      Triangle(out, MakeVertex(inner_points[index], stroke),
               MakeVertex(outer_points[next], stroke),
               MakeVertex(inner_points[next], stroke), clip);
    }
  }
  const float advance = dim(MarkerField::kAdvance);
  const float cell_width = dim(MarkerField::kCellWidth);
  const float cell_height = dim(MarkerField::kCellHeight);
  const float x = (box.left + box.right -
                   advance * static_cast<float>(marker.text.size())) /
                      2.0f -
                  2.0f * scale;
  const float y = (box.top + box.bottom - cell_height) / 2.0f;
  const MarkerColor text = ReadColor(marker, MarkerField::kTextR);
  for (size_t index = 0; index < marker.text.size(); ++index) {
    const int glyph = static_cast<int>(marker.text[index]) - 32;
    const float u = static_cast<float>(glyph % kMarkerAtlasColumns) / 16.0f;
    const int row = glyph / kMarkerAtlasColumns;
    const float v = static_cast<float>(row) / 6.0f;
    const float left = x + advance * static_cast<float>(index);
    const Vertex a = MakeVertex({left, y}, text, u, v);
    const Vertex b =
        MakeVertex({left + cell_width, y}, text, u + 1.0f / 16.0f, v);
    const Vertex c = MakeVertex({left + cell_width, y + cell_height}, text,
                                u + 1.0f / 16.0f, v + 1.0f / 6.0f);
    const Vertex d =
        MakeVertex({left, y + cell_height}, text, u, v + 1.0f / 6.0f);
    Triangle(out, a, b, c, clip);
    Triangle(out, a, c, d, clip);
  }
}
}  // namespace

std::shared_ptr<const MarkerSnapshot> BuildMarkers(
    const MarkerStore& store, const std::vector<Candle>& candles,
    const RenderSnapshot& snapshot, double domain_min, double domain_max) {
  auto out = std::make_shared<MarkerSnapshot>();
  if (!snapshot.has_visible_candles || store.Size() == 0 || candles.empty()) {
    return out;
  }
  const size_t first = snapshot.first_visible_index;
  const size_t last = std::min(snapshot.last_visible_index, candles.size() - 1);
  const auto end =
      store.Times().upper_bound({candles[last].timestamp, UINT64_MAX});
  auto candle = candles.begin() + static_cast<std::ptrdiff_t>(first);
  double previous_timestamp = -1.0;
  std::array<float, 2> stack{};
  const float scale = snapshot.config.display_scale;
  const Rect& plot = snapshot.plot;
  const auto project_y = [&](double value) {
    return plot.bottom - static_cast<float>((value - snapshot.visible_y_min) /
                                            (snapshot.visible_y_max -
                                             snapshot.visible_y_min)) *
                             plot.Height();
  };
  for (auto it = store.Times().lower_bound({candles[first].timestamp, 0});
       it != end; ++it) {
    const double timestamp = it->first.first;
    candle = std::lower_bound(
        candle, candles.begin() + static_cast<std::ptrdiff_t>(last + 1),
        timestamp, [](const Candle& value, double time) {
          return value.timestamp < time;
        });
    if (candle == candles.end() || candle->timestamp != timestamp) {
      continue;
    }
    if (timestamp != previous_timestamp) {
      stack = {};
      previous_timestamp = timestamp;
    }
    const Marker& marker = store.At(it->second);
    const auto dim = [&](MarkerField field) {
      return static_cast<float>(marker.Get(field)) * scale;
    };
    const double domain = snapshot.config.logical_spacing
                              ? static_cast<double>(candle - candles.begin())
                              : timestamp;
    const float x = plot.left + static_cast<float>((domain - domain_min) /
                                                   (domain_max - domain_min)) *
                                    plot.Width();
    const float width = std::max(
        dim(MarkerField::kMinWidth),
        dim(MarkerField::kAdvance) * static_cast<float>(marker.text.size()) +
            2.0f * (dim(MarkerField::kPaddingHorizontal) +
                    dim(MarkerField::kBorderWidth)));
    const float height =
        std::max(dim(MarkerField::kMinHeight),
                 dim(MarkerField::kLineHeight) +
                     2.0f * (dim(MarkerField::kPaddingVertical) +
                             dim(MarkerField::kBorderWidth)));
    const bool below = marker.Get(MarkerField::kBelow) != 0.0;
    const size_t side = below ? 1 : 0;
    const float distance = std::max(stack[side], dim(MarkerField::kOffset));
    const float top = below ? project_y(candle->low) + distance
                            : project_y(candle->high) - distance - height;
    stack[side] = distance + height + 4.0f * scale;
    const Rect box{x - width / 2.0f, top, x + width / 2.0f, top + height};
    if (box.right <= plot.left || box.left >= plot.right ||
        box.bottom <= plot.top || box.top >= plot.bottom) {
      continue;
    }
    if (!std::isfinite(width) || !std::isfinite(height) ||
        !std::isfinite(top)) {
      continue;
    }
    const float font_size =
        static_cast<float>(marker.Get(MarkerField::kFontSize));
    if (out->batches.empty() || out->batches.back().font_size != font_size) {
      out->batches.push_back(
          {font_size, out->vertices.size() / kMarkerFloatsPerVertex, 0});
    }
    const size_t before = out->vertices.size();
    Badge(out.get(), marker, box, plot, scale);
    out->batches.back().vertex_count +=
        (out->vertices.size() - before) / kMarkerFloatsPerVertex;
    ++out->visible_count;
  }
  return out;
}
}  // namespace trading_charts::internal

namespace trading_charts {
std::string HitTestMarker(const MarkerSnapshot& snapshot, float x, float y) {
  if (!std::isfinite(x) || !std::isfinite(y)) {
    return {};
  }
  for (auto it = snapshot.hit_regions.rbegin();
       it != snapshot.hit_regions.rend(); ++it) {
    if (x < it->clip[0] || y < it->clip[1] || x > it->clip[2] ||
        y > it->clip[3]) {
      continue;
    }
    bool inside = true;
    for (size_t index = 0; index < it->contour.size(); ++index) {
      const auto& a = it->contour[index];
      const auto& b = it->contour[(index + 1) % it->contour.size()];
      if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -0.0001f) {
        inside = false;
        break;
      }
    }
    if (inside && it->descriptor) {
      return *it->descriptor;
    }
  }
  return {};
}
}  // namespace trading_charts
