import { create } from 'zustand';

type ChartControlsState = {
  activeChartId: string | null;
  showMacd: boolean;
  showRsi: boolean;
  showVolume: boolean;
  activateChart: (chartId: string) => void;
  toggleMacd: () => void;
  toggleRsi: () => void;
  toggleVolume: () => void;
};

type ChartControlValues = Pick<
  ChartControlsState,
  'activeChartId' | 'showMacd' | 'showRsi' | 'showVolume'
>;

const INITIAL_CONTROLS = {
  activeChartId: null,
  showMacd: false,
  showRsi: true,
  showVolume: true,
} satisfies ChartControlValues;

export const useChartControlsStore = create<ChartControlsState>((set) => ({
  ...INITIAL_CONTROLS,
  activateChart: (activeChartId) => set({ ...INITIAL_CONTROLS, activeChartId }),
  toggleMacd: () => set((state) => ({ showMacd: !state.showMacd })),
  toggleRsi: () => set((state) => ({ showRsi: !state.showRsi })),
  toggleVolume: () => set((state) => ({ showVolume: !state.showVolume })),
}));
