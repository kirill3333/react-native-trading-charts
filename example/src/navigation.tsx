import {
  createNavigationContainerRef,
  createStaticNavigation,
  type StaticParamList,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { chartDataController } from './chartDataController';
import { ChartScreen } from './screens/ChartScreen';
import { MarketsScreen } from './screens/MarketsScreen';

const RootStack = createNativeStackNavigator({
  initialRouteName: 'Markets',
  screenOptions: {
    animation: 'default',
    contentStyle: { backgroundColor: '#100C18' },
    headerShown: false,
  },
  screens: {
    Markets: MarketsScreen,
    Chart: ChartScreen,
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
  if (route?.name !== 'Chart') {
    chartDataController.deactivate();
    return;
  }
  const params = route.params;
  chartDataController.activate(params.ticker, params.interval);
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
