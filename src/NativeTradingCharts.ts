import { type TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  setHistory(chartId: string, data: ReadonlyArray<number>): void;
  prependHistory(chartId: string, data: ReadonlyArray<number>): void;
  updateCandle(chartId: string, candle: ReadonlyArray<number>): void;
  updateTrade(chartId: string, trade: ReadonlyArray<number>): void;
  updateTrades(chartId: string, trades: ReadonlyArray<number>): void;
  getCandles(chartId: string): Promise<ReadonlyArray<number>>;
  zoom(chartId: string, scale: number): void;
  fitContent(chartId: string): void;
  clear(chartId: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('TradingCharts');
