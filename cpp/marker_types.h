// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_MARKER_TYPES_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_MARKER_TYPES_H_

#include <array>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace trading_charts {

// Independent marker transport, version 1. Units are points/dp; atlas metrics
// include two units of transparent padding on every side of each glyph.
enum class MarkerField : std::uint8_t {
  kTimestamp,
  kBelow,
  kFontSize,
  kBorderWidth,
  kPaddingHorizontal,
  kPaddingVertical,
  kMinWidth,
  kMinHeight,
  kBorderRadius,
  kOffset,
  kAdvance,
  kLineHeight,
  kCellWidth,
  kCellHeight,
  kBackgroundR,
  kBackgroundG,
  kBackgroundB,
  kBackgroundA,
  kTextR,
  kTextG,
  kTextB,
  kTextA,
  kBorderR,
  kBorderG,
  kBorderB,
  kBorderA,
  kCount,
};
inline constexpr size_t kMarkerValueCount = 26;
static_assert(static_cast<size_t>(MarkerField::kCount) == kMarkerValueCount);
inline constexpr size_t kMarkerFloatsPerVertex = 8;
inline constexpr int kMarkerAtlasColumns = 16;
inline constexpr int kMarkerAtlasRows = 6;
inline constexpr bool kMarkerVariantsEnabled = true;
inline constexpr int kMarkerVariantCapacity = 8;
inline constexpr float kMarkerVariantCell = 24.0f;
inline constexpr size_t kMarkerVariantFloatsPerVertex = 4;

struct Marker {
  std::string id;
  std::string text;
  std::array<double, kMarkerValueCount> values{};
  int variant_id = -1;
  std::shared_ptr<const std::string> descriptor;
  double Get(MarkerField field) const {
    return values[static_cast<size_t>(field)];
  }
  void Set(MarkerField field, double value) {
    values[static_cast<size_t>(field)] = value;
  }
  bool operator==(const Marker& other) const {
    return id == other.id && text == other.text && values == other.values &&
           variant_id == other.variant_id &&
           (descriptor == other.descriptor ||
            (descriptor && other.descriptor &&
             *descriptor == *other.descriptor));
  }
};
bool IsValidMarker(const Marker& marker);

// Stable order is part of placement semantics, independent of the time index.
class MarkerStore {
 public:
  struct Entry {
    Marker marker;
    uint64_t order = 0;
  };
  using TimeKey = std::pair<double, uint64_t>;
  using TimeIndex = std::map<TimeKey, std::string>;
  bool Set(const std::vector<Marker>& markers, bool replace,
           const std::function<void()>& before_change = {});
  bool Contains(const std::string& id) const { return entries_.count(id) != 0; }
  bool Remove(const std::string& id);
  bool Clear();
  const TimeIndex& Times() const { return times_; }
  const Marker& At(const std::string& id) const {
    return entries_.at(id).marker;
  }
  size_t Size() const { return entries_.size(); }

 private:
  std::unordered_map<std::string, Entry> entries_;
  TimeIndex times_;
  uint64_t next_order_ = 0;
};

struct MarkerDrawBatch {
  float font_size = 0.0f;
  size_t first_vertex = 0;
  size_t vertex_count = 0;
};
struct MarkerSnapshot {
  struct HitRegion {
    std::array<std::array<float, 2>, 52> contour;
    std::array<float, 4> clip;  // left, top, right, bottom
    std::shared_ptr<const std::string> descriptor;
  };
  // x, y, u, v, r, g, b, a. UVs refer to a 16x6 atlas, cell 95 is white.
  std::vector<float> vertices;
  std::vector<MarkerDrawBatch> batches;
  // x, y, u, v. UVs refer to one row of kMarkerVariantCapacity cells.
  std::vector<float> variant_vertices;
  size_t visible_count = 0;
  std::vector<HitRegion> hit_regions;
};

std::string HitTestMarker(const MarkerSnapshot& snapshot, float x, float y);

}  // namespace trading_charts
#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_MARKER_TYPES_H_
