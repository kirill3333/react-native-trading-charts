import { useNavigation } from '@react-navigation/native';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useChartSettings } from '../../chartSettings';
import { SettingSegments } from './SettingSegments';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingSwitch } from './SettingSwitch';

const SPACING_OPTIONS = [
  { label: 'Time', value: 'time' },
  { label: 'Logical', value: 'logical' },
] as const;
const POSITION_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
] as const;
const FORMAT_OPTIONS = [
  { label: 'Price', value: 'price' },
  { label: 'Compact', value: 'compact' },
] as const;
const MARGIN_OPTIONS = [
  { label: 'Tight', value: 'tight' },
  { label: 'Default', value: 'default' },
  { label: 'Loose', value: 'loose' },
] as const;
const LINE_OPTIONS = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
] as const;
const OPACITY_OPTIONS = [
  { label: '60%', value: 0.6 },
  { label: '85%', value: 0.85 },
  { label: '100%', value: 1 },
] as const;
const LOCALE_OPTIONS = [
  { label: 'en-GB', value: 'en-GB' },
  { label: 'en-US', value: 'en-US' },
] as const;
const TIME_ZONE_OPTIONS = [
  { label: 'UTC', value: 'utc' },
  { label: 'Device', value: 'device' },
] as const;

export function SettingsScreen() {
  const navigation = useNavigation();
  const { resetSettings, settings, updateSettings } = useChartSettings();
  const currentPriceDetailsDisabled = !settings.currentPriceVisible;
  const pinToEdgeDisabled =
    currentPriceDetailsDisabled || !settings.currentPriceShowLabel;
  const crosshairDetailsDisabled = !settings.crosshairEnabled;
  const tooltipDetailsDisabled =
    crosshairDetailsDisabled || !settings.crosshairShowTooltip;

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
        <SettingsSection title="Theme">
          <SettingSwitch
            description="Brighter candles and white chart labels"
            label="High contrast"
            onValueChange={(highContrast) =>
              updateSettings({
                themeMode: highContrast ? 'highContrast' : 'default',
              })
            }
            value={settings.themeMode === 'highContrast'}
          />
        </SettingsSection>

        <SettingsSection title="X axis">
          <SettingSwitch
            label="Visible"
            onValueChange={(xAxisVisible) => updateSettings({ xAxisVisible })}
            value={settings.xAxisVisible}
          />
          <SettingSwitch
            disabled={!settings.xAxisVisible}
            label="Show seconds"
            onValueChange={(xAxisShowSeconds) =>
              updateSettings({ xAxisShowSeconds })
            }
            value={settings.xAxisShowSeconds}
          />
          <SettingSegments
            disabled={!settings.xAxisVisible}
            label="Spacing"
            onValueChange={(xAxisSpacing) => updateSettings({ xAxisSpacing })}
            options={SPACING_OPTIONS}
            value={settings.xAxisSpacing}
          />
        </SettingsSection>

        <SettingsSection title="Y axis">
          <SettingSwitch
            label="Visible"
            onValueChange={(yAxisVisible) => updateSettings({ yAxisVisible })}
            value={settings.yAxisVisible}
          />
          <SettingSegments
            disabled={!settings.yAxisVisible}
            label="Position"
            onValueChange={(yAxisPosition) => updateSettings({ yAxisPosition })}
            options={POSITION_OPTIONS}
            value={settings.yAxisPosition}
          />
          <SettingSegments
            disabled={!settings.yAxisVisible}
            label="Value format"
            onValueChange={(yAxisFormat) => updateSettings({ yAxisFormat })}
            options={FORMAT_OPTIONS}
            value={settings.yAxisFormat}
          />
          <SettingSwitch
            disabled={!settings.yAxisVisible}
            label="Digit grouping"
            onValueChange={(yAxisUseGrouping) =>
              updateSettings({ yAxisUseGrouping })
            }
            value={settings.yAxisUseGrouping}
          />
          <SettingSegments
            disabled={!settings.yAxisVisible}
            label="Scale margins"
            onValueChange={(yAxisScaleMargins) =>
              updateSettings({ yAxisScaleMargins })
            }
            options={MARGIN_OPTIONS}
            value={settings.yAxisScaleMargins}
          />
        </SettingsSection>

        <SettingsSection title="Gestures">
          <SettingSwitch
            label="Pan"
            onValueChange={(panEnabled) => updateSettings({ panEnabled })}
            value={settings.panEnabled}
          />
          <SettingSwitch
            label="Zoom"
            onValueChange={(zoomEnabled) => updateSettings({ zoomEnabled })}
            value={settings.zoomEnabled}
          />
        </SettingsSection>

        <SettingsSection title="Price overlays">
          <SettingSwitch
            label="Current price"
            onValueChange={(currentPriceVisible) =>
              updateSettings({ currentPriceVisible })
            }
            value={settings.currentPriceVisible}
          />
          <SettingSwitch
            disabled={currentPriceDetailsDisabled}
            label="Price label"
            onValueChange={(currentPriceShowLabel) =>
              updateSettings({ currentPriceShowLabel })
            }
            value={settings.currentPriceShowLabel}
          />
          <SettingSwitch
            description="Keep the label on the Y-axis edge"
            disabled={pinToEdgeDisabled}
            label="Pin to edge"
            onValueChange={(currentPricePinToEdge) =>
              updateSettings({ currentPricePinToEdge })
            }
            value={settings.currentPricePinToEdge}
          />
          <SettingSwitch
            label="Price extremes"
            onValueChange={(priceExtremesVisible) =>
              updateSettings({ priceExtremesVisible })
            }
            value={settings.priceExtremesVisible}
          />
        </SettingsSection>

        <SettingsSection title="Crosshair">
          <SettingSwitch
            label="Enabled"
            onValueChange={(crosshairEnabled) =>
              updateSettings({ crosshairEnabled })
            }
            value={settings.crosshairEnabled}
          />
          <SettingSwitch
            disabled={crosshairDetailsDisabled}
            label="Tooltip"
            onValueChange={(crosshairShowTooltip) =>
              updateSettings({ crosshairShowTooltip })
            }
            value={settings.crosshairShowTooltip}
          />
          <SettingSegments
            disabled={crosshairDetailsDisabled}
            label="Line"
            onValueChange={(crosshairLineStyle) =>
              updateSettings({ crosshairLineStyle })
            }
            options={LINE_OPTIONS}
            value={settings.crosshairLineStyle}
          />
          <SettingSegments
            disabled={tooltipDetailsDisabled}
            label="Tooltip opacity"
            onValueChange={(crosshairTooltipOpacity) =>
              updateSettings({ crosshairTooltipOpacity })
            }
            options={OPACITY_OPTIONS}
            value={settings.crosshairTooltipOpacity}
          />
        </SettingsSection>

        <SettingsSection title="Formatting">
          <SettingSegments
            label="Locale"
            onValueChange={(locale) => updateSettings({ locale })}
            options={LOCALE_OPTIONS}
            value={settings.locale}
          />
          <SettingSegments
            label="Time zone"
            onValueChange={(timeZone) => updateSettings({ timeZone })}
            options={TIME_ZONE_OPTIONS}
            value={settings.timeZone}
          />
          <SettingsRow
            description="Optional prefix for every displayed price"
            label="Currency symbol"
          >
            <TextInput
              accessibilityLabel="Currency symbol"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={4}
              onChangeText={(currencySymbol) =>
                updateSettings({ currencySymbol })
              }
              placeholder="None"
              placeholderTextColor="#6F6979"
              selectTextOnFocus
              style={styles.input}
              value={settings.currencySymbol}
            />
          </SettingsRow>
        </SettingsSection>

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

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#100C18', flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomColor: '#292431',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 14,
  },
  headerSpacer: { width: 64 },
  title: {
    color: '#F6F3FA',
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
  closeText: { color: '#C2B9FF', fontSize: 14, fontWeight: '800' },
  content: { paddingHorizontal: 14, paddingTop: 22, paddingBottom: 32 },
  input: {
    backgroundColor: '#100C18',
    borderColor: '#393242',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#FFFFFF',
    fontSize: 13,
    minHeight: 36,
    minWidth: 76,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  restoreButton: {
    alignItems: 'center',
    borderColor: '#51485E',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 46,
  },
  restoreText: { color: '#C2B9FF', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
