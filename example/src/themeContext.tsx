import { createContext, useContext, type ReactNode } from 'react';

import { APP_THEMES, type AppTheme, type AppThemeMode } from './theme';

const AppThemeContext = createContext<AppTheme | null>(null);

type AppThemeProviderProps = {
  children: ReactNode;
  mode: AppThemeMode;
};

export function AppThemeProvider({ children, mode }: AppThemeProviderProps) {
  return (
    <AppThemeContext.Provider value={APP_THEMES[mode]}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppTheme {
  const value = useContext(AppThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }
  return value;
}
