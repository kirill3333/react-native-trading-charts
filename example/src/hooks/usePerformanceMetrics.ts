import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { type PerformanceClient } from '../performance/client';

import {
  JS_THREAD_NAME,
  performanceClient,
  type PerformanceSample,
} from '../performance';

export function usePerformanceMetrics(
  chartId: string,
  focused: boolean,
  client: PerformanceClient = performanceClient
) {
  const [sample, setSample] = useState<PerformanceSample | null>(null);

  useEffect(() => {
    let subscription: ReturnType<PerformanceClient['subscribe']> | undefined;
    const reconcile = (state = AppState.currentState) => {
      subscription?.remove();
      subscription = undefined;
      setSample(null);
      if (focused && state === 'active') {
        subscription = client.subscribe(
          { chartId, threadNames: [JS_THREAD_NAME], includeMainThread: true },
          setSample
        );
      }
    };
    reconcile();
    const lifecycle = AppState.addEventListener('change', reconcile);
    return () => {
      lifecycle.remove();
      subscription?.remove();
    };
  }, [chartId, focused, client]);

  return sample;
}
