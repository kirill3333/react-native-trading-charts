// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#include <iostream>

#include "cpp/tests/chart_engine_test_suites.h"

int main() noexcept {
  try {
    trading_charts::test::RunDataTests();
    trading_charts::test::RunEventsTests();
    trading_charts::test::RunPanesTests();
    trading_charts::test::RunGeometryTests();
    trading_charts::test::RunOscillatorsTests();
    trading_charts::test::RunIndicatorsTests();
    std::cout << "ChartEngineTests passed\n";
    return 0;
  } catch (...) {
    std::cerr << "ChartEngineTests terminated with an exception\n";
    return 1;
  }
}
