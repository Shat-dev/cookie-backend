import { AxiosRequestConfig, AxiosResponse } from "axios";
export interface RetryConfig {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    timeoutMs?: number;
    retryOnStatus?: number[];
}
export declare class FetchWithRetry {
    private config;
    constructor(config?: RetryConfig);
    request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    private calculateDelay;
    private sleep;
    get<T = any>(url: string, config?: Omit<AxiosRequestConfig, "method" | "url">): Promise<AxiosResponse<T>>;
    post<T = any>(url: string, data?: any, config?: Omit<AxiosRequestConfig, "method" | "url" | "data">): Promise<AxiosResponse<T>>;
}
export declare const fetchWithRetry: FetchWithRetry;
//# sourceMappingURL=fetchWithRetry.d.ts.map