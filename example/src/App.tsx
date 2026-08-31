import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ChartSettingsProvider } from './chartSettings';
import { AppNavigation } from './navigation';
import { configureQueryLifecycle, queryClient } from './api/queryClient';
import { useAppTheme } from './themeContext';

configureQueryLifecycle();

function ThemedApp() {
  const theme = useAppTheme();
  return (
    <>
      <StatusBar
        backgroundColor={theme.colors.background}
        barStyle={theme.statusBarStyle}
      />
      <AppNavigation />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ChartSettingsProvider>
          <ThemedApp />
        </ChartSettingsProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
