import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resolveChartConfig } from '../config';
import {
  selectedCandleFromNativeEvent,
  selectedSeriesValuesFromNativeEvent,
} from '../events';
import { mockNativeModule, TradingCharts } from '../__fixtures__/tradingCharts';
import { jsonRoundTrip } from '../__fixtures__/jsonRoundTrip';

describe('chart events and selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards legend controls for a chart before mounting its view', () => {
    TradingCharts.setSeriesLegendVisible('pending-chart', 'sma', false);
    expect(mockNativeModule.setSeriesLegendVisible).toHaveBeenCalledWith(
      'pending-chart',
      'sma',
      false
    );
  });

  it('resolves and validates crosshair presentation options', () => {
    const resolved = resolveChartConfig({
      chartId: 'styled-crosshair',
      crosshair: {
        tooltipBackgroundOpacity: 0.55,
        lineStyle: 'dashed',
        showTooltipHeader: false,
        tooltipFields: ['volume', 'close', 'changePercent'],
        tooltipLabels: { open: 'Открытие', volume: 'Объём' },
      },
    });
    expect(resolved.crosshair).toMatchObject({
      tooltipBackgroundOpacity: 0.55,
      lineStyle: 'dashed',
      showTooltipHeader: false,
      tooltipFields: ['volume', 'close', 'changePercent'],
      tooltipLabels: {
        open: 'Открытие',
        close: 'Close',
        volume: 'Объём',
      },
    });
    const serialized = jsonRoundTrip(resolved);
    expect(serialized.crosshair).toMatchObject({
      tooltipBackgroundOpacity: 0.55,
      lineStyle: 'dashed',
      showTooltipHeader: false,
      tooltipFields: ['volume', 'close', 'changePercent'],
      tooltipLabels: { open: 'Открытие', volume: 'Объём' },
    });
    expect(() =>
      resolveChartConfig({
        chartId: 'negative-tooltip-opacity',
        crosshair: { tooltipBackgroundOpacity: -0.1 },
      })
    ).toThrow('crosshair.tooltipBackgroundOpacity');
    expect(() =>
      resolveChartConfig({
        chartId: 'large-tooltip-opacity',
        crosshair: { tooltipBackgroundOpacity: 1.1 },
      })
    ).toThrow('crosshair.tooltipBackgroundOpacity');
    // SAFETY: this negative test intentionally bypasses the line-style union
    // so the runtime validator receives the malformed value.
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-crosshair-line-style',
        crosshair: { lineStyle: 'dotted' as 'solid' },
      })
    ).toThrow('crosshair.lineStyle');
    expect(
      resolveChartConfig({
        chartId: 'empty-tooltip',
        crosshair: { tooltipFields: [], showTooltipHeader: false },
      }).crosshair
    ).toMatchObject({ tooltipFields: [], showTooltipHeader: false });
    // SAFETY: this negative test intentionally bypasses the tooltip-field
    // union so runtime validation can reject the unsupported field.
    expect(() =>
      resolveChartConfig({
        chartId: 'unknown-tooltip-field',
        crosshair: { tooltipFields: ['unknown' as 'open'] },
      })
    ).toThrow('crosshair.tooltipFields[0]');
    expect(() =>
      resolveChartConfig({
        chartId: 'duplicate-tooltip-field',
        crosshair: { tooltipFields: ['open', 'open'] },
      })
    ).toThrow('duplicate field');
  });

  it('maps active native events to OHLCV candles', () => {
    expect(
      selectedCandleFromNativeEvent({
        active: true,
        timestamp: 60_000,
        open: 10,
        high: 13,
        low: 9,
        close: 12,
        volume: 4,
        seriesValuesJson: '[]',
      })
    ).toEqual({
      timestamp: 60_000,
      open: 10,
      high: 13,
      low: 9,
      close: 12,
      volume: 4,
    });
  });

  it('maps inactive native events to null', () => {
    expect(
      selectedCandleFromNativeEvent({
        active: false,
        timestamp: 0,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
        seriesValuesJson: '[]',
      })
    ).toBeNull();
  });

  it('maps active native series values and clears them with the crosshair', () => {
    const active = {
      active: true,
      timestamp: 60_000,
      open: 10,
      high: 13,
      low: 9,
      close: 12,
      volume: 4,
      seriesValuesJson: JSON.stringify([
        {
          seriesId: 'rsi',
          paneId: 'rsi',
          priceScaleId: 'rsi',
          kind: 'scalar',
          seriesType: 'line',
          sourceType: 'ohlcvRsi',
          value: 54.2,
        },
      ]),
    } as const;
    expect(selectedSeriesValuesFromNativeEvent(active)).toEqual([
      {
        seriesId: 'rsi',
        paneId: 'rsi',
        priceScaleId: 'rsi',
        kind: 'scalar',
        seriesType: 'line',
        sourceType: 'ohlcvRsi',
        value: 54.2,
      },
    ]);
    expect(
      selectedSeriesValuesFromNativeEvent({
        ...active,
        active: false,
        seriesValuesJson: 'invalid but ignored',
      })
    ).toEqual([]);
  });
});
