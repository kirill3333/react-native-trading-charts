// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <algorithm>
#include <cmath>
#include <string>
#include <unordered_set>
#include <utility>
#include <vector>

#include "cpp/marker_types.h"

namespace trading_charts {

bool IsValidMarker(const Marker& marker) {
  const bool variant = kMarkerVariantsEnabled && marker.variant_id >= 0;
  if (marker.id.empty() || marker.variant_id < -1 ||
      marker.variant_id >= kMarkerVariantCapacity) {
    return false;
  }
  if (!variant) {
    if (marker.text.empty() || marker.text.size() > 5 ||
        marker.text.find_first_not_of(' ') == std::string::npos) {
      return false;
    }
    for (char character : marker.text) {
      if (character < 32 || character > 126) {
        return false;
      }
    }
  }
  for (double value : marker.values) {
    if (!std::isfinite(value) || value < 0.0) {
      return false;
    }
  }
  const double timestamp = marker.Get(MarkerField::kTimestamp);
  if (timestamp > 9007199254740991.0 || std::floor(timestamp) != timestamp) {
    return false;
  }
  const double below = marker.Get(MarkerField::kBelow);
  if (below != 0.0 && below != 1.0) {
    return false;
  }
  for (MarkerField field :
       {MarkerField::kFontSize, MarkerField::kAdvance, MarkerField::kLineHeight,
        MarkerField::kCellWidth, MarkerField::kCellHeight}) {
    if (marker.Get(field) <= 0.0) {
      return false;
    }
  }
  for (size_t index = static_cast<size_t>(MarkerField::kBackgroundR);
       index < kMarkerValueCount; ++index) {
    if (marker.values[index] > 1.0) {
      return false;
    }
  }
  return true;
}

bool MarkerStore::Set(const std::vector<Marker>& markers, bool replace,
                      const std::function<void()>& before_change) {
  std::unordered_set<std::string> ids;
  for (const Marker& marker : markers) {
    if (!IsValidMarker(marker) || !ids.insert(marker.id).second) {
      return false;
    }
  }
  if (replace) {
    bool equal = entries_.size() == markers.size();
    uint64_t previous_order = 0;
    for (size_t index = 0; equal && index < markers.size(); ++index) {
      const auto found = entries_.find(markers[index].id);
      equal = found != entries_.end() &&
              found->second.marker == markers[index] &&
              (index == 0 || found->second.order > previous_order);
      if (equal) {
        previous_order = found->second.order;
      }
    }
    if (equal) {
      return false;
    }
    MarkerStore replacement;
    replacement.Set(markers, false);
    if (before_change) {
      before_change();
    }
    *this = std::move(replacement);
    return true;
  }
  bool changed = false;
  for (const Marker& marker : markers) {
    auto found = entries_.find(marker.id);
    if (found != entries_.end() && found->second.marker == marker) {
      continue;
    }
    if (!changed && before_change) {
      before_change();
    }
    const uint64_t order =
        found == entries_.end() ? next_order_++ : found->second.order;
    if (found != entries_.end()) {
      times_.erase({found->second.marker.Get(MarkerField::kTimestamp), order});
    }
    entries_[marker.id] = Entry{marker, order};
    times_[{marker.Get(MarkerField::kTimestamp), order}] = marker.id;
    changed = true;
  }
  return changed;
}

bool MarkerStore::Remove(const std::string& id) {
  const auto found = entries_.find(id);
  if (found == entries_.end()) {
    return false;
  }
  times_.erase(
      {found->second.marker.Get(MarkerField::kTimestamp), found->second.order});
  entries_.erase(found);
  return true;
}

bool MarkerStore::Clear() {
  if (entries_.empty()) {
    return false;
  }
  entries_.clear();
  times_.clear();
  next_order_ = 0;
  return true;
}
}  // namespace trading_charts
