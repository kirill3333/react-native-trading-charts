import { create } from 'zustand';

type ChartControlsState = {
  activeChartId: string | null;
  showMacd: boolean;
  showRsi: boolean;
  showVolume: boolean;
  isChartHalfHeight: boolean;
  fullChartHeight: number | null;
  activateChart: (chartId: string) => void;
  setFullChartHeight: (height: number) => void;
  toggleMacd: () => void;
  toggleRsi: () => void;
  toggleVolume: () => void;
  toggleChartHeight: () => void;
};

const INITIAL_CONTROLS = {
  activeChartId: null,
  showMacd: false,
  showRsi: true,
  showVolume: true,
  isChartHalfHeight: false,
  fullChartHeight: null,
} as const;

export const useChartControlsStore = create<ChartControlsState>((set) => ({
  ...INITIAL_CONTROLS,
  activateChart: (activeChartId) => set({ ...INITIAL_CONTROLS, activeChartId }),
  setFullChartHeight: (fullChartHeight) =>
    set((state) =>
      state.fullChartHeight === fullChartHeight ? state : { fullChartHeight }
    ),
  toggleMacd: () => set((state) => ({ showMacd: !state.showMacd })),
  toggleRsi: () => set((state) => ({ showRsi: !state.showRsi })),
  toggleVolume: () => set((state) => ({ showVolume: !state.showVolume })),
  toggleChartHeight: () =>
    set((state) =>
      state.fullChartHeight == null
        ? state
        : { isChartHalfHeight: !state.isChartHalfHeight }
    ),
}));
