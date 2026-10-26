import { APP_THEMES } from './theme';
import {
  type ChartSettings,
  type BollLineSettings,
} from './stores/chartSettingsStore';

export type LineSettings = BollLineSettings;
type SettingsKey<T> = {
  [K in keyof ChartSettings]: NonNullable<ChartSettings[K]> extends T
    ? K
    : never;
}[keyof ChartSettings];
type LineSettingsKeys = {
  [K in keyof LineSettings]: SettingsKey<LineSettings[K]>;
};

export const LINE_SETTINGS_KEYS = {
  sma: {
    width: 'smaLineWidth',
    style: 'smaLineStyle',
    color: 'smaLineColor',
    gradientEnabled: 'smaGradientEnabled',
    gradientTopColor: 'smaGradientTopColor',
    gradientBottomColor: 'smaGradientBottomColor',
  },
  ema: {
    width: 'emaLineWidth',
    style: 'emaLineStyle',
    color: 'emaLineColor',
    gradientEnabled: 'emaGradientEnabled',
    gradientTopColor: 'emaGradientTopColor',
    gradientBottomColor: 'emaGradientBottomColor',
  },
  macd: {
    width: 'macdLineWidth',
    style: 'macdLineStyle',
    color: 'macdLineColor',
    gradientEnabled: 'macdGradientEnabled',
    gradientTopColor: 'macdGradientTopColor',
    gradientBottomColor: 'macdGradientBottomColor',
  },
  signal: {
    width: 'macdSignalLineWidth',
    style: 'macdSignalLineStyle',
    color: 'macdSignalLineColor',
    gradientEnabled: 'macdSignalGradientEnabled',
    gradientTopColor: 'macdSignalGradientTopColor',
    gradientBottomColor: 'macdSignalGradientBottomColor',
  },
} as const satisfies Record<string, LineSettingsKeys>;
export type LineSettingsKind = keyof typeof LINE_SETTINGS_KEYS;

export function readLineSettings(
  settings: ChartSettings,
  kind: LineSettingsKind
): LineSettings {
  const theme = APP_THEMES[settings.themeMode].macd;
  const defaults =
    kind === 'signal'
      ? {
          color: theme.signalLineColor,
          gradientTopColor: theme.signalGradientTopColor,
          gradientBottomColor: theme.signalGradientBottomColor,
        }
      : {
          color: theme.lineColor,
          gradientTopColor: theme.gradientTopColor,
          gradientBottomColor: theme.gradientBottomColor,
        };
  const keys = LINE_SETTINGS_KEYS[kind];
  return {
    width: settings[keys.width],
    style: settings[keys.style],
    color: settings[keys.color] ?? defaults.color,
    gradientEnabled: settings[keys.gradientEnabled],
    gradientTopColor:
      settings[keys.gradientTopColor] ?? defaults.gradientTopColor,
    gradientBottomColor:
      settings[keys.gradientBottomColor] ?? defaults.gradientBottomColor,
  };
}

// Map only edited fields: resolved theme colors must never become overrides.
export function patchLineSettings(
  kind: LineSettingsKind,
  patch: Partial<LineSettings>
): Partial<ChartSettings> {
  const keys = LINE_SETTINGS_KEYS[kind];
  const fields = [
    'width',
    'style',
    'color',
    'gradientEnabled',
    'gradientTopColor',
    'gradientBottomColor',
  ] as const;
  return Object.fromEntries(
    fields
      .filter((field) => patch[field] !== undefined)
      .map((field) => [keys[field], patch[field]])
  );
}
