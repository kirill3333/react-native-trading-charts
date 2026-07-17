import { type TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  setHistory(chartId: string, data: ReadonlyArray<number>): void;
  updateCandle(chartId: string, candle: ReadonlyArray<number>): void;
  updateTrade(chartId: string, trade: ReadonlyArray<number>): void;
  updateTrades(chartId: string, trades: ReadonlyArray<number>): void;
  clear(chartId: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('TradingCharts');
