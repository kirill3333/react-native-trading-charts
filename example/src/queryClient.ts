import { addEventListener as addNetInfoEventListener } from '@react-native-community/netinfo';
import {
  focusManager,
  onlineManager,
  QueryClient,
} from '@tanstack/react-query';
import { AppState } from 'react-native';

import { queryRetryDelay, shouldRetryQuery } from './http';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
  },
});

let lifecycleConfigured = false;

export function configureQueryLifecycle(): void {
  if (lifecycleConfigured) {
    return;
  }
  lifecycleConfigured = true;

  onlineManager.setEventListener((setOnline) =>
    addNetInfoEventListener((state) => {
      setOnline(
        state.isConnected !== false && state.isInternetReachable !== false
      );
    })
  );
  focusManager.setEventListener((setFocused) => {
    setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) =>
      setFocused(state === 'active')
    );
    return () => subscription.remove();
  });
}
