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

export type SelectedCandleChangeNativeEvent = Readonly<{
  active: boolean;
  timestamp: CodegenTypes.Double;
  open: CodegenTypes.Double;
  high: CodegenTypes.Double;
  low: CodegenTypes.Double;
  close: CodegenTypes.Double;
  volume: CodegenTypes.Double;
}>;

export type ScaleChangeNativeEvent = Readonly<{
  scale: CodegenTypes.Double;
}>;

export interface NativeProps extends ViewProps {
  chartId: string;
  configJson: string;
  onVisibleRangeChange?: CodegenTypes.DirectEventHandler<VisibleRangeChangeNativeEvent>;
  onScaleChange?: CodegenTypes.DirectEventHandler<ScaleChangeNativeEvent>;
  onYAxisScaleChange?: CodegenTypes.DirectEventHandler<ScaleChangeNativeEvent>;
  onSelectedCandleChange?: CodegenTypes.DirectEventHandler<SelectedCandleChangeNativeEvent>;
}

export default codegenNativeComponent<NativeProps>('TradingChartsView');
