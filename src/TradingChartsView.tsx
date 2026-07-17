import { View } from 'react-native';

import { resolveChartConfig } from './config';
import { type TradingChartsViewProps } from './types';

export function TradingChartsView({ style, ...props }: TradingChartsViewProps) {
  const config = resolveChartConfig(props);
  return (
    <View style={[style, { backgroundColor: config.theme.backgroundColor }]} />
  );
}

export type { TradingChartsViewProps } from './types';
