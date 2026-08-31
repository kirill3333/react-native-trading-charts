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
import {
  buildMainSeriesColors,
  buildVolumeAppearance,
} from '../../chartSettingsConfig';
import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';
import { SettingSegments } from './SettingSegments';
import { HexColorSetting } from './HexColorSetting';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingSwitch } from './SettingSwitch';

const SERIES_OPTIONS = [
  { label: 'Candles', value: 'candlestick' },
  { label: 'Hollow', value: 'hollowCandlestick' },
  { label: 'Bars', value: 'bar' },
  { label: 'Line', value: 'line' },
  { label: 'Area', value: 'area' },
] as const;
const SPACING_OPTIONS = [
  { label: 'Time', value: 'time' },
  { label: 'Logical', value: 'logical' },
] as const;
const SERIES_LINE_WIDTH_OPTIONS = [
  { label: 'Thin', value: 1 },
  { label: 'Medium', value: 1.5 },
  { label: 'Thick', value: 2.5 },
] as const;
const INDICATOR_LINE_WIDTH_OPTIONS = [
  { label: 'Hairline', value: 0.5 },
  ...SERIES_LINE_WIDTH_OPTIONS,
] as const;
const SMA_PERIOD_OPTIONS = [
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 },
] as const;
const EMA_PERIOD_OPTIONS = [
  { label: '20', value: 20 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
] as const;
const MACD_FAST_PERIOD_OPTIONS = [
  { label: '8', value: 8 },
  { label: '12', value: 12 },
  { label: '16', value: 16 },
] as const;
const MACD_SLOW_PERIOD_OPTIONS = [
  { label: '21', value: 21 },
  { label: '26', value: 26 },
  { label: '32', value: 32 },
] as const;
const MACD_SIGNAL_PERIOD_OPTIONS = [
  { label: '5', value: 5 },
  { label: '9', value: 9 },
  { label: '12', value: 12 },
] as const;
const VALUE_SOURCE_OPTIONS = [
  { label: 'Open', value: 'open' },
  { label: 'High', value: 'high' },
  { label: 'Low', value: 'low' },
  { label: 'Close', value: 'close' },
] as const;
const PANE_HEIGHT_WEIGHT_OPTIONS = [
  { label: '½×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '3×', value: 3 },
] as const;
const POSITION_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
] as const;
const FORMAT_OPTIONS = [
  { label: 'Auto', value: 'auto' },
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
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const currentPriceDetailsDisabled = !settings.currentPriceVisible;
  const pinToEdgeDisabled =
    currentPriceDetailsDisabled || !settings.currentPriceShowLabel;
  const crosshairDetailsDisabled = !settings.crosshairEnabled;
  const tooltipDetailsDisabled =
    crosshairDetailsDisabled || !settings.crosshairShowTooltip;
  const mainColors = buildMainSeriesColors(settings);
  const volumeAppearance = buildVolumeAppearance(settings);

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
            description="Use light colors across the app and chart"
            label="Light theme"
            onValueChange={(lightTheme) =>
              updateSettings({
                themeMode: lightTheme ? 'light' : 'dark',
              })
            }
            value={settings.themeMode === 'light'}
          />
        </SettingsSection>
        <SettingsSection title="Main chart">
          <SettingSegments
            label="Style"
            onValueChange={(seriesType) => updateSettings({ seriesType })}
            options={SERIES_OPTIONS}
            value={settings.seriesType}
          />
          {(settings.seriesType === 'line' ||
            settings.seriesType === 'area') && (
            <>
              <SettingSegments
                label="Line width"
                onValueChange={(seriesLineWidth) =>
                  updateSettings({ seriesLineWidth })
                }
                options={SERIES_LINE_WIDTH_OPTIONS}
                value={settings.seriesLineWidth}
              />
              <HexColorSetting
                description="Color of the close-price line"
                label="Line color"
                onValueChange={(mainLineColorOverride) =>
                  updateSettings({ mainLineColorOverride })
                }
                value={mainColors.lineColor}
              />
            </>
          )}
          {(settings.seriesType === 'candlestick' ||
            settings.seriesType === 'hollowCandlestick' ||
            settings.seriesType === 'bar') && (
            <>
              <HexColorSetting
                description="Rising candles and bars"
                label="Up color"
                onValueChange={(mainUpColorOverride) =>
                  updateSettings({ mainUpColorOverride })
                }
                value={mainColors.upColor}
              />
              <HexColorSetting
                description="Falling candles and bars"
                label="Down color"
                onValueChange={(mainDownColorOverride) =>
                  updateSettings({ mainDownColorOverride })
                }
                value={mainColors.downColor}
              />
            </>
          )}
          {settings.seriesType === 'area' && (
            <>
              <HexColorSetting
                description="Color at the top of the area fill"
                label="Fill top"
                onValueChange={(mainAreaFillTopColorOverride) =>
                  updateSettings({ mainAreaFillTopColorOverride })
                }
                value={mainColors.areaFillTopColor}
              />
              <HexColorSetting
                description="Color at the bottom of the area fill"
                label="Fill bottom"
                onValueChange={(mainAreaFillBottomColorOverride) =>
                  updateSettings({ mainAreaFillBottomColorOverride })
                }
                value={mainColors.areaFillBottomColor}
              />
            </>
          )}
        </SettingsSection>

        <SettingsSection title="Volume">
          <HexColorSetting
            description="Volume bars for rising candles"
            label="Up color"
            onValueChange={(volumeUpColorOverride) =>
              updateSettings({ volumeUpColorOverride })
            }
            value={volumeAppearance.upColor}
          />
          <HexColorSetting
            description="Volume bars for falling candles"
            label="Down color"
            onValueChange={(volumeDownColorOverride) =>
              updateSettings({ volumeDownColorOverride })
            }
            value={volumeAppearance.downColor}
          />
        </SettingsSection>

        <SettingsSection title="Pane heights">
          <SettingSegments
            description="Relative share of the available chart height"
            label="Main chart"
            onValueChange={(mainPaneHeightWeight) =>
              updateSettings({ mainPaneHeightWeight })
            }
            options={PANE_HEIGHT_WEIGHT_OPTIONS}
            value={settings.mainPaneHeightWeight}
          />
          <SettingSegments
            label="Volume"
            onValueChange={(volumePaneHeightWeight) =>
              updateSettings({ volumePaneHeightWeight })
            }
            options={PANE_HEIGHT_WEIGHT_OPTIONS}
            value={settings.volumePaneHeightWeight}
          />
          <SettingSegments
            label="RSI"
            onValueChange={(rsiPaneHeightWeight) =>
              updateSettings({ rsiPaneHeightWeight })
            }
            options={PANE_HEIGHT_WEIGHT_OPTIONS}
            value={settings.rsiPaneHeightWeight}
          />
          <SettingSegments
            label="MACD"
            onValueChange={(macdPaneHeightWeight) =>
              updateSettings({ macdPaneHeightWeight })
            }
            options={PANE_HEIGHT_WEIGHT_OPTIONS}
            value={settings.macdPaneHeightWeight}
          />
        </SettingsSection>

        <SettingsSection title="RSI">
          <SettingSegments
            label="Line width"
            onValueChange={(rsiLineWidth) => updateSettings({ rsiLineWidth })}
            options={INDICATOR_LINE_WIDTH_OPTIONS}
            value={settings.rsiLineWidth}
          />
          <HexColorSetting
            description="Color of the RSI curve"
            label="Line color"
            onValueChange={(rsiLineColorOverride) =>
              updateSettings({ rsiLineColorOverride })
            }
            value={settings.rsiLineColorOverride ?? theme.rsiColor}
          />
          <HexColorSetting
            description="Color of the RSI title and value"
            label="Text color"
            onValueChange={(rsiTextColorOverride) =>
              updateSettings({ rsiTextColorOverride })
            }
            value={settings.rsiTextColorOverride ?? theme.rsiTextColor}
          />
          <HexColorSetting
            description="Fill between oversold and overbought"
            label="Band color"
            onValueChange={(rsiBandColorOverride) =>
              updateSettings({ rsiBandColorOverride })
            }
            value={settings.rsiBandColorOverride ?? theme.rsiBandColor}
          />
          <HexColorSetting
            description="Dashed oversold and overbought levels"
            label="Level color"
            onValueChange={(rsiLevelLineColorOverride) =>
              updateSettings({ rsiLevelLineColorOverride })
            }
            value={
              settings.rsiLevelLineColorOverride ?? theme.rsiLevelLineColor
            }
          />
        </SettingsSection>

        <SettingsSection title="MACD">
          <SettingSegments
            label="Fast period"
            onValueChange={(macdFastPeriod) =>
              updateSettings({ macdFastPeriod })
            }
            options={MACD_FAST_PERIOD_OPTIONS}
            value={settings.macdFastPeriod}
          />
          <SettingSegments
            label="Slow period"
            onValueChange={(macdSlowPeriod) =>
              updateSettings({ macdSlowPeriod })
            }
            options={MACD_SLOW_PERIOD_OPTIONS}
            value={settings.macdSlowPeriod}
          />
          <SettingSegments
            label="Signal period"
            onValueChange={(macdSignalPeriod) =>
              updateSettings({ macdSignalPeriod })
            }
            options={MACD_SIGNAL_PERIOD_OPTIONS}
            value={settings.macdSignalPeriod}
          />
          <SettingSegments
            label="Value source"
            onValueChange={(macdValueSource) =>
              updateSettings({ macdValueSource })
            }
            options={VALUE_SOURCE_OPTIONS}
            value={settings.macdValueSource}
          />
          <SettingSegments
            label="MACD width"
            onValueChange={(macdLineWidth) =>
              updateSettings({ macdLineWidth })
            }
            options={INDICATOR_LINE_WIDTH_OPTIONS}
            value={settings.macdLineWidth}
          />
          <SettingSegments
            label="MACD style"
            onValueChange={(macdLineStyle) =>
              updateSettings({ macdLineStyle })
            }
            options={LINE_OPTIONS}
            value={settings.macdLineStyle}
          />
          <HexColorSetting
            label="MACD color"
            onValueChange={(macdLineColor) =>
              updateSettings({ macdLineColor })
            }
            value={settings.macdLineColor ?? theme.macd.lineColor}
          />
          <SettingSwitch
            label="MACD gradient"
            onValueChange={(macdGradientEnabled) =>
              updateSettings({ macdGradientEnabled })
            }
            value={settings.macdGradientEnabled}
          />
          {settings.macdGradientEnabled ? (
            <>
              <HexColorSetting
                label="MACD gradient top"
                onValueChange={(macdGradientTopColor) =>
                  updateSettings({ macdGradientTopColor })
                }
                value={
                  settings.macdGradientTopColor ?? theme.macd.gradientTopColor
                }
              />
              <HexColorSetting
                label="MACD gradient bottom"
                onValueChange={(macdGradientBottomColor) =>
                  updateSettings({ macdGradientBottomColor })
                }
                value={
                  settings.macdGradientBottomColor ??
                  theme.macd.gradientBottomColor
                }
              />
            </>
          ) : null}
          <SettingSegments
            label="Signal width"
            onValueChange={(macdSignalLineWidth) =>
              updateSettings({ macdSignalLineWidth })
            }
            options={INDICATOR_LINE_WIDTH_OPTIONS}
            value={settings.macdSignalLineWidth}
          />
          <SettingSegments
            label="Signal style"
            onValueChange={(macdSignalLineStyle) =>
              updateSettings({ macdSignalLineStyle })
            }
            options={LINE_OPTIONS}
            value={settings.macdSignalLineStyle}
          />
          <HexColorSetting
            label="Signal color"
            onValueChange={(macdSignalLineColor) =>
              updateSettings({ macdSignalLineColor })
            }
            value={
              settings.macdSignalLineColor ?? theme.macd.signalLineColor
            }
          />
          <SettingSwitch
            label="Signal gradient"
            onValueChange={(macdSignalGradientEnabled) =>
              updateSettings({ macdSignalGradientEnabled })
            }
            value={settings.macdSignalGradientEnabled}
          />
          {settings.macdSignalGradientEnabled ? (
            <>
              <HexColorSetting
                label="Signal gradient top"
                onValueChange={(macdSignalGradientTopColor) =>
                  updateSettings({ macdSignalGradientTopColor })
                }
                value={
                  settings.macdSignalGradientTopColor ??
                  theme.macd.signalGradientTopColor
                }
              />
              <HexColorSetting
                label="Signal gradient bottom"
                onValueChange={(macdSignalGradientBottomColor) =>
                  updateSettings({ macdSignalGradientBottomColor })
                }
                value={
                  settings.macdSignalGradientBottomColor ??
                  theme.macd.signalGradientBottomColor
                }
              />
            </>
          ) : null}
          <HexColorSetting
            label="Positive increasing"
            onValueChange={(macdPositiveIncreasingColor) =>
              updateSettings({ macdPositiveIncreasingColor })
            }
            value={
              settings.macdPositiveIncreasingColor ??
              theme.macd.positiveIncreasingColor
            }
          />
          <HexColorSetting
            label="Positive decreasing"
            onValueChange={(macdPositiveDecreasingColor) =>
              updateSettings({ macdPositiveDecreasingColor })
            }
            value={
              settings.macdPositiveDecreasingColor ??
              theme.macd.positiveDecreasingColor
            }
          />
          <HexColorSetting
            label="Negative increasing"
            onValueChange={(macdNegativeIncreasingColor) =>
              updateSettings({ macdNegativeIncreasingColor })
            }
            value={
              settings.macdNegativeIncreasingColor ??
              theme.macd.negativeIncreasingColor
            }
          />
          <HexColorSetting
            label="Negative decreasing"
            onValueChange={(macdNegativeDecreasingColor) =>
              updateSettings({ macdNegativeDecreasingColor })
            }
            value={
              settings.macdNegativeDecreasingColor ??
              theme.macd.negativeDecreasingColor
            }
          />
          <HexColorSetting
            label="Legend text"
            onValueChange={(macdTextColor) =>
              updateSettings({ macdTextColor })
            }
            value={settings.macdTextColor ?? theme.macd.textColor}
          />
          <HexColorSetting
            label="Zero line"
            onValueChange={(macdZeroLineColor) =>
              updateSettings({ macdZeroLineColor })
            }
            value={settings.macdZeroLineColor ?? theme.macd.zeroLineColor}
          />
        </SettingsSection>

        <SettingsSection title="SMA">
          <SettingSwitch
            description="Simple moving average over the main OHLC series"
            label="Enabled"
            onValueChange={(smaEnabled) => updateSettings({ smaEnabled })}
            value={settings.smaEnabled}
          />
          {settings.smaEnabled ? (
            <>
              <SettingSegments
                label="Period"
                onValueChange={(smaPeriod) => updateSettings({ smaPeriod })}
                options={SMA_PERIOD_OPTIONS}
                value={settings.smaPeriod}
              />
              <SettingSegments
                label="Value source"
                onValueChange={(smaValueSource) =>
                  updateSettings({ smaValueSource })
                }
                options={VALUE_SOURCE_OPTIONS}
                value={settings.smaValueSource}
              />
              <SettingSegments
                label="Line width"
                onValueChange={(smaLineWidth) =>
                  updateSettings({ smaLineWidth })
                }
                options={INDICATOR_LINE_WIDTH_OPTIONS}
                value={settings.smaLineWidth}
              />
              <SettingSegments
                label="Line style"
                onValueChange={(smaLineStyle) =>
                  updateSettings({ smaLineStyle })
                }
                options={LINE_OPTIONS}
                value={settings.smaLineStyle}
              />
              <HexColorSetting
                description="Base color used when gradient is disabled"
                label="Line color"
                onValueChange={(smaLineColor) =>
                  updateSettings({ smaLineColor })
                }
                value={settings.smaLineColor}
              />
              <SettingSwitch
                label="Vertical gradient"
                onValueChange={(smaGradientEnabled) =>
                  updateSettings({ smaGradientEnabled })
                }
                value={settings.smaGradientEnabled}
              />
              {settings.smaGradientEnabled ? (
                <>
                  <HexColorSetting
                    label="Gradient top"
                    onValueChange={(smaGradientTopColor) =>
                      updateSettings({ smaGradientTopColor })
                    }
                    value={settings.smaGradientTopColor}
                  />
                  <HexColorSetting
                    label="Gradient bottom"
                    onValueChange={(smaGradientBottomColor) =>
                      updateSettings({ smaGradientBottomColor })
                    }
                    value={settings.smaGradientBottomColor}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </SettingsSection>

        <SettingsSection title="EMA">
          <SettingSwitch
            description="Exponential moving average seeded with SMA"
            label="Enabled"
            onValueChange={(emaEnabled) => updateSettings({ emaEnabled })}
            value={settings.emaEnabled}
          />
          {settings.emaEnabled ? (
            <>
              <SettingSegments
                label="Period"
                onValueChange={(emaPeriod) => updateSettings({ emaPeriod })}
                options={EMA_PERIOD_OPTIONS}
                value={settings.emaPeriod}
              />
              <SettingSegments
                label="Value source"
                onValueChange={(emaValueSource) =>
                  updateSettings({ emaValueSource })
                }
                options={VALUE_SOURCE_OPTIONS}
                value={settings.emaValueSource}
              />
              <SettingSegments
                label="Line width"
                onValueChange={(emaLineWidth) =>
                  updateSettings({ emaLineWidth })
                }
                options={INDICATOR_LINE_WIDTH_OPTIONS}
                value={settings.emaLineWidth}
              />
              <SettingSegments
                label="Line style"
                onValueChange={(emaLineStyle) =>
                  updateSettings({ emaLineStyle })
                }
                options={LINE_OPTIONS}
                value={settings.emaLineStyle}
              />
              <HexColorSetting
                description="Base color used when gradient is disabled"
                label="Line color"
                onValueChange={(emaLineColor) =>
                  updateSettings({ emaLineColor })
                }
                value={settings.emaLineColor}
              />
              <SettingSwitch
                label="Vertical gradient"
                onValueChange={(emaGradientEnabled) =>
                  updateSettings({ emaGradientEnabled })
                }
                value={settings.emaGradientEnabled}
              />
              {settings.emaGradientEnabled ? (
                <>
                  <HexColorSetting
                    label="Gradient top"
                    onValueChange={(emaGradientTopColor) =>
                      updateSettings({ emaGradientTopColor })
                    }
                    value={settings.emaGradientTopColor}
                  />
                  <HexColorSetting
                    label="Gradient bottom"
                    onValueChange={(emaGradientBottomColor) =>
                      updateSettings({ emaGradientBottomColor })
                    }
                    value={settings.emaGradientBottomColor}
                  />
                </>
              ) : null}
            </>
          ) : null}
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
            description="Uses zero-count formatting for prices below 0.1"
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
          <SettingSwitch
            description="Calculated from all API candles loaded this session"
            label="All-time high & low"
            onValueChange={(allTimeExtremesVisible) =>
              updateSettings({ allTimeExtremesVisible })
            }
            value={settings.allTimeExtremesVisible}
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
              keyboardAppearance={theme.dark ? 'dark' : 'light'}
              placeholder="None"
              placeholderTextColor={theme.colors.inputPlaceholder}
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
    input: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      color: colors.text,
      fontSize: 13,
      minHeight: 36,
      minWidth: 76,
      paddingHorizontal: 10,
      textAlign: 'center',
    },
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
