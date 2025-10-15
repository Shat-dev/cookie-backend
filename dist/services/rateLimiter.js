"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.beforeCall = beforeCall;
exports.afterCall = afterCall;
exports.record429 = record429;
exports.spacingMs = spacingMs;
exports.getXStatus = getXStatus;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
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
const clone = (obj) => typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
const state = clone(defaults);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
async function beforeCall(key) {
    const s = state[key];
    if (s.reserve >= s.cap)
        s.reserve = Math.max(0, s.cap - 1);
    if (s.resetAtMs && now() >= s.resetAtMs) {
        s.remaining = s.cap;
        s.resetAtMs = 0;
    }
    if (s.resetAtMs && now() - s.resetAtMs > WINDOW_MS * 2) {
        s.resetAtMs = 0;
        s.remaining = s.cap;
    }
    if (s.remaining <= s.reserve && s.resetAtMs) {
        const wait = Math.max(0, s.resetAtMs - now() + 2000);
        if (wait > 0) {
            console.log(`[Limiter] Waiting ${Math.round(wait / 1000)}s for reset (${key})`);
            await sleep(wait);
            s.remaining = s.cap;
            s.resetAtMs = 0;
        }
    }
}
function afterCall(key, headers) {
    const s = state[key];
    const rem = Number(headers?.["x-rate-limit-remaining"]);
    const reset = Number(headers?.["x-rate-limit-reset"]);
    if (!Number.isNaN(rem)) {
        s.remaining = Math.max(0, Math.min(s.cap, rem));
    }
    else {
        s.remaining = Math.max(0, Math.min(s.cap, s.remaining - 1));
    }
    if (!Number.isNaN(reset)) {
        s.resetAtMs = reset * 1000;
    }
}
function record429(key, headers) {
    const s = state[key];
    const reset = Number(headers?.["x-rate-limit-reset"]);
    if (!Number.isNaN(reset)) {
        s.resetAtMs = reset * 1000;
    }
    else {
        s.resetAtMs = now() + 60000;
    }
    s.remaining = Math.min(Math.max(0, s.reserve), s.cap);
}
function spacingMs(key, targetCallsPerWindow) {
    const s = state[key];
    const usable = Math.max(1, Math.min(s.cap - s.reserve, targetCallsPerWindow));
    return Math.ceil(WINDOW_MS / usable);
}
function getXStatus() {
    return {
        mentions: { ...state.mentions },
        lookup: { ...state.lookup },
        windowMs: WINDOW_MS,
    };
}
//# sourceMappingURL=rateLimiter.js.map