import {
  createStaticNavigation,
  type StaticParamList,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SettingsScreen } from './components/settings/SettingsScreen';
import { ChartScreen } from './screens/ChartScreen';
import { MarketsScreen } from './screens/MarketsScreen';
import { useAppTheme } from './themeContext';

const RootStack = createNativeStackNavigator({
  initialRouteName: 'Markets',
  screenOptions: {
    animation: 'default',
    headerShown: false,
  },
  groups: {
    Main: {
      screens: {
        Markets: MarketsScreen,
        Chart: ChartScreen,
      },
    },
    Modals: {
      screenOptions: { presentation: 'modal' },
      screens: {
        ChartSettings: SettingsScreen,
      },
    },
  },
});

export type RootStackParamList = StaticParamList<typeof RootStack>;
type RootStackType = typeof RootStack;

declare module '@react-navigation/core' {
  interface RootNavigator extends RootStackType {}
}

const Navigation = createStaticNavigation(RootStack);

export function AppNavigation() {
  const theme = useAppTheme();
  return <Navigation theme={theme.navigationTheme} />;
}
