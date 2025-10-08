# Scheduler Fixes - Changes Summary

## Files Created

### 1. `src/utils/scheduler.ts`

- Safe scheduler wrapper replacing `setInterval`
- Prevents overlapping runs with configurable strategies
- Adds jitter, timeouts, and retry logic
- Non-blocking error handling

### 2. `src/utils/xLimiter.ts`

- Token bucket rate limiter for Twitter API
- Non-blocking: schedules calls for later instead of waiting
- Separate buckets for mentions (10/15min) and tweet lookup (15/15min)
- Prevents event loop blocking on rate limits

### 3. `src/utils/fetchWithRetry.ts`

- Safe HTTP client with timeouts and exponential backoff
- Configurable retry logic for 429/5xx errors
- AbortController integration for hard timeouts

### 4. `src/db/scheduler-heartbeats.sql`

- Database schema for monitoring scheduler health
- Tracks last run time, duration, and error counts
- Automatic stall detection (2x expected interval)
- PostgreSQL functions for easy updates

### 5. `src/db/schedulerRepository.ts`

- TypeScript interface for scheduler monitoring
- Methods for updating heartbeats and recording errors
- Health status queries and stall detection

### 6. `src/routes/healthRoutes.ts`

- New health endpoints: `/health/cron` and `/health/cron/:service`
- Real-time monitoring of all background services
- X API rate limit status

### 7. `src/scripts/setup-scheduler-monitoring.ts`

- Database setup script for scheduler monitoring
- Creates tables, functions, and indexes
- Verification and testing

### 8. `SCHEDULER_FIXES.md`

- Comprehensive documentation of fixes and new system
- Setup instructions and troubleshooting guide
- Architecture overview and API budget analysis

## Files Modified

### 1. `src/services/twitterPoller.ts`

- Added heartbeat tracking with `schedulerRepository`
- Records run duration and errors
- Maintains existing functionality

### 2. `src/services/validateEntries.ts`

- Added heartbeat tracking
- Wrapped in try-catch with error recording
- Maintains existing functionality

### 3. `src/services/fastDeleteSweep.ts`

- Added heartbeat tracking
- Wrapped in try-catch with error recording
- Maintains existing functionality

### 4. `src/services/twitterService.ts`

- Replaced old rate limiter with new `xLimiter`
- Uses `fetchWithRetry` for safe HTTP calls
- Reduced batch sizes from 100 to 50 for better rate limit compliance

### 5. `src/server.ts`

- Replaced `setInterval` with new safe scheduler
- Adjusted service intervals for API budget compatibility
- Added health routes
- Updated console logging

### 6. `package.json`

- Added `setup:scheduler-monitoring` script

## Key Changes Made

### 1. **Eliminated Event Loop Blocking**

- Old: `await new Promise((r) => setTimeout(r, wait))` blocked everything
- New: Token bucket schedules calls for later without blocking

### 2. **Prevented Overlapping Runs**

- Old: Simple boolean flags with race conditions
- New: Safe scheduler with overlap prevention strategies

### 3. **Added Timeout Protection**

- Old: External calls could hang indefinitely
- New: Configurable timeouts via AbortController

### 4. **Fixed API Budget Conflicts**

- Old: `validateEntries` (60s) + `fastDeleteSweep` (90s) = 25 req/15min
- New: Both at 180s = 10 req/15min (within 15 req/15min limit)

### 5. **Added Comprehensive Monitoring**

- Database heartbeats for all services
- Health endpoints for real-time status
- Automatic stall detection
- X API rate limit monitoring

## Service Intervals

| Service           | Before | After | Reason                       |
| ----------------- | ------ | ----- | ---------------------------- |
| `twitterPoller`   | 120s   | 120s  | ✅ Within mentions limit     |
| `validateEntries` | 60s    | 180s  | ✅ Share tweet lookup budget |
| `fastDeleteSweep` | 90s    | 180s  | ✅ Share tweet lookup budget |

## API Budget Compliance

### Before Fix

- **Mentions**: 10 req/15min ✅ (120s = 7.5 req/15min)
- **Tweet Lookup**: 15 req/15min ❌ (60s + 90s = 25 req/15min)

### After Fix

- **Mentions**: 10 req/15min ✅ (120s = 7.5 req/15min)
- **Tweet Lookup**: 15 req/15min ✅ (180s + 180s = 10 req/15min)

## Setup Commands

```bash
# 1. Setup database schema
npm run setup:scheduler-monitoring

# 2. Start server (uses new scheduler automatically)
npm run dev

# 3. Monitor health
curl http://localhost:3001/health/cron
```

## Expected Results

1. **No More 7-Minute Gaps**: Safe scheduler prevents overlapping runs
2. **Better Rate Limit Handling**: Non-blocking token bucket limiter
3. **Real-Time Monitoring**: Health endpoints show service status
4. **Automatic Stall Detection**: Database heartbeats catch issues early
5. **Improved Reliability**: Timeouts and retries prevent hanging tasks

## Backward Compatibility

- ✅ All existing functionality preserved
- ✅ No breaking changes to APIs
- ✅ Environment variables still work
- ✅ Existing database schema unchanged
- ✅ Additive monitoring system

## Performance Impact

- **Positive**: No more event loop blocking
- **Positive**: Better error handling and recovery
- **Neutral**: Minimal monitoring overhead (~1KB per service)
- **Neutral**: Database writes (~1 per service per run)
