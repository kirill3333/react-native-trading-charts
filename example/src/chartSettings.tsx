import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

import {
  DEFAULT_CHART_SETTINGS,
  chartSettingsReducer,
  type ChartSettings,
} from './chartSettingsState';
import { AppThemeProvider } from './themeContext';

type ChartSettingsContextValue = {
  settings: ChartSettings;
  updateSettings: (patch: Partial<ChartSettings>) => void;
  resetSettings: () => void;
};

const ChartSettingsContext = createContext<ChartSettingsContextValue | null>(
  null
);

type ChartSettingsProviderProps = {
  children: ReactNode;
};

export function ChartSettingsProvider({
  children,
}: ChartSettingsProviderProps) {
  const [settings, dispatch] = useReducer(
    chartSettingsReducer,
    DEFAULT_CHART_SETTINGS
  );
  const updateSettings = useCallback((patch: Partial<ChartSettings>) => {
    dispatch({ type: 'update', patch });
  }, []);
  const resetSettings = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);
  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings }),
    [resetSettings, settings, updateSettings]
  );

  return (
    <ChartSettingsContext.Provider value={value}>
      <AppThemeProvider mode={settings.themeMode}>{children}</AppThemeProvider>
    </ChartSettingsContext.Provider>
  );
}

export function useChartSettings(): ChartSettingsContextValue {
  const value = useContext(ChartSettingsContext);
  if (!value) {
    throw new Error(
      'useChartSettings must be used inside ChartSettingsProvider'
    );
  }
  return value;
}
