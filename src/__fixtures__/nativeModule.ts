import { jest } from '@jest/globals';
import { type Spec as NativeTradingChartsSpec } from '../NativeTradingCharts';

export const createMockNativeModule = () => ({
  setMarker: jest.fn<NativeTradingChartsSpec['setMarker']>(),
  setMarkers: jest.fn<NativeTradingChartsSpec['setMarkers']>(),
  removeMarker: jest.fn<NativeTradingChartsSpec['removeMarker']>(),
  clearMarkers: jest.fn<NativeTradingChartsSpec['clearMarkers']>(),
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
} satisfies NativeTradingChartsSpec);
