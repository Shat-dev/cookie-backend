import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  timeoutMs?: number;
  retryOnStatus?: number[];
}

/**
 * Safe HTTP client with timeouts, retries, and exponential backoff
 */
export class FetchWithRetry {
  private config: Required<RetryConfig>;

  constructor(config: RetryConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 2,
      baseDelay: config.baseDelay ?? 1000,
      maxDelay: config.maxDelay ?? 120000, // 2 minutes max
      timeoutMs: config.timeoutMs ?? 10000, // 10 seconds
      retryOnStatus: config.retryOnStatus ?? [429, 500, 502, 503, 504],
    };
  }

  /**
   * Make an HTTP request with retry logic
   */
  async request<T = any>(
    config: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await axios({
          ...config,
          timeout: this.config.timeoutMs,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });

        return response;
      } catch (error: any) {
        lastError = error;

        // Don't retry on client errors (4xx) except 429
        if (
          error.response?.status &&
          error.response.status >= 400 &&
          error.response.status < 500 &&
          error.response.status !== 429
        ) {
          throw error;
        }

        // Don't retry on timeout or abort
        if (error.code === "ECONNABORTED" || error.name === "AbortError") {
          throw error;
        }

        // Check if we should retry based on status code
        if (
          error.response?.status &&
          !this.config.retryOnStatus.includes(error.response.status)
        ) {
          throw error;
        }

        // If this was the last attempt, throw the error
        if (attempt === this.config.maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);

        console.log(
          `[FetchWithRetry] Attempt ${
            attempt + 1
          } failed, retrying in ${delay}ms:`,
          error.response?.status || error.message
        );

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    const delay = Math.min(exponentialDelay + jitter, this.config.maxDelay);

    return Math.floor(delay);
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Convenience method for GET requests
   */
  async get<T = any>(
    url: string,
    config?: Omit<AxiosRequestConfig, "method" | "url">
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: "GET", url });
  }

  /**
   * Convenience method for POST requests
   */
  async post<T = any>(
    url: string,
    data?: any,
    config?: Omit<AxiosRequestConfig, "method" | "url" | "data">
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: "POST", url, data });
  }
}

// Export default instance with sensible defaults
export const fetchWithRetry = new FetchWithRetry();
