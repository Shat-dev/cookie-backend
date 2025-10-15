import dotenv from "dotenv";
dotenv.config();

/* Simple, header-aware limiter with per-endpoint reserves */
type Key = "mentions" | "lookup";

type State = {
  cap: number; // plan cap per window
  reserve: number; // calls to keep in the tank
  remaining: number; // from headers
  resetAtMs: number; // unix ms when window resets
};

const WINDOW_MS = 15 * 60_000; // 15 min

const defaults: Record<Key, State> = {
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

const state: Record<Key, State> = structuredClone(defaults) as any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

export async function beforeCall(key: Key) {
  const s = state[key];
  // window reset
  if (s.resetAtMs && now() >= s.resetAtMs) {
    s.remaining = s.cap;
    s.resetAtMs = 0;
  }
  // respect reserve if we know reset time
  if (s.remaining <= s.reserve && s.resetAtMs) {
    const wait = Math.max(0, s.resetAtMs - now() + 2000); // +2s cushion
    if (wait > 0) await sleep(wait);
  }
  // 🔧 FIXED: Remove optimistic decrement - only update based on actual API headers
  // This prevents state corruption when calls fail before afterCall() is executed
}

export function afterCall(key: Key, headers: any) {
  const s = state[key];
  const rem = Number(headers?.["x-rate-limit-remaining"]);
  const reset = Number(headers?.["x-rate-limit-reset"]); // unix seconds

  // 🔧 FIXED: Always use Twitter's authoritative remaining count when available
  if (!Number.isNaN(rem)) {
    s.remaining = rem;
  } else {
    // Fallback: decrement only if we don't have authoritative data
    s.remaining = Math.max(0, s.remaining - 1);
  }

  if (!Number.isNaN(reset)) s.resetAtMs = reset * 1000;
}

export function record429(key: Key, headers: any) {
  const s = state[key];
  const reset = Number(headers?.["x-rate-limit-reset"]);
  if (!Number.isNaN(reset)) s.resetAtMs = reset * 1000;
  s.remaining = Math.min(s.remaining, s.reserve);
}

/** Minimal safe spacing targeting N calls in 15min */
export function spacingMs(key: Key, targetCallsPerWindow: number) {
  const s = state[key];
  const usable = Math.max(1, Math.min(s.cap - s.reserve, targetCallsPerWindow));
  return Math.ceil(WINDOW_MS / usable);
}

export function getXStatus() {
  return {
    mentions: { ...state.mentions },
    lookup: { ...state.lookup },
    windowMs: WINDOW_MS,
  };
}
