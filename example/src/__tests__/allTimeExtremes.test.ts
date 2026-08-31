import { describe, expect, it, jest } from '@jest/globals';
import { type OhlcCandle } from 'react-native-trading-charts';

import {
  ALL_TIME_HIGH_PRICE_LINE_ID,
  ALL_TIME_LOW_PRICE_LINE_ID,
  calculateAllTimeExtremes,
  extendAllTimeExtremes,
  removeAllTimePriceLines,
  syncAllTimePriceLines,
} from '../allTimeExtremes';

const firstCandle: OhlcCandle = {
  timestamp: 1_000,
  open: 10,
  high: 12,
  low: 9,
  close: 11,
};
const secondCandle: OhlcCandle = {
  timestamp: 2_000,
  open: 11,
  high: 15,
  low: 8,
  close: 14,
};

function priceLineApi() {
  return {
    setPriceLine: jest.fn(),
    removePriceLine: jest.fn(),
  };
}

describe('all-time extremes', () => {
  it('calculates and extends candle high and low values', () => {
    expect(calculateAllTimeExtremes([])).toBeNull();
    expect(calculateAllTimeExtremes([firstCandle, secondCandle])).toEqual({
      high: 15,
      low: 8,
    });

    const current = { high: 12, low: 9 };
    expect(extendAllTimeExtremes(current, [secondCandle])).toEqual({
      high: 15,
      low: 8,
    });
    expect(extendAllTimeExtremes(current, [firstCandle])).toBe(current);
  });

  it('sets themed ATH and ATL lines without touching other price lines', () => {
    const charts = priceLineApi();

    syncAllTimePriceLines(
      charts,
      'chart',
      true,
      { high: 15, low: 8 },
      { high: '#00FF00', low: '#FF0000' }
    );

    expect(charts.setPriceLine).toHaveBeenNthCalledWith(1, 'chart', {
      id: ALL_TIME_HIGH_PRICE_LINE_ID,
      price: 15,
      label: 'ATH',
      color: '#00FF00',
    });
    expect(charts.setPriceLine).toHaveBeenNthCalledWith(2, 'chart', {
      id: ALL_TIME_LOW_PRICE_LINE_ID,
      price: 8,
      label: 'ATL',
      color: '#FF0000',
    });

    syncAllTimePriceLines(
      charts,
      'chart',
      true,
      { high: 15, low: 8 },
      { high: '#008800', low: '#880000' }
    );
    expect(charts.setPriceLine).toHaveBeenNthCalledWith(3, 'chart', {
      id: ALL_TIME_HIGH_PRICE_LINE_ID,
      price: 15,
      label: 'ATH',
      color: '#008800',
    });
    expect(charts.setPriceLine).toHaveBeenNthCalledWith(4, 'chart', {
      id: ALL_TIME_LOW_PRICE_LINE_ID,
      price: 8,
      label: 'ATL',
      color: '#880000',
    });
    expect(charts.removePriceLine).not.toHaveBeenCalled();
  });

  it('removes only ATH and ATL when hidden, empty or cleaned up', () => {
    const charts = priceLineApi();

    syncAllTimePriceLines(
      charts,
      'chart',
      false,
      { high: 15, low: 8 },
      { high: '#00FF00', low: '#FF0000' }
    );
    syncAllTimePriceLines(charts, 'chart', true, null, {
      high: '#00FF00',
      low: '#FF0000',
    });
    removeAllTimePriceLines(charts, 'chart');

    expect(charts.removePriceLine).toHaveBeenCalledTimes(6);
    expect(charts.removePriceLine.mock.calls).toEqual([
      ['chart', ALL_TIME_HIGH_PRICE_LINE_ID],
      ['chart', ALL_TIME_LOW_PRICE_LINE_ID],
      ['chart', ALL_TIME_HIGH_PRICE_LINE_ID],
      ['chart', ALL_TIME_LOW_PRICE_LINE_ID],
      ['chart', ALL_TIME_HIGH_PRICE_LINE_ID],
      ['chart', ALL_TIME_LOW_PRICE_LINE_ID],
    ]);
    expect(charts.removePriceLine).not.toHaveBeenCalledWith(
      'chart',
      'axis-press'
    );
  });
});
