import { useIsFocused } from '@react-navigation/native';
import { Platform, useWindowDimensions } from 'react-native';

import { usePerformanceMetrics } from '../hooks/usePerformanceMetrics';
import { isPerformanceAvailable } from '../performance';
import { PerformanceReadout } from './PerformanceReadout';

function ActivePerformancePanel({ chartId }: { chartId: string }) {
  const sample = usePerformanceMetrics(chartId, useIsFocused());
  const { width, height } = useWindowDimensions();
  return (
    <PerformanceReadout
      sample={sample}
      android={Platform.OS === 'android'}
      landscape={width > height}
    />
  );
}

export function PerformancePanel({ chartId }: { chartId: string }) {
  return isPerformanceAvailable ? (
    <ActivePerformancePanel chartId={chartId} />
  ) : null;
}
