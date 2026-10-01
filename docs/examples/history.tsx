import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  TradingCharts,
  TradingChartsView,
  type OhlcCandle,
  type VisibleRangeChangeEvent,
} from 'react-native-trading-charts';

type Props = {
  chartId: string;
  initialHistory: readonly OhlcCandle[];
  // Return older candles only, ordered from oldest to newest. [] means exhausted.
  loadOlder: (before: number) => Promise<readonly OhlcCandle[]>;
};

export function HistoryChart({ chartId, initialHistory, loadOlder }: Props) {
  const loading = useRef(false);
  const exhausted = useRef(false);
  const mounted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    TradingCharts.setHistory(chartId, initialHistory);
    return () => {
      mounted.current = false;
    };
  }, [chartId, initialHistory]);

  const load = useCallback(async () => {
    if (loading.current || exhausted.current) return;
    loading.current = true;
    setError(null);
    try {
      const candles = await TradingCharts.getCandles(chartId);
      const first = candles[0];
      if (!first || !mounted.current) return;
      const older = await loadOlder(first.timestamp);
      if (!mounted.current) return;
      exhausted.current = older.length === 0;
      TradingCharts.prependHistory(chartId, older);
    } catch (cause) {
      if (mounted.current) {
        setError(
          cause instanceof Error ? cause.message : 'Unable to load history'
        );
      }
    } finally {
      loading.current = false;
    }
  }, [chartId, loadOlder]);

  const onRangeChange = useCallback(
    (event: VisibleRangeChangeEvent) => {
      if (event.atStart) void load();
    },
    [load]
  );

  return (
    <View>
      <TradingChartsView
        style={{ height: 420 }}
        chartId={chartId}
        initialVisibleCount={40}
        onVisibleRangeChange={onRangeChange}
      />
      {error ? (
        <Text
          onPress={() => {
            void load();
          }}
        >
          {error} — tap to retry
        </Text>
      ) : null}
    </View>
  );
}
