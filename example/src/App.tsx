import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ChartSettingsProvider } from './chartSettings';
import { AppNavigation } from './navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar backgroundColor="#100C18" barStyle="light-content" />
      <ChartSettingsProvider>
        <AppNavigation />
      </ChartSettingsProvider>
    </SafeAreaProvider>
  );
}
