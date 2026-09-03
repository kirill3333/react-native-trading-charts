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
  setPriceLine(
    chartId: string,
    priceLineId: string,
    price: number,
    label: string,
    color: string
  ): void;
  removePriceLine(chartId: string, priceLineId: string): void;
  clearPriceLines(chartId: string): void;
  getPriceLines(chartId: string): Promise<string>;
  getCandles(chartId: string): Promise<ReadonlyArray<number>>;
  zoom(chartId: string, scale: number): void;
  scrollToRealTime(chartId: string): void;
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

// SAFETY: the proxy never reads its empty target; every property access is
// forwarded to the lazily resolved TurboModule whose contract is Spec.
export default new Proxy({} as Spec, {
  get(_target, property: keyof Spec) {
    return getModule()[property];
  },
});
