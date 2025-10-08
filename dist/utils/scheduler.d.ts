export interface SchedulerOptions {
    onOverrun?: "skip" | "wait" | "parallel";
    jitterMs?: number;
    timeoutMs?: number;
    maxRetries?: number;
}
export interface ScheduledTask {
    stop: () => void;
    isRunning: () => boolean;
    lastRun: () => Date | null;
    nextRun: () => Date | null;
}
export declare function every(label: string, intervalMs: number, task: () => Promise<void>, options?: SchedulerOptions): ScheduledTask;
//# sourceMappingURL=scheduler.d.ts.map