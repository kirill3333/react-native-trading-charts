import { describe, expect, it } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SyntheticPerformanceReadout } from '../components/synthetic/SyntheticPerformanceReadout';
import { AppThemeProvider } from '../themeContext';
import { type PerformanceSample } from '../performance';

const sample: PerformanceSample = {
  subscriptionId: 'test',
  sequence: 1,
  timestamp: 1,
  intervalMs: 1000,
  chartId: 'chart',
  threads: [
    {
      id: '1',
      name: 'main',
      isMainThread: true,
      isJSThread: false,
      cpuPercent: 12.34,
    },
    {
      id: '2',
      name: 'mqt_v_js',
      isMainThread: false,
      isJSThread: true,
      cpuPercent: 5.67,
    },
  ],
  missingThreadNames: [],
  glThread: {
    id: '3',
    name: 'GLThread 1',
    isMainThread: false,
    isJSThread: false,
    cpuPercent: 2.34,
  },
  renderedFrames: 10,
  glFPS: 9.94,
  uiFPS: 59.94,
  metalFPS: null,
  presentedFrames: null,
};

describe('performance readout', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const landscape of [false, true]) {
      it(`shows Android CPU and FPS in ${mode}, landscape=${landscape}`, () => {
        let renderer: ReactTestRenderer;
        act(() => {
          renderer = create(
            <AppThemeProvider mode={mode}>
              <SyntheticPerformanceReadout
                sample={sample}
                android
                landscape={landscape}
              />
            </AppThemeProvider>
          );
        });
        const text = renderer!.root
          .findAllByType(Text)
          .map((node) => node.props.children);
        expect(text).toEqual([
          'Main CPU',
          '12.3%',
          'JS CPU',
          '5.7%',
          'GL CPU',
          '2.3%',
          'UI FPS',
          '59.9',
          'GL FPS',
          '9.9',
        ]);
        act(() => {
          renderer!.update(
            <AppThemeProvider mode={mode}>
              <SyntheticPerformanceReadout
                sample={null}
                android
                landscape={landscape}
              />
            </AppThemeProvider>
          );
        });
        expect(
          renderer!.root
            .findAllByType(Text)
            .filter((node) => node.props.children === '—')
        ).toHaveLength(5);
        act(() => renderer!.unmount());
      });
    }
  }

  it('retains the four iOS metrics', () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <AppThemeProvider mode="dark">
          <SyntheticPerformanceReadout
            sample={{ ...sample, metalFPS: 10 }}
            android={false}
            landscape={false}
          />
        </AppThemeProvider>
      );
    });
    const text = renderer!.root
      .findAllByType(Text)
      .map((node) => node.props.children);
    expect(text).toEqual([
      'Main CPU',
      '12.3%',
      'JS CPU',
      '5.7%',
      'UI FPS',
      '59.9',
      'Metal FPS',
      '10.0',
    ]);
    act(() => renderer!.unmount());
  });
});
