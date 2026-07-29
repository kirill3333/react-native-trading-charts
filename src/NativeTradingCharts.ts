import { type TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  setHistory(chartId: string, data: ReadonlyArray<number>): void;
  prependHistory(chartId: string, data: ReadonlyArray<number>): void;
  updateCandle(chartId: string, candle: ReadonlyArray<number>): void;
  updateTrade(chartId: string, trade: ReadonlyArray<number>): void;
  updateTrades(chartId: string, trades: ReadonlyArray<number>): void;
  addSeries(chartId: string, seriesJson: string): void;
  setSeriesData(
    chartId: string,
    seriesId: string,
    dataType: string,
    data: ReadonlyArray<number>
  ): void;
  prependSeriesData(
    chartId: string,
    seriesId: string,
    dataType: string,
    data: ReadonlyArray<number>
  ): void;
  updateSeriesData(
    chartId: string,
    seriesId: string,
    dataType: string,
    data: ReadonlyArray<number>
  ): void;
  removeSeries(chartId: string, seriesId: string): void;
  setPaneHeight(chartId: string, paneId: string, heightWeight: number): void;
  getCandles(chartId: string): Promise<ReadonlyArray<number>>;
  zoom(chartId: string, scale: number): void;
  fitContent(chartId: string): void;
  clear(chartId: string): void;
}

let module: Spec | null = null;

function getModule(): Spec {
  if (module == null) {
    module = TurboModuleRegistry.getEnforcing<Spec>('TradingCharts');
  }
  return module;
}

// Resolve the TurboModule lazily: getEnforcing throws synchronously when the
// native module is missing (web, SSR, unit tests), and a module-level call
// would crash the import of the whole package before any fallback can run.
export default new Proxy({} as Spec, {
  get(_target, property: keyof Spec) {
    return getModule()[property];
  },
});
