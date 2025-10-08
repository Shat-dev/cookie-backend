"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithRetry = exports.FetchWithRetry = void 0;
const axios_1 = __importDefault(require("axios"));
class FetchWithRetry {
    constructor(config = {}) {
        this.config = {
            maxRetries: config.maxRetries ?? 2,
            baseDelay: config.baseDelay ?? 1000,
            maxDelay: config.maxDelay ?? 120000,
            timeoutMs: config.timeoutMs ?? 10000,
            retryOnStatus: config.retryOnStatus ?? [429, 500, 502, 503, 504],
        };
    }
    async request(config) {
        let lastError;
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                const response = await (0, axios_1.default)({
                    ...config,
                    timeout: this.config.timeoutMs,
                    signal: AbortSignal.timeout(this.config.timeoutMs),
                });
                return response;
            }
            catch (error) {
                lastError = error;
                if (error.response?.status &&
                    error.response.status >= 400 &&
                    error.response.status < 500 &&
                    error.response.status !== 429) {
                    throw error;
                }
                if (error.code === "ECONNABORTED" || error.name === "AbortError") {
                    throw error;
                }
                if (error.response?.status &&
                    !this.config.retryOnStatus.includes(error.response.status)) {
                    throw error;
                }
                if (attempt === this.config.maxRetries) {
                    throw error;
                }
                const delay = this.calculateDelay(attempt);
                console.log(`[FetchWithRetry] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.response?.status || error.message);
                await this.sleep(delay);
            }
        }
        throw lastError;
    }
    calculateDelay(attempt) {
        const exponentialDelay = this.config.baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 0.1 * exponentialDelay;
        const delay = Math.min(exponentialDelay + jitter, this.config.maxDelay);
        return Math.floor(delay);
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async get(url, config) {
        return this.request({ ...config, method: "GET", url });
    }
    async post(url, data, config) {
        return this.request({ ...config, method: "POST", url, data });
    }
}
exports.FetchWithRetry = FetchWithRetry;
exports.fetchWithRetry = new FetchWithRetry();
//# sourceMappingURL=fetchWithRetry.js.map