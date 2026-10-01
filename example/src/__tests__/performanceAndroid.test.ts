import {
  type PerformanceSample,
  type Spec,
} from '../specs/NativeExamplePerformance';
import { expect, it, jest } from '@jest/globals';
import {
  createPerformanceClient,
  JS_THREAD_NAMES,
} from '../performance/client';
import { isPerformanceAvailable } from '../performance';

it('imports safely when the native module is unavailable', async () => {
  const { available, getThreads, subscribe } = createPerformanceClient(null);
  expect(available).toBe(false);
  expect(isPerformanceAvailable).toBe(false);
  expect(await getThreads()).toEqual([]);
  const listener = jest.fn();
  const subscription = subscribe({ chartId: 'chart' }, listener);
  subscription.remove();
  subscription.remove();
  expect(listener).not.toHaveBeenCalled();
});

it('subscribes to Android threads and forwards GL metrics with automatic acknowledgement', () => {
  let receive:
    ((sample: PerformanceSample) => void | Promise<void>) | undefined;
  const native = {
    getThreads: jest.fn<Spec['getThreads']>(),
    start: jest.fn<Spec['start']>(),
    stop: jest.fn<Spec['stop']>(),
    acknowledge: jest.fn<Spec['acknowledge']>(),
    onSample: jest.fn<Spec['onSample']>((listener) => {
      receive = listener;
      return {
        remove: () => {
          receive = undefined;
        },
      };
    }),
  };
  const listener = jest.fn();
  const subscription = createPerformanceClient(native).subscribe(
    { chartId: 'android-chart', threadNames: [JS_THREAD_NAMES.android] },
    listener
  );
  const id = native.start.mock.calls[0]![0];
  expect(native.start).toHaveBeenCalledWith(
    id,
    'android-chart',
    ['mqt_v_js'],
    true,
    1000
  );
  const sample = {
    subscriptionId: id,
    sequence: 1,
    timestamp: 10,
    intervalMs: 1000,
    chartId: 'android-chart',
    threads: [],
    missingThreadNames: [],
    metalFPS: null,
    presentedFrames: null,
    uiFPS: 60,
    glFPS: 10,
    renderedFrames: 10,
    glThread: {
      id: '42',
      name: 'GLThread 1',
      isMainThread: false,
      isJSThread: false,
      cpuPercent: 2.5,
    },
  };
  void receive?.(sample);
  expect(listener).toHaveBeenCalledWith(sample);
  expect(native.acknowledge).toHaveBeenCalledWith(id, 1);
  subscription.remove();
  expect(native.stop).toHaveBeenCalledWith(id);
  expect(receive).toBeUndefined();
});
