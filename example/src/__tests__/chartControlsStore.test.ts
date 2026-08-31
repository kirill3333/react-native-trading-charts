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

    expect(useChartControlsStore.getState()).toMatchObject({
      showMacd: true,
      showRsi: false,
      showVolume: false,
    });
  });

  it('enables height toggling only after the chart is measured', () => {
    useChartControlsStore.getState().toggleChartHeight();
    expect(useChartControlsStore.getState().isChartHalfHeight).toBe(false);

    useChartControlsStore.getState().setFullChartHeight(400);
    useChartControlsStore.getState().toggleChartHeight();

    expect(useChartControlsStore.getState()).toMatchObject({
      fullChartHeight: 400,
      isChartHalfHeight: true,
    });
  });

  it('resets controls when another chart becomes active', () => {
    const controls = useChartControlsStore.getState();
    controls.toggleMacd();
    controls.setFullChartHeight(400);
    controls.toggleChartHeight();

    controls.activateChart('chart-b');

    expect(useChartControlsStore.getState()).toMatchObject({
      activeChartId: 'chart-b',
      showMacd: false,
      showRsi: true,
      showVolume: true,
      isChartHalfHeight: false,
      fullChartHeight: null,
    });
  });
});
