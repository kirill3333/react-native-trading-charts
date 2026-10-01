import {
  type AppThread,
  type PerformanceSample,
  type Spec,
} from '../specs/NativeExamplePerformance';

export type { AppThread, PerformanceSample };
export const JS_THREAD_NAMES = {
  ios: 'com.facebook.react.runtime.JavaScript',
  android: 'mqt_v_js',
} as const;

export type PerformanceOptions = {
  chartId: string;
  threadNames?: string[];
  includeMainThread?: boolean;
  intervalMs?: number;
};

export type PerformanceSubscription = { remove(): void };

let nextSubscription = 0;
// A new prefix prevents Fast Refresh from reusing a still-active native ID.
const session = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type PerformanceClient = {
  available: boolean;
  getThreads(): Promise<AppThread[]>;
  subscribe(
    options: PerformanceOptions,
    listener: (sample: PerformanceSample) => void
  ): PerformanceSubscription;
};

export function createPerformanceClient(
  native: Spec | null
): PerformanceClient {
  function getThreads(): Promise<AppThread[]> {
    if (native == null) {
      return Promise.resolve([]);
    }
    return native.getThreads();
  }

  function subscribe(
    options: PerformanceOptions,
    listener: (sample: PerformanceSample) => void
  ): PerformanceSubscription {
    const intervalMs = options.intervalMs ?? 1000;
    const threadNames = options.threadNames ?? [];
    if (
      !options.chartId.trim() ||
      !Number.isFinite(intervalMs) ||
      intervalMs < 250 ||
      threadNames.some((name) => !name.trim())
    ) {
      throw new Error(
        'Expected a chartId, nonempty thread names and intervalMs >= 250'
      );
    }
    if (native == null) {
      return { remove() {} };
    }
    const id = `${session}-${++nextSubscription}`;
    let removed = false;
    const event = native.onSample((sample) => {
      if (removed || sample.subscriptionId !== id) return;
      try {
        listener(sample);
      } finally {
        if (!removed) native.acknowledge(id, sample.sequence);
      }
    });
    try {
      native.start(
        id,
        options.chartId,
        [...new Set(threadNames)],
        options.includeMainThread ?? true,
        intervalMs
      );
    } catch (error) {
      event.remove();
      throw error;
    }
    return {
      remove() {
        if (removed) return;
        removed = true;
        event.remove();
        native.stop(id);
      },
    };
  }

  return { available: native != null, getThreads, subscribe };
}
