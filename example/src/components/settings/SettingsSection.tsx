import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { type ReactNode, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';

type SettingsSectionProps = {
  children: ReactNode;
  title: string;
};

export function SettingsSection({ children, title }: SettingsSectionProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const [expanded, setExpanded] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  const toggle = () => {
    if (expanded) Keyboard.dismiss();
    setHasOpened(true);
    setExpanded((current) => !current);
  };

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={title}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <Text style={styles.title}>{title}</Text>
        <MaterialIcons
          accessible={false}
          color={theme.colors.textSecondary}
          name={expanded ? 'expand-less' : 'expand-more'}
          size={24}
        />
      </Pressable>
      {/* Keep visited fields mounted so collapsing preserves unfinished input. */}
      {hasOpened ? (
        <View
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
          style={[styles.content, !expanded && styles.collapsed]}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      minHeight: 56,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    title: {
      color: colors.text,
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
    },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 8,
      overflow: 'hidden',
    },
    content: {
      borderTopColor: colors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingVertical: 4,
    },
    collapsed: { display: 'none' },
    pressed: { backgroundColor: colors.pressed },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
