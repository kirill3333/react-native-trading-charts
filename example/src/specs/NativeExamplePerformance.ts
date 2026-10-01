import { type CodegenTypes, type TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type AppThread = {
  id: string;
  name: string;
  isMainThread: boolean;
  isJSThread: boolean;
};

export type ThreadCPU = {
  id: string;
  name: string;
  isMainThread: boolean;
  isJSThread: boolean;
  cpuPercent: number | null;
};

export type PerformanceSample = {
  subscriptionId: string;
  sequence: number;
  timestamp: number;
  intervalMs: number;
  threads: ThreadCPU[];
  missingThreadNames: string[];
  chartId: string;
  presentedFrames: number | null;
  metalFPS: number | null;
  uiFPS: number | null;
  glFPS: number | null;
  renderedFrames: number | null;
  glThread: ThreadCPU | null;
};

export interface Spec extends TurboModule {
  getThreads(): Promise<AppThread[]>;
  start(
    subscriptionId: string,
    chartId: string,
    threadNames: string[],
    includeMainThread: boolean,
    intervalMs: number
  ): void;
  stop(subscriptionId: string): void;
  acknowledge(subscriptionId: string, sequence: number): void;
  readonly onSample: CodegenTypes.EventEmitter<PerformanceSample>;
}

export default TurboModuleRegistry.get<Spec>('ExamplePerformance');
