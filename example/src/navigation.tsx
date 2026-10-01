import {
  createStaticNavigation,
  type StaticParamList,
  type ParamListBase,
  type RouteProp,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';

import { SettingsScreen } from './components/settings/SettingsScreen';
import { SyntheticSettingsScreen } from './components/settings/SyntheticSettingsScreen';
import { ChartScreen } from './screens/ChartScreen';
import { MarketsScreen } from './screens/MarketsScreen';
import { SyntheticChartScreen } from './screens/SyntheticChartScreen';
import { useAppTheme } from './themeContext';

type ModalOptions = { route: RouteProp<ParamListBase> };

function modalOptions({ route }: ModalOptions): NativeStackNavigationOptions {
  return {
    orientation:
      route.params &&
      'orientation' in route.params &&
      route.params.orientation === 'landscape'
        ? 'landscape'
        : 'portrait_up',
  };
}

const RootStack = createNativeStackNavigator({
  initialRouteName: 'Markets',
  screenOptions: {
    animation: 'default',
    headerShown: false,
    orientation: 'portrait_up',
  },
  groups: {
    Main: {
      screens: {
        Markets: MarketsScreen,
        Chart: ChartScreen,
        SyntheticChart: SyntheticChartScreen,
      },
    },
    Modals: {
      screenOptions: { presentation: 'modal' },
      screens: {
        SyntheticSettings: {
          screen: SyntheticSettingsScreen,
          options: modalOptions,
        },
        ChartSettings: {
          screen: SettingsScreen,
          options: modalOptions,
        },
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
