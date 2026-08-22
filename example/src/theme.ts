import { type Theme as NavigationTheme } from '@react-navigation/native';
import { Platform, type StatusBarStyle } from 'react-native';
import { type ChartAppearance } from 'react-native-trading-charts';

export type AppThemeMode = 'dark' | 'light';

export type AppThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  control: string;
  pressed: string;
  border: string;
  borderSubtle: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  onAccent: string;
  positive: string;
  positiveText: string;
  negative: string;
  iconMuted: string;
  inputPlaceholder: string;
  errorSurface: string;
  errorBorder: string;
  errorText: string;
  liveSurface: string;
  liveText: string;
  connectionSurface: string;
  switchTrackOff: string;
  switchThumb: string;
};

export type AppTheme = {
  mode: AppThemeMode;
  dark: boolean;
  colors: AppThemeColors;
  chartAppearance: ChartAppearance;
  volumeUpColor: string;
  volumeDownColor: string;
  rsiColor: string;
  rsiTextColor: string;
  rsiLevelLineColor: string;
  rsiBandColor: string;
  navigationTheme: NavigationTheme;
  statusBarStyle: StatusBarStyle;
};

const DARK_COLORS: AppThemeColors = {
  background: '#100C18',
  surface: '#1B1723',
  surfaceMuted: '#1A1522',
  control: '#211B2B',
  pressed: '#1A1522',
  border: '#393242',
  borderSubtle: '#292431',
  text: '#F6F3FA',
  textSecondary: '#8F899B',
  textMuted: '#777181',
  accent: '#7562F4',
  accentText: '#C2B9FF',
  onAccent: '#FFFFFF',
  positive: '#38D98A',
  positiveText: '#75E8AD',
  negative: '#FF5C7C',
  iconMuted: '#7D7689',
  inputPlaceholder: '#6F6979',
  errorSurface: '#2A1721',
  errorBorder: '#4A2634',
  errorText: '#E9A8B8',
  liveSurface: 'rgba(20, 40, 33, 0.9)',
  liveText: '#75E8AD',
  connectionSurface: 'rgba(27, 23, 35, 0.94)',
  switchTrackOff: '#393242',
  switchThumb: '#FFFFFF',
};

const LIGHT_COLORS: AppThemeColors = {
  background: '#FFFFFF',
  surface: '#F7F8FA',
  surfaceMuted: '#F0F3FA',
  control: '#F0F3FA',
  pressed: '#E8ECF3',
  border: '#E0E3EB',
  borderSubtle: '#ECEFF3',
  text: '#131722',
  textSecondary: '#787B86',
  textMuted: '#A3A6AF',
  accent: '#2962FF',
  accentText: '#2962FF',
  onAccent: '#FFFFFF',
  positive: '#089981',
  positiveText: '#067A67',
  negative: '#F23645',
  iconMuted: '#787B86',
  inputPlaceholder: '#A3A6AF',
  errorSurface: '#FFF0F2',
  errorBorder: '#F5B7BF',
  errorText: '#B42332',
  liveSurface: 'rgba(8, 153, 129, 0.12)',
  liveText: '#067A67',
  connectionSurface: 'rgba(255, 255, 255, 0.96)',
  switchTrackOff: '#B2B5BE',
  switchThumb: '#FFFFFF',
};

const DARK_CHART_APPEARANCE: ChartAppearance = {
  backgroundColor: '#100C18',
  grid: { color: '#292431', opacity: 0.65 },
  candles: { upColor: '#38D98A', downColor: '#FF3B64' },
  bars: { upColor: '#38D98A', downColor: '#FF3B64', lineWidth: 1 },
  line: {
    width: 1.5,
    color: '#2E90F5',
    gradient: { topColor: '#C51BFF', bottomColor: '#2E90F5' },
  },
  area: {
    width: 1.5,
    color: '#2E90F5',
    fill: { topColor: '#2E90F566', bottomColor: '#2E90F500' },
  },
  xAxis: { text: { color: '#9791A5', fontSize: 10.5 } },
  yAxis: { text: { color: '#9791A5', fontSize: 10.5 } },
  priceExtremes: {
    text: { color: '#B8B1C4', fontSize: 10.5 },
    connectorColor: '#777181',
    backgroundColor: '#100C18',
  },
  currentPrice: {
    line: { upColor: '#38D98A', downColor: '#FF3B64' },
    label: {
      upBackgroundColor: '#38D98A',
      downBackgroundColor: '#FF3B64',
      text: { color: '#100C18', fontWeight: 'semibold' },
    },
  },
  crosshair: {
    line: { color: '#A8A2B3', opacity: 0.85 },
    priceLabel: {
      backgroundColor: '#A8A2B3',
      text: { color: '#100C18', fontWeight: 'semibold' },
    },
    timeLabel: {
      backgroundColor: '#A8A2B3',
      text: { color: '#100C18', fontWeight: 'semibold' },
    },
  },
  tooltip: {
    backgroundColor: '#1B1723',
    headerText: { color: '#FFFFFF', fontWeight: 'semibold' },
    labelText: { color: '#9791A5' },
    valueText: { color: '#F5F2FA' },
    positiveValueColor: '#38D98A',
    negativeValueColor: '#FF3B64',
  },
};

const LIGHT_CHART_APPEARANCE: ChartAppearance = {
  backgroundColor: '#FFFFFF',
  grid: { color: '#E0E3EB', opacity: 0.75 },
  candles: { upColor: '#089981', downColor: '#F23645' },
  bars: { upColor: '#089981', downColor: '#F23645', lineWidth: 1 },
  line: { width: 1.5, color: '#2962FF' },
  area: {
    width: 1.5,
    color: '#2962FF',
    fill: { topColor: '#2962FF33', bottomColor: '#2962FF00' },
  },
  xAxis: { text: { color: '#2A2E39', fontSize: 10.5 } },
  yAxis: { text: { color: '#2A2E39', fontSize: 10.5 } },
  priceExtremes: {
    text: { color: '#2A2E39', fontSize: 10.5 },
    connectorColor: '#787B86',
    backgroundColor: '#FFFFFF',
  },
  currentPrice: {
    line: { upColor: '#089981', downColor: '#F23645' },
    label: {
      upBackgroundColor: '#089981',
      downBackgroundColor: '#F23645',
      text: { color: '#FFFFFF', fontWeight: 'semibold' },
    },
  },
  crosshair: {
    line: { color: '#787B86', opacity: 0.85 },
    priceLabel: {
      backgroundColor: '#2A2E39',
      text: { color: '#FFFFFF', fontWeight: 'semibold' },
    },
    timeLabel: {
      backgroundColor: '#2A2E39',
      text: { color: '#FFFFFF', fontWeight: 'semibold' },
    },
  },
  tooltip: {
    backgroundColor: '#FFFFFF',
    headerText: { color: '#131722', fontWeight: 'semibold' },
    labelText: { color: '#787B86' },
    valueText: { color: '#131722' },
    positiveValueColor: '#089981',
    negativeValueColor: '#F23645',
    border: { color: '#E0E3EB', width: 1, radius: 8 },
  },
};

function navigationTheme(
  dark: boolean,
  colors: AppThemeColors
): NavigationTheme {
  return {
    dark,
    colors: {
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.negative,
    },
    fonts: NAVIGATION_FONTS,
  };
}

const NAVIGATION_FONTS = Platform.select({
  ios: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '600' },
    heavy: { fontFamily: 'System', fontWeight: '700' },
  },
  default: {
    regular: { fontFamily: 'sans-serif', fontWeight: 'normal' },
    medium: { fontFamily: 'sans-serif-medium', fontWeight: 'normal' },
    bold: { fontFamily: 'sans-serif', fontWeight: '600' },
    heavy: { fontFamily: 'sans-serif', fontWeight: '700' },
  },
}) satisfies NavigationTheme['fonts'];

export const APP_THEMES = {
  dark: Object.freeze({
    mode: 'dark',
    dark: true,
    colors: DARK_COLORS,
    chartAppearance: DARK_CHART_APPEARANCE,
    volumeUpColor: '#38D98A80',
    volumeDownColor: '#FF3B6480',
    rsiColor: '#8C7CFF',
    rsiTextColor: '#8C7CFF',
    rsiLevelLineColor: '#8C7CFF80',
    rsiBandColor: '#8C7CFF14',
    navigationTheme: navigationTheme(true, DARK_COLORS),
    statusBarStyle: 'light-content',
  }),
  light: Object.freeze({
    mode: 'light',
    dark: false,
    colors: LIGHT_COLORS,
    chartAppearance: LIGHT_CHART_APPEARANCE,
    volumeUpColor: '#08998166',
    volumeDownColor: '#F2364566',
    rsiColor: '#2962FF',
    rsiTextColor: '#2962FF',
    rsiLevelLineColor: '#2962FF80',
    rsiBandColor: '#2962FF14',
    navigationTheme: navigationTheme(false, LIGHT_COLORS),
    statusBarStyle: 'dark-content',
  }),
} satisfies Readonly<Record<AppThemeMode, AppTheme>>;
