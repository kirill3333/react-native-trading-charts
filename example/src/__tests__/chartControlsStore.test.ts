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

  it('resets controls when another chart becomes active', () => {
    const controls = useChartControlsStore.getState();
    controls.toggleMacd();

    controls.activateChart('chart-b');

    expect(useChartControlsStore.getState()).toMatchObject({
      activeChartId: 'chart-b',
      showMacd: false,
      showRsi: true,
      showVolume: true,
    });
  });
});
