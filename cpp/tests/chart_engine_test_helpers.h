// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#ifndef REACT_NATIVE_TRADING_CHARTS_CPP_TESTS_CHART_ENGINE_TEST_HELPERS_H_
#define REACT_NATIVE_TRADING_CHARTS_CPP_TESTS_CHART_ENGINE_TEST_HELPERS_H_

#include <cassert>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <memory>
#include <vector>

#include "cpp/chart_engine.h"

namespace trading_charts::test {

inline constexpr double kFloatGeometryTolerance = 1e-4;

inline void ExpectNear(double actual, double expected,
                       double tolerance = 1e-9) {
  if (!(std::abs(actual - expected) < tolerance)) {
    std::cerr << "Expected " << actual << " to be within " << tolerance
              << " of " << expected << '\n';
    assert(false);
  }
}

inline void ExpectColor(const Color& actual, const Color& expected) {
  ExpectNear(actual.r, expected.r, kFloatGeometryTolerance);
  ExpectNear(actual.g, expected.g, kFloatGeometryTolerance);
  ExpectNear(actual.b, expected.b, kFloatGeometryTolerance);
  ExpectNear(actual.a, expected.a, kFloatGeometryTolerance);
}

struct RenderCheckpoint {
  uint64_t revision = 0;
  uint64_t content_revision = 0;
  std::shared_ptr<const trading_charts::RenderSnapshot> snapshot;
};

inline RenderCheckpoint CaptureRenderCheckpoint(ChartEngine& engine) {
  const auto snapshot = engine.Snapshot();
  const uint64_t revision = engine.Revision();
  assert(snapshot != nullptr);
  assert(snapshot->revision == revision);
  return {revision, snapshot->content_revision, snapshot};
}

template <typename Operation>
void ExpectContentMutation(ChartEngine& engine, Operation operation) {
  const RenderCheckpoint before = CaptureRenderCheckpoint(engine);
  operation();
  const RenderCheckpoint after = CaptureRenderCheckpoint(engine);
  assert(after.revision == before.revision + 1);
  assert(after.content_revision == before.content_revision + 1);
  assert(after.snapshot != before.snapshot);
}

template <typename Operation>
void ExpectOverlayMutation(ChartEngine& engine, Operation operation) {
  const RenderCheckpoint before = CaptureRenderCheckpoint(engine);
  operation();
  const RenderCheckpoint after = CaptureRenderCheckpoint(engine);
  assert(after.revision == before.revision + 1);
  assert(after.content_revision == before.content_revision);
  assert(after.snapshot != before.snapshot);
  assert(after.snapshot->content_vertices == before.snapshot->content_vertices);
}

template <typename Operation>
void ExpectNoRenderMutation(ChartEngine& engine, Operation operation) {
  const RenderCheckpoint before = CaptureRenderCheckpoint(engine);
  operation();
  const RenderCheckpoint after = CaptureRenderCheckpoint(engine);
  assert(after.revision == before.revision);
  assert(after.content_revision == before.content_revision);
  assert(after.snapshot == before.snapshot);
}

inline ChartConfig ExplicitResolution(trading_charts::ResolutionUnit unit,
                                      std::uint32_t multiplier = 1) {
  ChartConfig config;
  config.resolution.unit = unit;
  config.resolution.multiplier = multiplier;
  return config;
}

inline ChartConfig FixedResolution(std::int64_t duration_ms) {
  ChartConfig config =
      ExplicitResolution(trading_charts::ResolutionUnit::kFixed);
  config.resolution.fixed_duration_ms = duration_ms;
  return config;
}

inline const std::vector<float>& ContentOf(
    const trading_charts::RenderSnapshot& snapshot) {
  static const std::vector<float> k_empty;
  return snapshot.content_vertices ? *snapshot.content_vertices : k_empty;
}

}  // namespace trading_charts::test

#endif  // REACT_NATIVE_TRADING_CHARTS_CPP_TESTS_CHART_ENGINE_TEST_HELPERS_H_
