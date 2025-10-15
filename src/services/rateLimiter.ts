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

// Safe structured clone fallback for older Node
const clone = <T>(obj: T): T =>
  typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));

const state: Record<Key, State> = clone(defaults);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

/** Before making an API call */
export async function beforeCall(key: Key) {
  const s = state[key];

  // Sanity: reserve cannot exceed cap
  if (s.reserve >= s.cap) s.reserve = Math.max(0, s.cap - 1);

  // Reset window if expired or stale
  if (s.resetAtMs && now() >= s.resetAtMs) {
    s.remaining = s.cap;
    s.resetAtMs = 0;
  }

  // Safety: handle time drift or stale data (if too old, reset)
  if (s.resetAtMs && now() - s.resetAtMs > WINDOW_MS * 2) {
    s.resetAtMs = 0;
    s.remaining = s.cap;
  }

  // Respect reserve if reset time is known
  if (s.remaining <= s.reserve && s.resetAtMs) {
    const wait = Math.max(0, s.resetAtMs - now() + 2000); // +2s cushion
    if (wait > 0) {
      console.log(
        `[Limiter] Waiting ${Math.round(wait / 1000)}s for reset (${key})`
      );
      await sleep(wait);
      s.remaining = s.cap; // refresh after wait
      s.resetAtMs = 0;
    }
  }

  // No optimistic decrement; real update happens in afterCall()
}

/** After receiving a response */
export function afterCall(key: Key, headers: any) {
  const s = state[key];
  const rem = Number(headers?.["x-rate-limit-remaining"]);
  const reset = Number(headers?.["x-rate-limit-reset"]); // unix seconds

  // Use authoritative remaining count when available
  if (!Number.isNaN(rem)) {
    s.remaining = Math.max(0, Math.min(s.cap, rem));
  } else {
    // Fallback: decrement by one
    s.remaining = Math.max(0, Math.min(s.cap, s.remaining - 1));
  }

  // Apply reset time (convert seconds → ms)
  if (!Number.isNaN(reset)) {
    s.resetAtMs = reset * 1000;
  }
}

/** Handle rate-limit (HTTP 429) response */
export function record429(key: Key, headers: any) {
  const s = state[key];
  const reset = Number(headers?.["x-rate-limit-reset"]);

  if (!Number.isNaN(reset)) {
    s.resetAtMs = reset * 1000;
  } else {
    // Fallback: wait 60s if header missing
    s.resetAtMs = now() + 60_000;
  }

  // Clamp remaining and ensure reserve safety
  s.remaining = Math.min(Math.max(0, s.reserve), s.cap);
}

/** Compute minimal safe spacing targeting N calls per 15min window */
export function spacingMs(key: Key, targetCallsPerWindow: number) {
  const s = state[key];
  const usable = Math.max(1, Math.min(s.cap - s.reserve, targetCallsPerWindow));
  return Math.ceil(WINDOW_MS / usable);
}

/** View limiter status for diagnostics */
export function getXStatus() {
  return {
    mentions: { ...state.mentions },
    lookup: { ...state.lookup },
    windowMs: WINDOW_MS,
  };
}
