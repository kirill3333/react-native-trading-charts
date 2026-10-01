import { Platform } from 'react-native';

import NativePerformance from '../specs/NativeExamplePerformance';
import { createPerformanceClient, JS_THREAD_NAMES } from './client';

export const JS_THREAD_NAME =
  Platform.OS === 'android' ? JS_THREAD_NAMES.android : JS_THREAD_NAMES.ios;
export type {
  AppThread,
  PerformanceSample,
  PerformanceOptions,
  PerformanceSubscription,
} from './client';

export const performanceClient = createPerformanceClient(
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? (NativePerformance ?? null)
    : null
);
export const isPerformanceAvailable = performanceClient.available;
export const { getThreads, subscribe } = performanceClient;
