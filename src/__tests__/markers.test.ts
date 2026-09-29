import { describe, expect, it } from '@jest/globals';
import {
  resolveMarker,
  resolveMarkers,
  type ChartMarker,
  type MarkerJsonValue,
  type MarkerMetadata,
} from '../markers';
import { markerPressFromNativeEvent } from '../events';
import { MarkerVariant } from '../MarkerVariant';
import { createTradingCharts } from '../TradingCharts';
import { createMockNativeModule } from '../__fixtures__/nativeModule';

const marker: ChartMarker = {
  id: 'entry',
  timestamp: 60_000,
  text: 'DB',
  position: 'above',
  backgroundColor: '#40B783',
};

describe('MarkerVariant', () => {
  it('marks an absolute non-collapsable native view with its variant name', () => {
    expect(MarkerVariant({ name: 'buy', children: 'B' })).toMatchObject({
      props: {
        nativeID: 'marker-variant:buy',
        collapsable: false,
        style: [undefined, { position: 'absolute' }],
        children: 'B',
      },
    });
  });

  it('applies view styles without allowing chart-layout participation', () => {
    expect(
      MarkerVariant({
        name: 'buy',
        children: 'B',
        style: { backgroundColor: '#40B783', height: 24, width: 24 },
      })
    ).toMatchObject({
      props: {
        style: [
          { backgroundColor: '#40B783', height: 24, width: 24 },
          { position: 'absolute' },
        ],
      },
    });
  });

  it.each(['', '   '])('rejects invalid name %j', (name) => {
    expect(() => MarkerVariant({ name, children: null })).toThrow('non-empty');
  });
});

describe('markers', () => {
  it('resolves complete immutable defaults', () => {
    expect(resolveMarker(marker)).toEqual({
      ...marker,
      variant: '',
      textColor: '#FFFFFF',
      borderColor: '#40B783',
      borderWidth: 0,
      borderRadius: 6,
      fontSize: 14,
      paddingHorizontal: 6,
      paddingVertical: 4,
      minWidth: 24,
      minHeight: 24,
      offset: 6,
    });
    expect(marker.fontSize).toBeUndefined();
    expect(
      resolveMarker({ ...marker, text: 'ABCDE', borderWidth: 2, minWidth: 40 })
        .minWidth
    ).toBe(40);
  });
  it.each(['', '      ', 'ABCDEF', 'Ж', '😀', '\n', '\u007f', 'A\tB'])(
    'rejects invalid text %j',
    (text) => {
      expect(() => resolveMarker({ ...marker, text })).toThrow();
    }
  );
  it('resolves a named variant without text and preserves marker defaults', () => {
    const resolved = resolveMarker({
      id: 'variant',
      timestamp: 60_000,
      variant: 'buy',
      position: 'below',
      backgroundColor: '#40B783',
    });
    expect(resolved).toEqual({
      id: 'variant',
      timestamp: 60_000,
      text: '',
      variant: 'buy',
      position: 'below',
      backgroundColor: '#40B783',
      textColor: '#FFFFFF',
      borderColor: '#40B783',
      borderWidth: 0,
      borderRadius: 6,
      fontSize: 14,
      paddingHorizontal: 6,
      paddingVertical: 4,
      minWidth: 24,
      minHeight: 24,
      offset: 6,
    });
  });
  it.each(['', '   '])('rejects invalid variant %j', (variant) => {
    expect(() => resolveMarker({ ...marker, variant })).toThrow(
      'marker.variant'
    );
  });
  it.each([7, 28])(
    'scales default badge dimensions with font size %i',
    (fontSize) => {
      const resolved = resolveMarker({ ...marker, fontSize });
      const scale = fontSize / 14;
      expect(resolved).toMatchObject({
        fontSize,
        paddingHorizontal: 6 * scale,
        paddingVertical: 4 * scale,
        minWidth: 24 * scale,
        minHeight: 24 * scale,
        borderRadius: 6 * scale,
        offset: 6,
      });
    }
  );
  it('keeps explicit dimensions in points when changing font size', () => {
    const dimensions = {
      paddingHorizontal: 3,
      paddingVertical: 2,
      minWidth: 10,
      minHeight: 12,
      borderRadius: 0,
      borderWidth: 1,
    };
    expect(
      resolveMarker({ ...marker, ...dimensions, fontSize: 28 })
    ).toMatchObject(dimensions);
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid timestamp %j',
    (timestamp) => {
      expect(() => resolveMarker({ ...marker, timestamp })).toThrow();
    }
  );
  it('validates colors and dimensions without accepting coercion', () => {
    for (const patch of [
      { fontSize: 0 },
      { offset: -1 },
      { borderRadius: Infinity },
      { backgroundColor: 'red' },
      { textColor: '#fff' },
      { id: ' ' },
    ]) {
      expect(() => resolveMarker({ ...marker, ...patch })).toThrow();
    }
    expect(
      resolveMarker({ ...marker, backgroundColor: '#12345678' }).backgroundColor
    ).toBe('#12345678');
    expect(() => resolveMarkers([marker, marker])).toThrow('unique');
    expect(resolveMarkers([])).toEqual([]);
  });
  it('clones metadata and serializes object keys in stable order', () => {
    const metadata = { orderId: '123', nested: { values: [1, true, null] } };
    const resolved = resolveMarker({ ...marker, metadata });
    metadata.nested.values[0] = 2;
    expect(resolved.metadata).toEqual({
      orderId: '123',
      nested: { values: [1, true, null] },
    });
    expect(JSON.stringify(resolved)).toBe(
      JSON.stringify(
        resolveMarker({
          ...marker,
          metadata: { nested: { values: [1, true, null] }, orderId: '123' },
        })
      )
    );
    expect(resolveMarker(marker).metadata).toBeUndefined();
  });

  it('rejects unsupported metadata before sending a replacement', () => {
    const methods = createMockNativeModule();
    const charts = createTradingCharts(methods);
    for (const value of [
      NaN,
      Infinity,
      undefined,
      () => {},
      BigInt(1),
      new Date(),
    ]) {
      const metadata: MarkerMetadata = {};
      Object.defineProperty(metadata, 'bad', { value, enumerable: true });
      expect(() =>
        charts.setMarkers('chart', [marker, { ...marker, id: 'bad', metadata }])
      ).toThrow();
    }
    const cyclic: { [key: string]: MarkerJsonValue } = {};
    cyclic.self = cyclic;
    expect(() => resolveMarker({ ...marker, metadata: cyclic })).toThrow(
      'cycles'
    );
    expect(() =>
      resolveMarker({ ...marker, metadata: { [Symbol('bad')]: 1 } })
    ).toThrow();
    expect(methods.setMarkers).not.toHaveBeenCalled();
  });

  it('returns the displayed metadata and drops events for a previous chart', () => {
    const saved = resolveMarker({ ...marker, metadata: { version: 1 } });
    const event = {
      chartId: 'chart',
      x: 12,
      y: 34,
      markerJson: JSON.stringify(saved),
    };
    expect(markerPressFromNativeEvent(event, 'new-chart')).toBeNull();
    expect(markerPressFromNativeEvent(event, 'chart')).toEqual({
      marker: saved,
      x: 12,
      y: 34,
    });
  });

  it('validates a whole replacement before crossing the bridge', () => {
    const methods = createMockNativeModule();
    const charts = createTradingCharts(methods);
    charts.setMarker('chart', marker);
    expect(methods.setMarker).toHaveBeenCalledWith(
      'chart',
      JSON.stringify(resolveMarker(marker))
    );
    charts.setMarkers('chart', []);
    expect(methods.setMarkers).toHaveBeenCalledWith('chart', '[]');
    methods.setMarkers.mockClear();
    expect(() =>
      charts.setMarkers('chart', [
        marker,
        { ...marker, id: 'bad', text: 'TOOLONG' },
      ])
    ).toThrow();
    expect(methods.setMarkers).not.toHaveBeenCalled();
    charts.removeMarker('chart', 'entry');
    charts.clearMarkers('chart');
    expect(methods.removeMarker).toHaveBeenCalledWith('chart', 'entry');
    expect(methods.clearMarkers).toHaveBeenCalledWith('chart');
    expect(() => charts.removeMarker('chart', '')).toThrow();
    expect(() => charts.setMarker('', marker)).toThrow();
  });
});
