import {
  createNavigationContainerRef,
  createStaticNavigation,
  type StaticParamList,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
  chartDataController,
  hyperliquidChartDataController,
} from './chartDataController';
import { SettingsScreen } from './components/settings/SettingsScreen';
import {
  ChartScreen,
  type ChartRouteParams,
} from './screens/ChartScreen';
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
type RootRoute =
  | { name: 'Markets'; params?: undefined }
  | { name: 'ChartSettings'; params?: undefined }
  | { name: 'Chart'; params: ChartRouteParams };

declare module '@react-navigation/core' {
  interface RootNavigator extends RootStackType {}
}

const Navigation = createStaticNavigation(RootStack);
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function synchronizeChartSession() {
  const route = navigationRef.getCurrentRoute() as RootRoute | undefined;
  const routeName = route?.name;
  if (routeName === 'ChartSettings') {
    return;
  }
  if (!route || routeName !== 'Chart') {
    chartDataController.deactivate();
    hyperliquidChartDataController.deactivate();
    return;
  }
  const params = route.params;
  if (params.provider === 'hyperliquid') {
    chartDataController.deactivate();
    hyperliquidChartDataController.activate(params.ticker, params.interval);
  } else {
    hyperliquidChartDataController.deactivate();
    chartDataController.activate(params.ticker, params.interval);
  }
}

export function AppNavigation() {
  const theme = useAppTheme();
  return (
    <Navigation
      onReady={synchronizeChartSession}
      onStateChange={synchronizeChartSession}
      ref={navigationRef}
      theme={theme.navigationTheme}
    />
  );
}
