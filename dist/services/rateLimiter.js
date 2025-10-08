"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.beforeCall = beforeCall;
exports.afterCall = afterCall;
exports.record429 = record429;
exports.spacingMs = spacingMs;
const WINDOW_MS = 15 * 60000;
const defaults = {
    mentions: {
        cap: 10,
        reserve: Number(process.env.TW_RESERVE_MENTIONS ?? 1),
        remaining: 10,
        resetAtMs: 0,
    },
    lookup: {
        cap: 15,
        reserve: Number(process.env.TW_RESERVE_LOOKUP ?? 3),
        remaining: 15,
        resetAtMs: 0,
    },
};
const state = structuredClone(defaults);
function now() {
    return Date.now();
}
async function beforeCall(key) {
    const s = state[key];
    if (s.resetAtMs && now() >= s.resetAtMs) {
        s.remaining = s.cap;
        s.resetAtMs = 0;
    }
    if (s.remaining <= s.reserve && s.resetAtMs) {
        const wait = Math.max(0, s.resetAtMs - now() + 2000);
        if (wait > 0)
            await new Promise((r) => setTimeout(r, wait));
    }
    s.remaining = Math.max(0, s.remaining - 1);
}
function afterCall(key, headers) {
    const s = state[key];
    const rem = Number(headers?.["x-rate-limit-remaining"]);
    const reset = Number(headers?.["x-rate-limit-reset"]);
    if (!Number.isNaN(rem))
        s.remaining = rem;
    if (!Number.isNaN(reset))
        s.resetAtMs = reset * 1000;
}
function record429(key, headers) {
    const s = state[key];
    const reset = Number(headers?.["x-rate-limit-reset"]);
    if (!Number.isNaN(reset))
        s.resetAtMs = reset * 1000;
    s.remaining = Math.min(s.remaining, s.reserve);
}
function spacingMs(key, targetCallsPerWindow) {
    const s = state[key];
    const usable = Math.max(1, Math.min(s.cap - s.reserve, targetCallsPerWindow));
    return Math.ceil(WINDOW_MS / usable);
}
//# sourceMappingURL=rateLimiter.js.map