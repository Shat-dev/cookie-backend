# Countdown System Manual Control Guide

## Overview

The countdown system manages lottery rounds through a 4-phase lifecycle with manual admin controls. The system consists of an in-memory state manager, REST API endpoints, and a CLI tool for remote administration.

### System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CLI Tool      │───▶│  Backend API     │───▶│  Frontend UI    │
│ countdown-      │    │ /api/countdown   │    │ Polls status    │
│ control.ts      │    │ /api/admin/*     │    │ every 5s        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Countdown Phases

The system cycles through these phases automatically once started:

1. **starting** → Ready state, waiting for manual trigger
2. **countdown** → 1 hour countdown period (entries accepted)
3. **selecting** → 1 minute selection phase (entries closed)
4. **winner** → 1 minute winner display phase
5. **starting** → Automatically resets for next round

## API Endpoints

### Public Endpoints

- `GET /api/lottery/countdown` - Get current countdown status (no auth required)

### Admin Endpoints (require ADMIN_API_KEY)

- `POST /api/admin/start-round` - Start a new countdown round
- `POST /api/admin/reset-countdown` - Reset countdown to starting state

## Environment Setup

### Required Environment Variables

Create a `.env` file in the backend directory:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Admin Authentication
ADMIN_API_KEY=your-secure-admin-key-here

# Network Configuration
RPC_URL=https://your-rpc-endpoint

# Twitter Integration
X_USER_ID=your-twitter-user-id
TWITTER_BEARER_TOKEN=your-twitter-bearer-token

# Optional: Backend URL for CLI (defaults to localhost:3001)
BACKEND_URL=http://localhost:3001
```

### For Railway Deployment

```bash
# Point CLI to deployed backend
BACKEND_URL=https://your-app.railway.app
ADMIN_API_KEY=same-key-as-deployed-backend
```

## CLI Usage

The countdown control CLI (`src/scripts/countdown-control.ts`) provides commands to manage the countdown system remotely.

### Available Commands

```bash
# Check current countdown status
npm run countdown status

# Start a new countdown round (admin)
npm run countdown start

# Reset countdown to starting state (admin)
npm run countdown reset

# Monitor countdown with live updates (every 5 seconds)
npm run countdown monitor

# Monitor with custom interval (every 3 seconds)
npm run countdown monitor 3

# Show help
npm run countdown help
```

## Local Development Workflow

### 1. Start the Backend Server

```bash
cd backend
npm install
npm run dev
```

The server starts on `http://localhost:3001`

### 2. Test Countdown Status (Public)

```bash
# Check initial status
npm run countdown status
```

Expected output:

```
🎯 Countdown Status:
   Phase: starting
   Active: false
   Remaining: 0 seconds
   Ends at: N/A
```

### 3. Start a Countdown Round (Admin)

```bash
# Start new round
npm run countdown start
```

Expected output:

```
✅ Countdown round started successfully!
   Phase: countdown
   Ends at: 2024-01-01T15:00:00.000Z
```

### 4. Monitor Live Updates

```bash
# Watch countdown progress
npm run countdown monitor
```

This shows real-time updates:

```
🕐 2:00:15 PM - Countdown Monitor
Phase: countdown | Active: true | Remaining: 3542s
```

### 5. Frontend Integration

The frontend polls the public endpoint every 5 seconds:

```javascript
// Frontend polling example
setInterval(async () => {
  const response = await fetch("/api/lottery/countdown");
  const { phase, remainingSeconds, isActive } = await response.json();

  // Update UI based on phase and remaining time
  updateCountdownUI(phase, remainingSeconds, isActive);
}, 5000);
```

## Production Deployment (Railway)

### 1. Deploy Backend to Railway

The backend automatically deploys when pushed to the connected repository. Railway uses these files:

- `Procfile`: `web: npm start`
- `railway.json`: Configuration file
- Environment variables set in Railway dashboard

### 2. Configure Environment Variables in Railway

Set these in the Railway dashboard:

```
DATABASE_URL=<railway-postgres-url>
ADMIN_API_KEY=<secure-random-key>
RPC_URL=<your-rpc-endpoint>
X_USER_ID=<twitter-user-id>
TWITTER_BEARER_TOKEN=<twitter-token>
```

### 3. Control Remote Backend from Local CLI

Update your local `.env` file:

```bash
BACKEND_URL=https://your-app.railway.app
ADMIN_API_KEY=same-key-as-railway
```

Now run CLI commands against the deployed backend:

```bash
# Check status on production
npm run countdown status

# Start round on production
npm run countdown start

# Monitor production countdown
npm run countdown monitor
```

## Command Examples

### Basic Status Check

```bash
$ npm run countdown status

🎲 Countdown Controller Script
🔗 Backend URL: http://localhost:3001

📊 Fetching countdown status...

🎯 Countdown Status:
   Phase: starting
   Active: false
   Remaining: 0 seconds
   Ends at: N/A
```

### Starting a Round

```bash
$ npm run countdown start

🎲 Countdown Controller Script
🔗 Backend URL: http://localhost:3001

🚀 Starting countdown round...
✅ Countdown round started successfully!
   Phase: countdown
   Ends at: 2024-01-01T15:00:00.000Z
```

### Live Monitoring

```bash
$ npm run countdown monitor

🎲 Countdown Controller Script
🔗 Backend URL: http://localhost:3001

👀 Starting countdown monitor (updates every 5s)...
Press Ctrl+C to stop monitoring

🕐 2:00:15 PM - Countdown Monitor
Phase: countdown | Active: true | Remaining: 3542s
```

### Emergency Reset

```bash
$ npm run countdown reset

🎲 Countdown Controller Script
🔗 Backend URL: http://localhost:3001

🔄 Resetting countdown...
✅ Countdown reset successfully!
   Phase: starting
```

## Troubleshooting

### Common Errors

#### 1. "Route not found" (404)

```
❌ Failed to get countdown status: Request failed with status code 404
```

**Causes:**

- Backend server not running
- Wrong BACKEND_URL in `.env`
- Endpoint path incorrect

**Solutions:**

```bash
# Check if backend is running
curl http://localhost:3001/health

# Verify correct URL in .env
echo $BACKEND_URL

# Test direct endpoint
curl http://localhost:3001/api/lottery/countdown
```

#### 2. "Unauthorized" (401/403)

```
❌ Failed to start countdown round: Request failed with status code 401
```

**Causes:**

- Missing or incorrect ADMIN_API_KEY
- Admin endpoint called without authentication

**Solutions:**

```bash
# Check admin key is set
echo $ADMIN_API_KEY

# Verify key matches backend configuration
# Admin endpoints require x-api-key header
```

#### 3. "A countdown round is already active" (400)

```
❌ Failed to start countdown round: A countdown round is already active
```

**Cause:** Trying to start a round when one is already running

**Solutions:**

```bash
# Check current status first
npm run countdown status

# Reset if needed
npm run countdown reset

# Then start new round
npm run countdown start
```

#### 4. Connection Refused (ECONNREFUSED)

```
❌ Failed to get countdown status: connect ECONNREFUSED 127.0.0.1:3001
```

**Causes:**

- Backend server not running
- Wrong port configuration
- Firewall blocking connection

**Solutions:**

```bash
# Start backend server
cd backend && npm run dev

# Check if port 3001 is in use
lsof -i :3001

# Test with curl
curl -v http://localhost:3001/health
```

#### 5. Missing Environment Variables

```
❌ ADMIN_API_KEY environment variable is required for admin operations
```

**Solution:**

```bash
# Create .env file with required variables
cp .env.example .env
# Edit .env with your values

# Or export temporarily
export ADMIN_API_KEY=your-key-here
```

### Debug Mode

For detailed debugging, check the backend logs:

```bash
# Local development
cd backend && npm run dev

# Check Railway logs
railway logs --follow
```

### Network Connectivity Test

Test connectivity to your backend:

```bash
# Local backend
curl http://localhost:3001/health

# Railway backend
curl https://your-app.railway.app/health

# Test countdown endpoint specifically
curl https://your-app.railway.app/api/lottery/countdown
```

## Security Notes

1. **Admin API Key**: Keep `ADMIN_API_KEY` secure and never commit it to version control
2. **HTTPS**: Always use HTTPS URLs for production Railway deployments
3. **Rate Limiting**: The API includes rate limiting to prevent abuse
4. **CORS**: Backend is configured with secure CORS policies

## Integration with Frontend

The frontend should poll the countdown status and update the UI accordingly:

```typescript
interface CountdownStatus {
  success: boolean;
  phase: "starting" | "countdown" | "selecting" | "winner" | "new_round";
  remainingSeconds: number;
  endsAt: string | null;
  isActive: boolean;
}

// Poll every 5 seconds
const pollCountdown = async () => {
  try {
    const response = await fetch("/api/lottery/countdown");
    const status: CountdownStatus = await response.json();

    switch (status.phase) {
      case "starting":
        showWaitingState();
        break;
      case "countdown":
        showCountdownTimer(status.remainingSeconds);
        break;
      case "selecting":
        showSelectionInProgress();
        break;
      case "winner":
        showWinnerAnnouncement();
        break;
      case "new_round":
        showNewRoundStarting();
        break;
    }
  } catch (error) {
    console.error("Failed to fetch countdown status:", error);
  }
};

setInterval(pollCountdown, 5000);
```

## Summary

The countdown system provides manual control over lottery rounds through:

1. **Backend API**: Manages countdown state and exposes REST endpoints
2. **CLI Tool**: Provides remote administration capabilities
3. **Frontend Integration**: Polls status for real-time UI updates

The system works identically for local development and Railway deployment - only the `BACKEND_URL` environment variable needs to change to point to the deployed instance.
