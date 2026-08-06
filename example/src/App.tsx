import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ChartSettingsProvider } from './chartSettings';
import { AppNavigation } from './navigation';
import { useAppTheme } from './themeContext';

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
    <SafeAreaProvider>
      <ChartSettingsProvider>
        <ThemedApp />
      </ChartSettingsProvider>
    </SafeAreaProvider>
  );
}
