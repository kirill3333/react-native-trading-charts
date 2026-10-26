import { APP_THEMES, type AppThemeColors } from './theme';

export function createThemedStyles<T>(factory: (colors: AppThemeColors) => T) {
  return {
    dark: factory(APP_THEMES.dark.colors),
    light: factory(APP_THEMES.light.colors),
  };
}
