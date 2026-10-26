import { type ComponentProps } from 'react';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { Pressable, StyleSheet } from 'react-native';

import { createThemedStyles } from '../createThemedStyles';
import { type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';

type ChartControlButtonProps = {
  label: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
  isLandscape: boolean;
  active?: boolean;
  expanded?: boolean;
  hitSlop?: number;
  onPress: () => void;
};
export function ChartControlButton({
  label,
  icon,
  isLandscape,
  active = true,
  expanded,
  hitSlop,
  onPress,
}: ChartControlButtonProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={expanded == null ? undefined : { expanded }}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isLandscape && styles.buttonLandscape,
        pressed && styles.pressed,
      ]}
    >
      <MaterialIcons
        name={icon}
        size={24}
        color={active ? theme.colors.accentText : theme.colors.iconMuted}
      />
    </Pressable>
  );
}
function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    button: {
      alignItems: 'center',
      backgroundColor: colors.control,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      height: 40,
      justifyContent: 'center',
      marginHorizontal: 4,
      minWidth: 48,
      width: 48,
    },
    buttonLandscape: {
      height: 44,
      width: 44,
      minWidth: 44,
      marginHorizontal: 0,
    },
    pressed: { opacity: 0.7 },
  });
}
const THEMED_STYLES = createThemedStyles(createStyles);
