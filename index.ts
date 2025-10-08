// backend/index.ts
import "dotenv/config";

// Boot the API + background jobs (poller, validator, orchestrator)
import "./src/server";

// (Optional) If you want a clear log that this entrypoint is used:
if (process.env.NODE_ENV !== "production") {
  console.log("🟢 Bootstrapped via backend/index.ts -> src/server.ts");
}
