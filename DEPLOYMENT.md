# Backend Deployment Guide

## Production Deployment Steps

### 1. Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Go to Settings → Database
3. Copy the **Connection String** (URI format)
4. Make sure to append `?sslmode=require` to the connection string

### 2. Railway Setup

1. Create a new project on Railway
2. Connect your GitHub repository
3. Railway will automatically provide the `PORT` environment variable
4. Get your Railway app URL after deployment

### 3. Required Environment Variables

**These are REQUIRED for basic operation:**

```bash
# Environment
NODE_ENV=production

# Database (from Supabase)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres?sslmode=require

# Frontend URL (from Vercel)
FRONTEND_URL=https://your-app.vercel.app

# Network Configuration
NETWORK=base-sepolia  # or "base-mainnet" when ready

# RPC URLs (from Alchemy)
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR-ALCHEMY-KEY
BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR-ALCHEMY-KEY

# Twitter Integration
TWITTER_BEARER_TOKEN=YOUR-TWITTER-BEARER-TOKEN
X_USER_ID=YOUR-TWITTER-USER-ID
```

**These are OPTIONAL (have sensible defaults):**

```bash
# Contract configuration
VRF_NATIVE=false
NFT_SUPPLY=10000

# Service Intervals (optional - has defaults)
POLL_EVERY_MS=150000
VALIDATE_EVERY_MS=600000
FAST_DELETE_EVERY_MS=60000
AUTOMATION_CHECK_MS=10000

# Lottery Configuration (optional - has defaults)
FREEZE_SEC=180
FREEZE_SAFETY_SEC=15

# Rate Limiting (optional - has defaults)
TW_RESERVE_MENTIONS=1
TW_RESERVE_LOOKUP=3
VALIDATE_MAX_BATCHES_PER_RUN=1
FAST_DELETE_LIMIT=100

# Caching (optional - has defaults)
PROJECTION_TTL_MS=60000
```

**These are ONLY needed for MANUAL lottery operations:**

```bash
# Private key for lottery operations (only needed if running manual lotteries)
PRIVATE_KEY=your-private-key-here

# VRF Configuration (only needed for manual lottery operations)
SUB_ID=your-vrf-subscription-id
VRF_COORDINATOR=your-vrf-coordinator-address
LINK_TOKEN=your-link-token-address
```

### 4. Database Migration

After deploying to Railway:

1. Run the database migration:

   ```bash
   railway run npm run db:migrate
   ```

2. Or manually execute the SQL files in order:
   - `src/db/schema.sql`
   - `src/db/lottery-schema.sql`
   - `src/db/add-push-tracking.sql`

### 5. Health Check

After deployment, verify the backend is running:

```
GET https://your-app.up.railway.app/health
```

Should return:

```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "production"
}
```

### 6. Frontend Configuration

Update your frontend environment variables:

```bash
NEXT_PUBLIC_API_URL=https://your-app.up.railway.app
```

## Important Notes

- **For basic API operation**: You only need the required variables above
- **For manual lottery execution**: You need the VRF-related variables
- **The backend will work in read-only mode** without the VRF variables
- **All database operations will work** with just the DATABASE_URL

## Monitoring

- Check Railway logs for any errors
- Monitor the health endpoint regularly
- Set up alerts for failed health checks

## Troubleshooting

### Database Connection Issues

- Ensure `?sslmode=require` is appended to DATABASE_URL
- Check Supabase connection pooling settings
- Verify Railway can reach Supabase (no firewall issues)

### CORS Issues

- Verify FRONTEND_URL matches your Vercel deployment exactly
- Check browser console for CORS errors
- Ensure credentials are included in frontend requests

### RPC Issues

- Monitor RPC rate limits in logs
- The backend uses multiple fallback RPC endpoints
- Check Alchemy dashboard for usage

### Missing VRF Variables

- If you see "Signer required" errors, you need to set the VRF variables
- Or remove any manual lottery execution scripts from your deployment

## Security Checklist

- [ ] All sensitive values are in environment variables
- [ ] No localhost references in production code
- [ ] Database uses SSL connection
- [ ] CORS is properly configured
- [ ] API endpoints have appropriate error handling
- [ ] Rate limiting is enabled for Twitter API calls
