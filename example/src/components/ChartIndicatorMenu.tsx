import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChartControlsStore } from '../stores/chartControlsStore';
import { useChartSettingsStore } from '../stores/chartSettingsStore';
import { APP_THEMES, type AppThemeColors } from '../theme';
import { useAppTheme } from '../themeContext';
import { SettingSwitch } from './settings/SettingSwitch';

export type ChartIndicatorMenuKind = 'indicators' | 'panels';

type ChartIndicatorMenuProps = {
  kind: ChartIndicatorMenuKind;
  isLandscape: boolean;
  onClose: () => void;
};

export function ChartIndicatorMenu({
  kind,
  isLandscape,
  onClose,
}: ChartIndicatorMenuProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const insets = useSafeAreaInsets();
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore((state) => state.updateSettings);
  const controls = useChartControlsStore();

  return (
    <Modal
      transparent
      animationType="fade"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + (isLandscape ? 8 : 68),
            paddingLeft: insets.left + (isLandscape ? 68 : 14),
            paddingRight: insets.right + 14,
          },
          isLandscape && styles.containerLandscape,
        ]}
      >
        <Pressable
          accessibilityLabel="Close indicator menu"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.menu}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {kind === 'indicators' ? 'Indicators' : 'Panels'}
            </Text>
            <Pressable
              accessibilityLabel="Close indicator menu"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <MaterialIcons
                name="close"
                size={20}
                color={theme.colors.textSecondary}
              />
            </Pressable>
          </View>
          <ScrollView bounces={false}>
            {kind === 'indicators' ? (
              <>
                <SettingSwitch
                  label="BOLL"
                  description="Bollinger Bands"
                  value={settings.bollEnabled}
                  onValueChange={(bollEnabled) =>
                    updateSettings({ bollEnabled })
                  }
                />
                <SettingSwitch
                  label="EMA"
                  description="Exponential moving average"
                  value={settings.emaEnabled}
                  onValueChange={(emaEnabled) => updateSettings({ emaEnabled })}
                />
                <SettingSwitch
                  label="SMA"
                  description="Simple moving average"
                  value={settings.smaEnabled}
                  onValueChange={(smaEnabled) => updateSettings({ smaEnabled })}
                />
              </>
            ) : (
              <>
                <SettingSwitch
                  label="Volume"
                  description="Trading volume"
                  value={controls.showVolume}
                  onValueChange={controls.toggleVolume}
                />
                <SettingSwitch
                  label="RSI"
                  description="Relative strength index"
                  value={controls.showRsi}
                  onValueChange={controls.toggleRsi}
                />
                <SettingSwitch
                  label="MACD"
                  description="Moving average convergence / divergence"
                  value={controls.showMacd}
                  onValueChange={controls.toggleMacd}
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'flex-start',
    },
    containerLandscape: { justifyContent: 'flex-start' },
    menu: {
      width: 320,
      maxWidth: '100%',
      maxHeight: '100%',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 16,
      paddingBottom: 6,
      overflow: 'hidden',
      boxShadow: '0 8px 28px rgba(0, 0, 0, 0.25)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 14,
      paddingRight: 4,
      borderBottomColor: colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
    close: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
