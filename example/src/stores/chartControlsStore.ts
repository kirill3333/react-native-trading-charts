import { create } from 'zustand';

type ChartControlsState = {
  activeChartId: string | null;
  showWilliamsR: boolean;
  showKdj: boolean;
  showMacd: boolean;
  showRsi: boolean;
  showVolume: boolean;
  showPerformance: boolean;
  activateChart: (
    chartId: string,
    options?: { showPerformance?: boolean }
  ) => void;
  toggleWilliamsR: () => void;
  toggleKdj: () => void;
  toggleMacd: () => void;
  toggleRsi: () => void;
  toggleVolume: () => void;
  togglePerformance: () => void;
};

type ChartControlValues = Pick<
  ChartControlsState,
  | 'activeChartId'
  | 'showWilliamsR'
  | 'showKdj'
  | 'showMacd'
  | 'showRsi'
  | 'showVolume'
  | 'showPerformance'
>;

const INITIAL_CONTROLS = {
  activeChartId: null,
  showWilliamsR: false,
  showKdj: false,
  showMacd: false,
  showRsi: true,
  showVolume: true,
  showPerformance: false,
} satisfies ChartControlValues;

export const useChartControlsStore = create<ChartControlsState>((set) => ({
  ...INITIAL_CONTROLS,
  activateChart: (activeChartId, options) =>
    set({
      ...INITIAL_CONTROLS,
      activeChartId,
      showPerformance: options?.showPerformance ?? false,
    }),
  toggleWilliamsR: () =>
    set((state) => ({ showWilliamsR: !state.showWilliamsR })),
  toggleKdj: () => set((state) => ({ showKdj: !state.showKdj })),
  toggleMacd: () => set((state) => ({ showMacd: !state.showMacd })),
  toggleRsi: () => set((state) => ({ showRsi: !state.showRsi })),
  toggleVolume: () => set((state) => ({ showVolume: !state.showVolume })),
  togglePerformance: () =>
    set((state) => ({ showPerformance: !state.showPerformance })),
}));
