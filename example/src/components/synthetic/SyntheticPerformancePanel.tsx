import { useIsFocused } from '@react-navigation/native';
import { Platform, useWindowDimensions } from 'react-native';

import { usePerformanceMetrics } from '../../hooks/usePerformanceMetrics';
import { isPerformanceAvailable } from '../../performance';
import { SyntheticPerformanceReadout } from './SyntheticPerformanceReadout';

function PerformanceReadout({ chartId }: { chartId: string }) {
  const sample = usePerformanceMetrics(chartId, useIsFocused());
  const { width, height } = useWindowDimensions();
  return (
    <SyntheticPerformanceReadout
      sample={sample}
      android={Platform.OS === 'android'}
      landscape={width > height}
    />
  );
}

export function SyntheticPerformancePanel({ chartId }: { chartId: string }) {
  return isPerformanceAvailable ? (
    <PerformanceReadout chartId={chartId} />
  ) : null;
}
