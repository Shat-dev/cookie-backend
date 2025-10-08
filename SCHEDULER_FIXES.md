# Scheduler Fixes and Monitoring System

## Overview

This document describes the fixes implemented to prevent multi-minute gaps in the backend schedulers and the new monitoring system.

## Issues Fixed

### 1. Rate Limiter Blocking

- **Problem**: Old `rateLimiter.ts` used `await new Promise((r) => setTimeout(r, wait))` which blocked the entire event loop
- **Solution**: New token bucket rate limiter (`xLimiter.ts`) that schedules calls without blocking

### 2. Overlapping Runs

- **Problem**: Simple boolean flags didn't prevent race conditions properly
- **Solution**: New safe scheduler wrapper (`scheduler.ts`) with overlap prevention

### 3. No Timeout Protection

- **Problem**: External calls could hang indefinitely
- **Solution**: All tasks now have configurable timeouts via AbortController

### 4. API Budget Conflicts

- **Problem**: `validateEntries` and `fastDeleteSweep` both used the same Twitter API endpoint (15 req/15min)
- **Solution**: Adjusted intervals to 180s each, ensuring they don't exceed the shared budget
- **Final Sweep Protection**: `validateEntries(finalSweep=true)` uses rate limiting and smaller batches (50 vs 100) to safely process ALL tweets during freeze rounds

## New Architecture

### Safe Scheduler (`src/utils/scheduler.ts`)

```typescript
const task = every(
  "serviceName",
  intervalMs,
  async () => {
    // Your task here
  },
  {
    onOverrun: "skip", // Skip if previous run still active
    jitterMs: 5000, // Add randomness to prevent sync
    timeoutMs: 20000, // Hard timeout per task
    maxRetries: 2, // Retry failed tasks
  }
);
```

### Token Bucket Rate Limiter (`src/utils/xLimiter.ts`)

- **Mentions**: 10 requests per 15 minutes
- **Tweet Lookup**: 15 requests per 15 minutes (shared between services)
- Non-blocking: schedules calls for later instead of waiting

### Scheduler Monitoring (`src/db/scheduler-heartbeats.sql`)

- Tracks last run time, duration, and error counts for each service
- Automatic stall detection (2x expected interval)
- Health endpoint: `/health/cron`

## Service Intervals

| Service             | Old Interval | New Interval | Reason                      |
| ------------------- | ------------ | ------------ | --------------------------- |
| `twitterPoller`     | 120s         | 120s         | Mentions: 10 req/15min      |
| `validateEntries`   | 60s          | 180s         | Tweet lookup budget sharing |
| `fastDeleteSweep`   | 90s          | 180s         | Tweet lookup budget sharing |
| `freezeCoordinator` | N/A          | 300s         | Estimated usage             |

## API Budget Analysis

### Before Fix

- **Mentions**: 10 req/15min ✅ (120s interval = 7.5 req/15min)
- **Tweet Lookup**: 15 req/15min ❌ (60s + 90s intervals = 25 req/15min)

### After Fix

- **Mentions**: 10 req/15min ✅ (120s interval = 7.5 req/15min)
- **Tweet Lookup**: 15 req/15min ✅ (180s intervals = 10 req/15min)

## Final Validation for Freeze Rounds

When freezing a round, `validateEntries(finalSweep=true)` is called to process ALL tweets in the database. This is now safe thanks to:

1. **Rate Limiting**: Uses the token bucket limiter to respect API budgets
2. **Smaller Batches**: Processes in chunks of 50 (vs 100) to be gentler on rate limits
3. **Progress Tracking**: Shows completion percentage and batch timing
4. **Inter-batch Delays**: 1-second delays between batches to spread API calls
5. **Coordinated Freeze**: `freezeCoordinator.freezeRound()` handles the entire process

### Example Usage

```typescript
// During freeze round
await freezeCoordinator.freezeRound(roundNumber, entries);
// This automatically calls validateEntries(true) first, then pushes snapshot
```

## Setup Instructions

### 1. Database Schema

```bash
cd backend
npm run ts-node src/scripts/setup-scheduler-monitoring.ts
```

### 2. Health Monitoring

```bash
# Check all services
curl http://localhost:3001/health/cron

# Check specific service
curl http://localhost:3001/health/cron/twitterPoller
```

### 3. Environment Variables

```bash
# Optional: Override default intervals
TWITTER_POLL_INTERVAL=120000
VALIDATE_ENTRIES_INTERVAL=180000
FAST_DELETE_SWEEP_INTERVAL=180000
```

## Monitoring Endpoints

### `/health/cron`

Returns health status for all background services:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": [
    {
      "service": "twitterPoller",
      "last_run": "2024-01-15T10:28:00.000Z",
      "age_seconds": 120,
      "status": "HEALTHY"
    }
  ],
  "stalled_services": [],
  "x_api_status": {
    "mentions": { "tokens": 8.5, "capacity": 10 },
    "tweetLookup": { "tokens": 12.3, "capacity": 15 }
  }
}
```

### `/health/cron/:service`

Returns detailed health for a specific service.

## Troubleshooting

### Service Stalled

If a service shows as "STALLED":

1. Check logs for errors
2. Verify database connectivity
3. Check if the service is actually running
4. Restart the service if needed

### Rate Limit Issues

If you see 429 errors:

1. Check `/health/cron` for token counts
2. Verify intervals are not too aggressive
3. Check if multiple instances are running

### High Latency

If services are taking too long:

1. Check database performance
2. Verify external API response times
3. Consider increasing `timeoutMs` in scheduler options

## Migration Notes

### Breaking Changes

- None - all changes are additive and backward compatible

### Performance Impact

- **Positive**: No more event loop blocking
- **Positive**: Better error handling and retries
- **Neutral**: Slightly higher memory usage for monitoring

### Monitoring Overhead

- Database writes: ~1 per service per run
- Memory: ~1KB per service
- CPU: Negligible

## Future Improvements

1. **Alerting**: Email/Slack notifications for stalled services
2. **Metrics**: Prometheus/Grafana integration
3. **Auto-scaling**: Dynamic interval adjustment based on load
4. **Circuit Breaker**: Automatic service disable on repeated failures
