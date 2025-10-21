interface ExecutionResult {
    function: string;
    success: boolean;
    duration: number;
    error?: string;
}
interface XApiExecutionResult {
    success: boolean;
    totalDuration: number;
    functionsExecuted: number;
    successCount: number;
    failureCount: number;
    results: ExecutionResult[];
    message: string;
    error?: string;
}
export declare function executeXApiCalls(adminIp?: string, userAgent?: string): Promise<XApiExecutionResult>;
export {};
//# sourceMappingURL=xApiService.d.ts.map