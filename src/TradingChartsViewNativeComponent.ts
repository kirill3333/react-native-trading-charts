import { codegenNativeComponent, type ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  chartId: string;
  configJson: string;
}

export default codegenNativeComponent<NativeProps>('TradingChartsView');
