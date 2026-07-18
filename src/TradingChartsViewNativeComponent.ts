import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

export type VisibleRangeChangeNativeEvent = Readonly<{
  from: CodegenTypes.Double;
  to: CodegenTypes.Double;
  firstVisibleIndex: CodegenTypes.Int32;
  lastVisibleIndex: CodegenTypes.Int32;
  totalCount: CodegenTypes.Int32;
  atStart: boolean;
  atEnd: boolean;
}>;

export interface NativeProps extends ViewProps {
  chartId: string;
  configJson: string;
  onVisibleRangeChange?: CodegenTypes.DirectEventHandler<VisibleRangeChangeNativeEvent>;
}

export default codegenNativeComponent<NativeProps>('TradingChartsView');
