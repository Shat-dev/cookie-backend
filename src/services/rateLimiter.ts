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

function now() {
  return Date.now();
}

export async function beforeCall(key: Key) {
  const s = state[key];
  // if window passed, reset optimistic counters
  if (s.resetAtMs && now() >= s.resetAtMs) {
    s.remaining = s.cap;
    s.resetAtMs = 0;
  }
  // if we’re below reserve, wait until reset (best-effort)
  if (s.remaining <= s.reserve && s.resetAtMs) {
    const wait = Math.max(0, s.resetAtMs - now() + 2000); // +2s cushion
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  // optimistic decrement; corrected in afterCall()
  s.remaining = Math.max(0, s.remaining - 1);
}

export function afterCall(key: Key, headers: any) {
  const s = state[key];
  const rem = Number(headers?.["x-rate-limit-remaining"]);
  const reset = Number(headers?.["x-rate-limit-reset"]); // unix seconds
  if (!Number.isNaN(rem)) s.remaining = rem;
  if (!Number.isNaN(reset)) s.resetAtMs = reset * 1000;
}

export function record429(key: Key, headers: any) {
  const s = state[key];
  const reset = Number(headers?.["x-rate-limit-reset"]);
  if (!Number.isNaN(reset)) s.resetAtMs = reset * 1000;
  // force below reserve so callers will wait for reset
  s.remaining = Math.min(s.remaining, s.reserve);
}

/** Helpful for scheduling: minimal safe spacing targeting N calls in 15min */
export function spacingMs(key: Key, targetCallsPerWindow: number) {
  const s = state[key];
  const usable = Math.max(1, Math.min(s.cap - s.reserve, targetCallsPerWindow));
  return Math.ceil(WINDOW_MS / usable);
}
