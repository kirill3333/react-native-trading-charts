import { beforeEach, describe, expect, it } from '@jest/globals';

import { useChartControlsStore } from '../stores/chartControlsStore';

beforeEach(() => {
  useChartControlsStore.getState().activateChart('chart-a');
});

describe('chart controls store', () => {
  it('toggles chart series visibility', () => {
    const controls = useChartControlsStore.getState();

    controls.toggleMacd();
    controls.toggleRsi();
    controls.toggleVolume();
    controls.togglePerformance();

    expect(useChartControlsStore.getState()).toMatchObject({
      showMacd: true,
      showRsi: false,
      showVolume: false,
      showPerformance: true,
    });
  });

  it('resets controls when another chart becomes active', () => {
    const controls = useChartControlsStore.getState();
    controls.toggleMacd();
    controls.togglePerformance();

    controls.activateChart('chart-b');

    expect(useChartControlsStore.getState()).toMatchObject({
      activeChartId: 'chart-b',
      showMacd: false,
      showRsi: true,
      showVolume: true,
      showPerformance: false,
    });
  });

  it('shows performance by default for synthetic charts and resets it for market charts', () => {
    const controls = useChartControlsStore.getState();
    controls.activateChart('synthetic', { showPerformance: true });
    expect(useChartControlsStore.getState().showPerformance).toBe(true);

    controls.togglePerformance();
    expect(useChartControlsStore.getState().showPerformance).toBe(false);
    controls.togglePerformance();

    controls.activateChart('market');
    expect(useChartControlsStore.getState().showPerformance).toBe(false);
  });
});
