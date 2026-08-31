import { useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useChartSettingsStore } from '../../stores/chartSettingsStore';
import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';
import {
  CrosshairSettingsSection,
  EmaSettingsSection,
  FormattingSettingsSection,
  GesturesSettingsSection,
  MacdSettingsSection,
  PaneHeightsSettingsSection,
  PriceOverlaysSettingsSection,
  RsiSettingsSection,
  SeriesSettingsSection,
  SmaSettingsSection,
  ThemeSettingsSection,
  VolumeSettingsSection,
  XAxisSettingsSection,
  YAxisSettingsSection,
} from './sections';

export function SettingsScreen() {
  const navigation = useNavigation();
  const resetSettings = useChartSettingsStore((state) => state.resetSettings);
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.title}>Chart settings</Text>
        <Pressable
          accessibilityLabel="Close chart settings"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ThemeSettingsSection />
        <SeriesSettingsSection />
        <VolumeSettingsSection />
        <PaneHeightsSettingsSection />
        <RsiSettingsSection />
        <MacdSettingsSection />
        <SmaSettingsSection />
        <EmaSettingsSection />
        <XAxisSettingsSection />
        <YAxisSettingsSection />
        <GesturesSettingsSection />
        <PriceOverlaysSettingsSection />
        <CrosshairSettingsSection />
        <FormattingSettingsSection />

        <Pressable
          accessibilityLabel="Restore default chart settings"
          accessibilityRole="button"
          onPress={resetSettings}
          style={({ pressed }) => [
            styles.restoreButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.restoreText}>Restore defaults</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    safeArea: { backgroundColor: colors.background, flex: 1 },
    header: {
      alignItems: 'center',
      borderBottomColor: colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      minHeight: 56,
      paddingHorizontal: 14,
    },
    headerSpacer: { width: 64 },
    title: {
      color: colors.text,
      flex: 1,
      fontSize: 17,
      fontWeight: '800',
      textAlign: 'center',
    },
    closeButton: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      minHeight: 40,
      width: 64,
    },
    closeText: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
    content: { paddingHorizontal: 14, paddingTop: 22, paddingBottom: 32 },
    restoreButton: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      justifyContent: 'center',
      minHeight: 46,
    },
    restoreText: {
      color: colors.accentText,
      fontSize: 14,
      fontWeight: '800',
    },
    pressed: { opacity: 0.7 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
