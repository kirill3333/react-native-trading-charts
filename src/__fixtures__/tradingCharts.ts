import { jest } from '@jest/globals';
import { createTradingCharts } from '../TradingCharts';
import { type Spec as NativeTradingChartsSpec } from '../NativeTradingCharts';
import { createTradeBatcherWithNativeModule } from '../tradeBatcher';

export const mockNativeModule = {
  setHistory: jest.fn<NativeTradingChartsSpec['setHistory']>(),
  prependHistory: jest.fn<NativeTradingChartsSpec['prependHistory']>(),
  updateCandle: jest.fn<NativeTradingChartsSpec['updateCandle']>(),
  updateTrade: jest.fn<NativeTradingChartsSpec['updateTrade']>(),
  updateTrades: jest.fn<NativeTradingChartsSpec['updateTrades']>(),
  addSeries: jest.fn<NativeTradingChartsSpec['addSeries']>(),
  setSeriesData: jest.fn<NativeTradingChartsSpec['setSeriesData']>(),
  prependSeriesData: jest.fn<NativeTradingChartsSpec['prependSeriesData']>(),
  updateSeriesData: jest.fn<NativeTradingChartsSpec['updateSeriesData']>(),
  removeSeries: jest.fn<NativeTradingChartsSpec['removeSeries']>(),
  setSeriesLegendVisible:
    jest.fn<NativeTradingChartsSpec['setSeriesLegendVisible']>(),
  setPaneHeight: jest.fn<NativeTradingChartsSpec['setPaneHeight']>(),
  setPriceLine: jest.fn<NativeTradingChartsSpec['setPriceLine']>(),
  removePriceLine: jest.fn<NativeTradingChartsSpec['removePriceLine']>(),
  clearPriceLines: jest.fn<NativeTradingChartsSpec['clearPriceLines']>(),
  getPriceLines: jest.fn<NativeTradingChartsSpec['getPriceLines']>(),
  getCandles: jest.fn<NativeTradingChartsSpec['getCandles']>(),
  zoom: jest.fn<NativeTradingChartsSpec['zoom']>(),
  scrollToRealTime: jest.fn<NativeTradingChartsSpec['scrollToRealTime']>(),
  fitContent: jest.fn<NativeTradingChartsSpec['fitContent']>(),
  clear: jest.fn<NativeTradingChartsSpec['clear']>(),
} satisfies NativeTradingChartsSpec;

export const TradingCharts = createTradingCharts(mockNativeModule);

export const createTradeBatcher = (
  chartId: string,
  options?: Parameters<typeof createTradeBatcherWithNativeModule>[2]
) => createTradeBatcherWithNativeModule(mockNativeModule, chartId, options);
