export interface SchedulerHeartbeat {
    service: string;
    last_run: Date;
    last_run_duration_ms: number | null;
    total_runs: number;
    total_errors: number;
    created_at: Date;
    updated_at: Date;
}
export interface SchedulerHealth {
    service: string;
    last_run: Date;
    age_seconds: number;
    last_run_duration_ms: number | null;
    total_runs: number;
    total_errors: number;
    status: "HEALTHY" | "WARNING" | "STALLED";
}
export declare class SchedulerRepository {
    updateHeartbeat(service: string, durationMs?: number): Promise<void>;
    recordError(service: string): Promise<void>;
    getHealthStatus(): Promise<SchedulerHealth[]>;
    getServiceHealth(service: string): Promise<SchedulerHealth | null>;
    isServiceStalled(service: string, expectedIntervalMs: number): Promise<boolean>;
    getStalledServices(expectedIntervals: Record<string, number>): Promise<string[]>;
    cleanupOldRecords(): Promise<number>;
}
export declare const schedulerRepository: SchedulerRepository;
//# sourceMappingURL=schedulerRepository.d.ts.map