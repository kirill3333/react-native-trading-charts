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
import { ChartScreen } from './screens/ChartScreen';
import { MarketsScreen } from './screens/MarketsScreen';

const RootStack = createNativeStackNavigator({
  initialRouteName: 'Markets',
  screenOptions: {
    animation: 'default',
    contentStyle: { backgroundColor: '#100C18' },
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

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const Navigation = createStaticNavigation(RootStack);
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function synchronizeChartSession() {
  const route = navigationRef.getCurrentRoute();
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
  return (
    <Navigation
      onReady={synchronizeChartSession}
      onStateChange={synchronizeChartSession}
      ref={navigationRef}
    />
  );
}
