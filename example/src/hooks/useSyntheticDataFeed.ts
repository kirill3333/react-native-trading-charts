import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { TradingCharts } from 'react-native-trading-charts';

import {
  initialSyntheticSnapshot,
  SyntheticFeed,
  type SyntheticFeedApi,
} from '../synthetic/feed';
import { type SyntheticSettings } from '../synthetic/settings';

export function useSyntheticDataFeed(
  chartId: string,
  settings: SyntheticSettings,
  charts: SyntheticFeedApi = TradingCharts
) {
  const [snapshot, setSnapshot] = useState(() =>
    initialSyntheticSnapshot(settings)
  );
  const feedRef = useRef<SyntheticFeed | null>(null);

  useEffect(() => {
    setSnapshot(initialSyntheticSnapshot(settings));
    const feed = new SyntheticFeed(chartId, settings, charts, setSnapshot);
    feedRef.current = feed;
    return () => {
      feed.dispose();
      feedRef.current = null;
    };
  }, [chartId, charts, settings]);

  useEffect(() => {
    const syncActive = () =>
      feedRef.current?.setActive(AppState.currentState === 'active');
    syncActive();
    const subscription = AppState.addEventListener('change', (state) => {
      feedRef.current?.setActive(state === 'active');
    });
    return () => {
      subscription.remove();
      feedRef.current?.setActive(false);
    };
  }, [chartId, charts, settings]);

  return snapshot;
}
