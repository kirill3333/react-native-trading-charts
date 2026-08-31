import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigation } from './navigation';
import { configureQueryLifecycle, queryClient } from './api/queryClient';
import { useChartSettingsStore } from './stores/chartSettingsStore';
import { AppThemeProvider, useAppTheme } from './themeContext';

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

function AppThemeRoot() {
  const themeMode = useChartSettingsStore(
    (state) => state.settings.themeMode
  );

  return (
    <AppThemeProvider mode={themeMode}>
      <ThemedApp />
    </AppThemeProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AppThemeRoot />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
