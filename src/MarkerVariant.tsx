import { type ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

export type MarkerVariantProps = {
  name: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function MarkerVariant({ name, children, style }: MarkerVariantProps) {
  if (name.trim().length === 0) {
    throw new TypeError('marker variant name must be a non-empty string');
  }
  return (
    <View
      nativeID={`marker-variant:${name}`}
      collapsable={false}
      style={[style, { position: 'absolute' }]}
    >
      {children}
    </View>
  );
}
