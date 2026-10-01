import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import {
  type Spec,
  type PerformanceSample,
} from '../specs/NativeExamplePerformance';
import { createPerformanceClient } from '../performance/client';
import { JS_THREAD_NAME } from '../performance';
import { usePerformanceMetrics } from '../hooks/usePerformanceMetrics';

const listeners = new Set<
  (sample: PerformanceSample) => void | Promise<void>
>();
const native = {
  getThreads: jest.fn<Spec['getThreads']>(),
  start: jest.fn<Spec['start']>(),
  stop: jest.fn<Spec['stop']>(),
  acknowledge: jest.fn<Spec['acknowledge']>(),
  onSample: jest.fn<Spec['onSample']>(),
} satisfies Spec;
const client = createPerformanceClient(native);
const { getThreads, subscribe } = client;
const activeSubscriptions: ReturnType<typeof subscribe>[] = [];
const sampleFor = (id: string): PerformanceSample => ({
  subscriptionId: id,
  sequence: 1,
  timestamp: 10,
  intervalMs: 1000,
  chartId: 'chart',
  threads: [],
  missingThreadNames: [JS_THREAD_NAME],
  presentedFrames: null,
  metalFPS: null,
  uiFPS: null,
  glFPS: null,
  renderedFrames: null,
  glThread: null,
});

function emit(sample: PerformanceSample) {
  for (const listener of listeners) void listener(sample);
}

beforeEach(() => {
  jest.clearAllMocks();
  listeners.clear();
  native.onSample.mockImplementation((listener) => {
    listeners.add(listener);
    return {
      remove: () => {
        listeners.delete(listener);
      },
    };
  });
});
afterEach(() => {
  for (const subscription of activeSubscriptions.splice(0))
    subscription.remove();
});

describe('example performance subscriptions', () => {
  it('lists threads and uses native defaults with isolated subscriptions', async () => {
    const threads = [
      { id: '1', name: '', isMainThread: true, isJSThread: false },
    ];
    native.getThreads.mockResolvedValueOnce(threads);
    expect(await getThreads()).toEqual(threads);
    const first = jest.fn();
    const second = jest.fn();
    const subscription = subscribe(
      { chartId: 'chart', threadNames: [JS_THREAD_NAME, JS_THREAD_NAME] },
      first
    );
    activeSubscriptions.push(
      subscription,
      subscribe({ chartId: 'chart', intervalMs: 500 }, second)
    );
    const firstId = native.start.mock.calls[0]![0];
    const secondId = native.start.mock.calls[1]![0];
    expect(firstId).not.toBe(secondId);
    expect(native.start.mock.calls[0]).toEqual([
      firstId,
      'chart',
      [JS_THREAD_NAME],
      true,
      1000,
    ]);
    const sample = { ...sampleFor(firstId), uiFPS: 59.9 };
    emit(sample);
    expect(first).toHaveBeenCalledWith(sample);
    expect(second).not.toHaveBeenCalled();
    expect(native.acknowledge).toHaveBeenCalledWith(firstId, 1);
    subscription.remove();
    subscription.remove();
    expect(native.stop).toHaveBeenCalledTimes(1);
    emit(sample);
    expect(first).toHaveBeenCalledTimes(1);
    emit(sampleFor(secondId));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('acknowledges even when a listener throws', () => {
    const subscription = subscribe({ chartId: 'chart' }, () => {
      throw new Error('listener');
    });
    activeSubscriptions.push(subscription);
    const id = native.start.mock.calls[0]![0];
    expect(() => emit(sampleFor(id))).toThrow('listener');
    expect(native.acknowledge).toHaveBeenCalledWith(id, 1);
  });

  it('rejects invalid parameters before creating native work', () => {
    for (const intervalMs of [0, 249, NaN, Infinity]) {
      expect(() =>
        subscribe({ chartId: 'chart', intervalMs }, jest.fn())
      ).toThrow();
    }
    expect(() => subscribe({ chartId: ' ' }, jest.fn())).toThrow();
    expect(() =>
      subscribe({ chartId: 'chart', threadNames: [''] }, jest.fn())
    ).toThrow();
    expect(native.start).not.toHaveBeenCalled();
    expect(native.onSample).not.toHaveBeenCalled();
  });
});

describe('performance screen lifecycle', () => {
  let renderer: ReactTestRenderer | undefined;
  let notifyState: (state: AppStateStatus) => void;
  let current: PerformanceSample | null = null;
  const originalState = AppState.currentState;
  const removeLifecycle = jest.fn();

  function Harness({
    chartId = 'chart',
    focused = true,
  }: {
    chartId?: string;
    focused?: boolean;
  }) {
    current = usePerformanceMetrics(chartId, focused, client);
    return null;
  }

  beforeEach(() => {
    AppState.currentState = 'active';
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        notifyState = listener;
        return { remove: removeLifecycle };
      });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    AppState.currentState = originalState;
    jest.restoreAllMocks();
  });

  it('starts on focus, clears stale samples, pauses and resumes with fresh subscriptions', () => {
    act(() => {
      renderer = create(<Harness />);
    });
    expect(current).toBeNull();
    const firstId = native.start.mock.calls[0]![0];
    const sample = { ...sampleFor(firstId), uiFPS: 59.9 };
    act(() => emit(sample));
    expect(current).toEqual(sample);
    act(() => notifyState('background'));
    expect(native.stop).toHaveBeenCalledWith(firstId);
    expect(current).toBeNull();
    act(() => notifyState('active'));
    expect(native.start).toHaveBeenCalledTimes(2);
    expect(native.start.mock.calls[1]![0]).not.toBe(firstId);
    act(() => renderer?.update(<Harness focused={false} />));
    expect(listeners.size).toBe(0);
    act(() => notifyState('active'));
    expect(native.start).toHaveBeenCalledTimes(2);
    act(() => renderer?.update(<Harness chartId="next-chart" />));
    expect(native.start.mock.calls[2]![1]).toBe('next-chart');
    act(() => renderer?.unmount());
    renderer = undefined;
    expect(listeners.size).toBe(0);
    expect(removeLifecycle).toHaveBeenCalled();
  });

  it('does not subscribe while initially in background', () => {
    AppState.currentState = 'background';
    act(() => {
      renderer = create(<Harness />);
    });
    expect(native.start).not.toHaveBeenCalled();
    act(() => notifyState('active'));
    expect(native.start).toHaveBeenCalledTimes(1);
  });
});
