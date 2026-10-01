import { useCallback, useLayoutEffect } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { type ChartResolution } from 'react-native-trading-charts';

import { SyntheticChartToolbar } from '../components/synthetic/SyntheticChartToolbar';
import { SyntheticLoadingOverlay } from '../components/synthetic/SyntheticLoadingOverlay';
import { ChartHeader } from '../components/ChartHeader';
import { ChartWorkspace } from '../components/ChartWorkspace';
import { InteractiveChart } from '../components/InteractiveChart';
import { useChartOrientation } from '../hooks/useChartOrientation';
import { useSyntheticDataFeed } from '../hooks/useSyntheticDataFeed';
import { useChartControlsStore } from '../stores/chartControlsStore';
import { useSyntheticSettingsStore } from '../stores/syntheticSettingsStore';

const RESOLUTION: ChartResolution = { unit: 'second' };
const ignoreVisibleRange = () => undefined;

export function SyntheticChartScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const chartId = `synthetic-${route.key}`;
  const { isLandscape, toggleOrientation } = useChartOrientation(navigation);
  const settings = useSyntheticSettingsStore((state) => state.settings);
  const applySettings = useSyntheticSettingsStore(
    (state) => state.applySettings
  );
  const activateChart = useChartControlsStore((state) => state.activateChart);
  const showVolume = useChartControlsStore((state) => state.showVolume);
  const showRsi = useChartControlsStore((state) => state.showRsi);
  const showMacd = useChartControlsStore((state) => state.showMacd);
  const feed = useSyntheticDataFeed(chartId, settings);
  const precision = Math.min(
    8,
    Math.max(
      2,
      2 - Math.floor(Math.log10(settings.maxPrice - settings.minPrice))
    )
  );

  useLayoutEffect(() => activateChart(chartId), [activateChart, chartId]);
  const retry = useCallback(
    () => applySettings(settings),
    [applySettings, settings]
  );

  const openSettings = useCallback(() => {
    navigation.navigate('SyntheticSettings', {
      orientation: isLandscape ? 'landscape' : 'portrait_up',
    });
  }, [isLandscape, navigation]);

  return (
    <ChartWorkspace
      isLandscape={isLandscape}
      onToggleOrientation={toggleOrientation}
      header={
        <ChartHeader
          baseAsset="Synthetic"
          venueLabel="Generated trades · 1 second candles"
          price={feed.lastPrice}
          pricePrecision={precision}
          onBack={() => navigation.goBack()}
        />
      }
      toolbar={
        <SyntheticChartToolbar
          candleCount={feed.candleCount}
          eventsPerSecond={settings.eventsPerSecond}
          error={feed.error}
          onOpenSettings={openSettings}
          onRetry={retry}
        />
      }
    >
      <InteractiveChart
        chartId={chartId}
        resolution={RESOLUTION}
        lastPrice={settings.minPrice}
        precision={precision}
        minMove={10 ** -precision}
        showVolume={showVolume}
        showRsi={showRsi}
        showMacd={showMacd}
        allTimeExtremes={feed.allTimeExtremes}
        onVisibleRangeChange={ignoreVisibleRange}
      />
      {feed.status === 'loading' && <SyntheticLoadingOverlay />}
    </ChartWorkspace>
  );
}
