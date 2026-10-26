import { useLayoutEffect } from 'react';

import { useChartControlsStore } from '../stores/chartControlsStore';

export function useChartActivation(chartId: string, showPerformance = false) {
  const activateChart = useChartControlsStore((state) => state.activateChart);
  useLayoutEffect(
    () => activateChart(chartId, { showPerformance }),
    [activateChart, chartId, showPerformance]
  );
}
