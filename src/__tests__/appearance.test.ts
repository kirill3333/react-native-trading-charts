import { describe, expect, it } from '@jest/globals';
import { resolveChartConfig } from '../config';
import { jsonRoundTrip } from '../__fixtures__/jsonRoundTrip';

function parseGeneratedJson<T>(value: string): T {
  // SAFETY: callers pass JSON emitted by this library and declare only the
  // fields whose serialization contract the test immediately verifies.
  return JSON.parse(value) as T;
}

describe('chart appearance and formatters', () => {
  it('resolves price and compact defaults', () => {
    const price = resolveChartConfig({ chartId: 'price' });
    expect(price.resolution).toEqual({ unit: 'minute', multiplier: 1 });
    expect(price.tradeAggregation).toEqual({
      bucketOrigin: { type: 'epoch' },
      outsideSession: 'ignore',
      candleTimestamp: 'bucketStart',
    });
    expect(price.defaultScale).toBe(1);
    expect(price.series).toEqual({ type: 'candlestick' });
    expect(price.appearance.bars).toEqual({
      upColor: price.appearance.candles.upColor,
      downColor: price.appearance.candles.downColor,
      lineWidth: 1,
    });
    expect(price.xAxis.spacing).toBe('time');
    expect(price.yAxis.valueFormat).toMatchObject({
      type: 'price',
      precision: 2,
      minMove: 0.01,
    });
    expect(price.yAxis.scaleMargins).toEqual({ top: 0.2, bottom: 0.1 });
    expect(price.yAxis.defaultScale).toBe(1);
    expect(price.gestures).toEqual({
      pan: true,
      zoom: true,
      yAxisScale: true,
    });
    expect(price.currentPrice.pinToEdge).toBe(true);
    expect(price.priceExtremes.visible).toBe(true);
    expect(price.crosshair).toEqual({
      enabled: true,
      showTooltip: true,
      showTooltipHeader: true,
      tooltipBackgroundOpacity: 1,
      lineStyle: 'solid',
      tooltipFields: [
        'open',
        'close',
        'high',
        'low',
        'amplitude',
        'changePercent',
        'change',
        'volume',
      ],
      tooltipLabels: {
        open: 'Open',
        close: 'Close',
        high: 'High',
        low: 'Low',
        amplitude: 'Amplitude',
        changePercent: 'Change %',
        change: 'Change',
        volume: 'Volume',
      },
    });

    expect(
      resolveChartConfig({
        chartId: 'unpinned-price',
        currentPrice: { pinToEdge: false },
      }).currentPrice
    ).toEqual({ visible: true, showLabel: true, pinToEdge: false });

    expect(
      resolveChartConfig({
        chartId: 'hidden-price-extremes',
        priceExtremes: { visible: false },
      }).priceExtremes
    ).toEqual({ visible: false });

    const compact = resolveChartConfig({
      chartId: 'cap',
      yAxis: { valueFormat: { type: 'compact', currencySymbol: '$' } },
    });
    expect(compact.yAxis.valueFormat).toMatchObject({
      type: 'compact',
      precision: 2,
      minMove: 0.01,
      currencySymbol: '$',
    });
    const significant = resolveChartConfig({
      chartId: 'micro-price',
      yAxis: {
        valueFormat: {
          type: 'significant',
          significantDigits: 3,
          minMove: 0.00000001,
        },
      },
    });
    expect(significant.yAxis.valueFormat).toMatchObject({
      type: 'significant',
      significantDigits: 3,
      minMove: 0.00000001,
      useGrouping: true,
    });
    expect(significant.formatters.price.yAxis).toEqual(
      significant.yAxis.valueFormat
    );
    expect(significant.formatters.price.currentPrice).toMatchObject({
      type: 'significant',
      significantDigits: 3,
    });
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-fixed-resolution',
        resolution: { unit: 'fixed', durationMs: 1.5 },
      })
    ).toThrow('resolution.durationMs must be a positive safe integer');
    expect(
      resolveChartConfig({
        chartId: 'fixed-resolution',
        resolution: { unit: 'fixed', durationMs: 250 },
      }).resolution
    ).toEqual({
      unit: 'fixed',
      durationMs: 250,
    });
    expect(() => resolveChartConfig({ chartId: '' })).toThrow(
      'chartId must be a non-empty string'
    );
    expect(
      resolveChartConfig({ chartId: 'logical', xAxis: { spacing: 'logical' } })
        .xAxis.spacing
    ).toBe('logical');
    // SAFETY: this negative test intentionally bypasses the spacing union to
    // verify the runtime boundary rejects unsupported input.
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-spacing',
        xAxis: { spacing: 'invalid' as 'time' },
      })
    ).toThrow('xAxis.spacing');
  });

  it('serializes price-extreme visibility into the native JSON config', () => {
    const configJson = JSON.stringify(
      resolveChartConfig({
        chartId: 'native-price-extremes',
        priceExtremes: { visible: false },
      })
    );
    const nativeConfig = parseGeneratedJson<{
      priceExtremes: { visible: boolean };
    }>(configJson);
    expect(nativeConfig.priceExtremes).toEqual({ visible: false });
  });

  it('validates compact minMove', () => {
    expect(
      resolveChartConfig({
        chartId: 'compact-step',
        yAxis: {
          valueFormat: { type: 'compact', precision: 1, minMove: 1000 },
        },
      }).yAxis.valueFormat
    ).toMatchObject({ type: 'compact', minMove: 1000 });
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-compact-step',
        yAxis: { valueFormat: { type: 'compact', minMove: 0 } },
      })
    ).toThrow('yAxis.valueFormat.minMove');
  });

  it('validates significant price formats', () => {
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-significant-digits',
        yAxis: {
          valueFormat: { type: 'significant', significantDigits: 0 },
        },
      })
    ).toThrow('yAxis.valueFormat.significantDigits');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-significant-display',
        formatters: {
          price: {
            tooltip: { type: 'significant', significantDigits: 9 },
          },
        },
      })
    ).toThrow('formatters.price.tooltip.significantDigits');
  });

  it('resolves role-specific appearance over legacy theme values', () => {
    const resolved = resolveChartConfig({
      chartId: 'appearance',
      theme: {
        backgroundColor: '#111111',
        upColor: '#00AA00',
        crosshairColor: '#777777',
      },
      crosshair: { tooltipBackgroundOpacity: 0.4 },
      appearance: {
        backgroundColor: '#FAFAFA',
        grid: { color: '#CCCCCC80', opacity: 0.5 },
        candles: { upColor: '#008800', radius: 3.5 },
        xAxis: {
          text: {
            color: '#222222',
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: 'medium',
          },
        },
        currentPrice: {
          label: {
            upBackgroundColor: '#123456',
            border: { color: '#654321', width: 2, radius: 6 },
          },
        },
        priceLines: { label: { border: { radius: 7 } } },
        crosshair: {
          priceLabel: { backgroundColor: '#ABCDEF' },
        },
        tooltip: { backgroundOpacity: 0.75 },
      },
    });

    expect(resolved.appearance).toMatchObject({
      backgroundColor: '#FAFAFA',
      grid: { color: '#CCCCCC80', opacity: 0.5 },
      candles: { upColor: '#008800', downColor: '#FF3B64', radius: 3.5 },
      xAxis: {
        text: {
          color: '#222222',
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: 'medium',
        },
      },
      currentPrice: {
        label: {
          upBackgroundColor: '#123456',
          border: { color: '#654321', width: 2, radius: 6 },
        },
      },
      priceLines: { label: { border: { radius: 7 } } },
      crosshair: { priceLabel: { backgroundColor: '#ABCDEF' } },
      tooltip: { backgroundOpacity: 0.75 },
    });
  });

  it('resolves and serializes bar series appearance with active colors', () => {
    const resolved = resolveChartConfig({
      chartId: 'bars',
      series: { type: 'bar' },
      appearance: {
        candles: { upColor: '#008800', downColor: '#880000' },
        bars: {
          upColor: '#00A88F',
          downColor: '#FF334F',
          lineWidth: 1.5,
        },
      },
    });

    expect(resolved.series).toEqual({ type: 'bar' });
    expect(resolved.appearance.bars).toEqual({
      upColor: '#00A88F',
      downColor: '#FF334F',
      lineWidth: 1.5,
    });
    expect(resolved.appearance.currentPrice).toMatchObject({
      line: { upColor: '#00A88F', downColor: '#FF334F' },
      label: {
        upBackgroundColor: '#00A88F',
        downBackgroundColor: '#FF334F',
      },
    });
    expect(resolved.appearance.tooltip).toMatchObject({
      positiveValueColor: '#00A88F',
      negativeValueColor: '#FF334F',
    });

    const serialized = jsonRoundTrip(resolved);
    expect(serialized.series).toEqual({ type: 'bar' });
    expect(serialized.appearance.bars.lineWidth).toBe(1.5);
  });

  it('resolves hollow candlesticks with the candle palette', () => {
    const resolved = resolveChartConfig({
      chartId: 'hollow',
      series: { type: 'hollowCandlestick' },
      appearance: {
        candles: { upColor: '#00A88F', downColor: '#FF334F' },
        bars: {
          upColor: '#123456',
          downColor: '#654321',
          lineWidth: 2,
        },
      },
    });

    expect(resolved.series).toEqual({ type: 'hollowCandlestick' });
    expect(resolved.appearance.candles).toEqual({
      upColor: '#00A88F',
      downColor: '#FF334F',
      radius: 0,
    });
    expect(resolved.appearance.currentPrice).toMatchObject({
      line: { upColor: '#00A88F', downColor: '#FF334F' },
      label: {
        upBackgroundColor: '#00A88F',
        downBackgroundColor: '#FF334F',
      },
    });
    expect(resolved.appearance.tooltip).toMatchObject({
      positiveValueColor: '#00A88F',
      negativeValueColor: '#FF334F',
    });

    const serialized = jsonRoundTrip(resolved);
    expect(serialized.series).toEqual({ type: 'hollowCandlestick' });
  });

  it('resolves the pulse for the active main series', () => {
    const props = {
      chartId: 'pulse',
      series: { type: 'line' as const },
      appearance: { line: { pulseDot: { enabled: true } } },
    };
    for (const upColor of ['#AA2244', '#2299FF']) {
      expect(
        resolveChartConfig({ ...props, theme: { upColor } }).appearance.pulseDot
      ).toEqual({
        enabled: true,
        color: upColor,
        frequency: 1 / 1.2,
        radius: 4,
        haloRadius: 14,
      });
    }
    const withColor = (color: string) =>
      resolveChartConfig({
        ...props,
        appearance: { line: { pulseDot: { enabled: true, color } } },
      });
    expect(withColor('#CA174A80').appearance.pulseDot.color).toBe('#CA174A80');
    expect(() => withColor('invalid')).toThrow(
      'appearance.line.pulseDot.color'
    );
    for (const type of [
      'area',
      'baseline',
      'candlestick',
      'bar',
      'hollowCandlestick',
    ] as const) {
      expect(
        resolveChartConfig({ ...props, series: { type } }).appearance.pulseDot
          .enabled
      ).toBe(false);
    }
  });

  it('accepts fractional pulse frequencies and radii and validates each option', () => {
    const resolvePulse = (
      frequency: number,
      radius?: number,
      haloRadius?: number
    ) =>
      resolveChartConfig({
        chartId: 'pulse',
        series: { type: 'line' },
        appearance: {
          line: { pulseDot: { enabled: true, frequency, radius, haloRadius } },
        },
      }).appearance.pulseDot;

    expect(resolvePulse(2.5, 6.5)).toMatchObject({
      frequency: 2.5,
      radius: 6.5,
      haloRadius: 14,
    });
    expect(resolvePulse(1, undefined, 18.5)).toMatchObject({
      radius: 4,
      haloRadius: 18.5,
    });
    for (const invalid of [0, -1, NaN, Infinity]) {
      expect(() => resolvePulse(invalid, 14)).toThrow(
        'appearance.line.pulseDot.frequency'
      );
      expect(() => resolvePulse(1, invalid)).toThrow(
        'appearance.line.pulseDot.radius'
      );
      expect(() => resolvePulse(1, 4, invalid)).toThrow(
        'appearance.line.pulseDot.haloRadius'
      );
    }
  });

  it.each(['area', 'baseline'] as const)(
    'resolves %s pulse options and outline colors',
    (type) => {
      const style = {
        color: '#114488',
        topLineColor: '#11AA66',
        bottomLineColor: '#DD3344',
      };
      const resolve = (pulseDot?: {
        enabled: boolean;
        color?: string;
        frequency?: number;
        radius?: number;
        haloRadius?: number;
      }) =>
        resolveChartConfig({
          chartId: 'pulse',
          series: { type },
          appearance: { [type]: { ...style, pulseDot } },
        }).appearance.pulseDot;
      expect(resolve().enabled).toBe(false);
      const inherited = resolve({ enabled: true });
      expect(inherited.color).toBe(
        type === 'baseline' ? style.topLineColor : style.color
      );
      if (type === 'baseline')
        expect(inherited.belowBaseColor).toBe(style.bottomLineColor);
      const options = {
        enabled: true,
        color: '#AABBCC80',
        frequency: 2,
        radius: 6,
        haloRadius: 18,
      };
      const overridden = resolve(options);
      expect(overridden).toMatchObject(options);
      if (type === 'baseline')
        expect(overridden.belowBaseColor).toBe(options.color);
      expect(() => resolve({ enabled: true, color: 'invalid' })).toThrow(
        `appearance.${type}.pulseDot.color`
      );
    }
  );

  it('resolves a gradient line and its source semantics', () => {
    const resolved = resolveChartConfig({
      chartId: 'line',
      series: { type: 'line', source: 'low', gapThresholdMs: 90_000 },
      appearance: {
        line: {
          width: 2.5,
          color: '#2E90F5',
          gradient: { topColor: '#C51BFF', bottomColor: '#2E90F5' },
        },
      },
    });

    expect(resolved.series).toEqual({
      type: 'line',
      source: 'low',
      gapThresholdMs: 90_000,
    });
    expect(resolved.appearance.line).toEqual({
      width: 2.5,
      color: '#2E90F5',
      style: 'solid',
      rounded: true,
      gradient: { topColor: '#C51BFF', bottomColor: '#2E90F5' },
    });
    expect(resolved.appearance.currentPrice).toMatchObject({
      line: { upColor: '#2E90F5', downColor: '#2E90F5' },
      label: {
        upBackgroundColor: '#2E90F5',
        downBackgroundColor: '#2E90F5',
      },
    });
    expect(resolved.appearance.tooltip).toMatchObject({
      positiveValueColor: '#2E90F5',
      negativeValueColor: '#2E90F5',
    });
  });

  it('resolves area defaults, fill colors and line-like semantics', () => {
    const defaults = resolveChartConfig({
      chartId: 'area-defaults',
      series: { type: 'area' },
      theme: { upColor: '#2E90F5' },
    });
    expect(defaults.series).toEqual({ type: 'area', source: 'close' });
    expect(defaults.appearance.area).toEqual({
      width: 1.5,
      color: '#2E90F5',
      style: 'solid',
      rounded: true,
      fill: { topColor: '#2E90F540', bottomColor: '#2E90F500' },
    });

    const custom = resolveChartConfig({
      chartId: 'area-custom',
      series: { type: 'area', source: 'high', gapThresholdMs: 90_000 },
      appearance: {
        area: {
          width: 2.5,
          color: '#3366FF',
          gradient: { topColor: '#66AAFF', bottomColor: '#2244AA' },
          fill: { topColor: '#3366FF80', bottomColor: '#11224400' },
        },
      },
    });
    expect(custom.series).toEqual({
      type: 'area',
      source: 'high',
      gapThresholdMs: 90_000,
    });
    expect(custom.appearance.area).toEqual({
      width: 2.5,
      color: '#3366FF',
      style: 'solid',
      rounded: true,
      gradient: { topColor: '#66AAFF', bottomColor: '#2244AA' },
      fill: { topColor: '#3366FF80', bottomColor: '#11224400' },
    });
    expect(custom.appearance.currentPrice).toMatchObject({
      line: { upColor: '#3366FF', downColor: '#3366FF' },
      label: {
        upBackgroundColor: '#3366FF',
        downBackgroundColor: '#3366FF',
      },
    });
  });

  it('resolves main line and area rounding independently', () => {
    const defaults = resolveChartConfig({ chartId: 'rounded-defaults' });
    expect(defaults.appearance.line.rounded).toBe(true);
    expect(defaults.appearance.area.rounded).toBe(true);
    for (const rounded of [true, false]) {
      const resolved = jsonRoundTrip(
        resolveChartConfig({
          chartId: 'rounded',
          appearance: { line: { rounded }, area: { rounded: !rounded } },
        })
      );
      expect(resolved.appearance.line.rounded).toBe(rounded);
      expect(resolved.appearance.area.rounded).toBe(!rounded);
    }
  });

  it('resolves independent native date and price formatters', () => {
    const resolved = resolveChartConfig({
      chartId: 'formatters',
      yAxis: {
        valueFormat: {
          type: 'price',
          precision: 4,
          minMove: 0.0001,
          currencySymbol: '$',
        },
      },
      formatters: {
        date: {
          xAxis: {
            seconds: 'HH:mm:ss.SSS',
            day: 'dd/MM',
            timeZone: 'Europe/London',
          },
          crosshairTimeBadge: { pattern: 'HH:mm:ss', locale: 'ru-RU' },
          tooltipHeader: { pattern: 'dd MMM yyyy' },
        },
        price: {
          currentPrice: { type: 'price', precision: 2, currencySymbol: '£' },
          crosshairPrice: { type: 'compact', precision: 1 },
          tooltip: { type: 'price', precision: 6, useGrouping: false },
        },
      },
    });

    expect(resolved.formatters.date.xAxis).toMatchObject({
      seconds: 'HH:mm:ss.SSS',
      time: 'HH:mm',
      day: 'dd/MM',
      timeZone: 'Europe/London',
    });
    expect(resolved.formatters.date.crosshairTimeBadge).toEqual({
      pattern: 'HH:mm:ss',
      locale: 'ru-RU',
      timeZone: 'Europe/London',
    });
    expect(resolved.formatters.price.currentPrice).toMatchObject({
      type: 'price',
      precision: 2,
      currencySymbol: '£',
    });
    expect(resolved.formatters.price.crosshairPrice).toMatchObject({
      type: 'compact',
      precision: 1,
    });
    expect(resolved.formatters.price.tooltip.useGrouping).toBe(false);
    expect(resolved.formatters.price.priceExtremes).toMatchObject({
      type: 'price',
      precision: 4,
      currencySymbol: '$',
    });
  });

  it('validates appearance and formatter values before native serialization', () => {
    // SAFETY: this negative test intentionally bypasses the series-type union
    // so runtime validation receives an unsupported discriminator.
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-series',
        series: { type: 'mountain' as never },
      })
    ).toThrow('series.type');
    // SAFETY: this negative test intentionally bypasses the source union so
    // runtime validation receives an unsupported OHLC source.
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-line-source',
        series: { type: 'line', source: 'median' as never },
      })
    ).toThrow('series.source');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-line-gap',
        series: { type: 'line', gapThresholdMs: 0 },
      })
    ).toThrow('series.gapThresholdMs');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-line-width',
        appearance: { line: { width: 0 } },
      })
    ).toThrow('appearance.line.width');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-area-fill',
        appearance: { area: { fill: { topColor: 'blue' } } },
      })
    ).toThrow('appearance.area.fill.topColor');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-bar-width',
        appearance: { bars: { lineWidth: 0 } },
      })
    ).toThrow('appearance.bars.lineWidth');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-candle-radius',
        appearance: { candles: { radius: -1 } },
      })
    ).toThrow('appearance.candles.radius');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-price-line-radius',
        appearance: { priceLines: { label: { border: { radius: -1 } } } },
      })
    ).toThrow('appearance.priceLines.label.border.radius');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-color',
        appearance: { backgroundColor: 'red' },
      })
    ).toThrow('appearance.backgroundColor');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-opacity',
        appearance: { grid: { opacity: 2 } },
      })
    ).toThrow('appearance.grid.opacity');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-font',
        appearance: { yAxis: { text: { fontSize: 0 } } },
      })
    ).toThrow('appearance.yAxis.text.fontSize');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-border',
        appearance: {
          crosshair: { timeLabel: { border: { width: -1 } } },
        },
      })
    ).toThrow('appearance.crosshair.timeLabel.border.width');
    expect(() =>
      resolveChartConfig({
        chartId: 'bad-pattern',
        formatters: {
          date: { tooltipHeader: { pattern: '   ' } },
        },
      })
    ).toThrow('formatters.date.tooltipHeader.pattern');
  });
});
