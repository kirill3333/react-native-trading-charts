import { useCallback } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  type ListRenderItem,
} from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';

export type TimeIntervalOption<TInterval extends string> = {
  value: TInterval;
  label: string;
};

type TimeIntervalSelectorProps<TInterval extends string> = {
  intervals: ReadonlyArray<TimeIntervalOption<TInterval>>;
  selectedInterval: TInterval;
  onSelect: (interval: TInterval) => void;
};

export function TimeIntervalSelector<TInterval extends string>({
  intervals,
  selectedInterval,
  onSelect,
}: TimeIntervalSelectorProps<TInterval>) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const renderInterval = useCallback<
    ListRenderItem<TimeIntervalOption<TInterval>>
  >(
    ({ item }) => {
      const selected = item.value === selectedInterval;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => onSelect(item.value)}
          style={({ pressed }) => [
            styles.button,
            selected && styles.buttonSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text style={selected ? styles.textSelected : styles.text}>
            {item.label}
          </Text>
        </Pressable>
      );
    },
    [onSelect, selectedInterval, styles]
  );

  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={intervals}
      horizontal
      keyExtractor={(item) => item.value}
      renderItem={renderInterval}
      showsHorizontalScrollIndicator={false}
      style={styles.container}
    />
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    container: {
      borderBottomColor: colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexGrow: 0,
    },
    content: {
      flexDirection: 'row',
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    button: {
      alignItems: 'center',
      borderRadius: 8,
      justifyContent: 'center',
      marginRight: 6,
      minWidth: 48,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    buttonSelected: { backgroundColor: colors.accent },
    text: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    textSelected: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: '800',
    },
    pressed: { opacity: 0.7 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
