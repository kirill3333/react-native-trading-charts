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
import { ChartNavigationActions } from './ChartNavigationActions';
import { SettingSwitch } from './settings/SettingSwitch';
import { SERIES_OPTIONS } from './settings/sections/settingsOptions';

export type ChartControlMenuKind =
  'indicators' | 'panels' | 'charts' | 'navigation';

const MENU_TITLES = {
  indicators: 'Indicators',
  panels: 'Panels',
  charts: 'Charts',
  navigation: 'Chart navigation',
};

type ChartControlMenuProps = {
  kind: ChartControlMenuKind;
  isLandscape: boolean;
  onClose: () => void;
  onToggleOrientation: () => void;
};

export function ChartControlMenu({
  kind,
  isLandscape,
  onClose,
  onToggleOrientation,
}: ChartControlMenuProps) {
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
          accessibilityLabel={`Close ${MENU_TITLES[kind]} menu`}
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.menu}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {MENU_TITLES[kind]}
            </Text>
            <Pressable
              accessibilityLabel={`Close ${MENU_TITLES[kind]} menu`}
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
            {kind === 'navigation' && (
              <ChartNavigationActions
                isLandscape={isLandscape}
                onToggleOrientation={() => {
                  onClose();
                  onToggleOrientation();
                }}
              />
            )}
            {kind === 'indicators' && (
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
                  label="SAR"
                  description="Parabolic stop and reverse"
                  value={settings.sarEnabled}
                  onValueChange={(sarEnabled) => updateSettings({ sarEnabled })}
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
            )}
            {kind === 'panels' && (
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
            {kind === 'charts' && (
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Chart type"
              >
                {SERIES_OPTIONS.map(({ label, value }) => {
                  const selected = settings.seriesType === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityLabel={label}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => {
                        updateSettings({ seriesType: value });
                        onClose();
                      }}
                      style={({ pressed }) => [
                        styles.option,
                        selected && styles.optionSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          selected && styles.optionTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                      {selected && (
                        <MaterialIcons
                          name="check"
                          size={20}
                          color={theme.colors.accentText}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
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
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    optionSelected: { backgroundColor: colors.control },
    optionText: { flex: 1, color: colors.text, fontSize: 15 },
    optionTextSelected: { color: colors.accentText, fontWeight: '700' },
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
