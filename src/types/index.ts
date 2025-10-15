// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** DB row (new schema): one row per (tweet_id, token_id). */
export interface EntryToken {
  id: number;
  tweet_id: string;
  wallet_address: string; // 0x...
  token_id: string; // single token per row
  image_url: string | null; // optional per-token image
  verified: boolean | null; // optional validation flag
  tweet_url: string;
  created_at: string; // ISO string
  // Push tracking fields
  pushed_round?: number | null;
  pushed_tx?: string | null;
  pushed_at?: string | null;
}

/** Winners with payout tracking */
export interface Winner {
  id: number;
  draw_number: number;
  winner_address: string;
  prize_amount: string;
  token_id: string;
  image_url: string;
  payout_amount?: string;
  payout_status?: "pending" | "success" | "failed";
  payout_failure_reason?: string;
  created_at: Date;
}

/** POST bodies (used by controller) */
export interface SubmitEntryRequest {
  tokenId: string; // simple manual test endpoint
}

export interface VerifyEntryRequest {
  tweetUrl: string;
  walletAddress: string;
  tokenId: string;
}

/** Batch upsert payload (poller/admin) */
export interface UpsertEntriesPayload {
  tweet_id: string;
  wallet_address: string;
  token_ids: string[];
  tweet_url: string;
}
