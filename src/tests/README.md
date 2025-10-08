# ERC-404 Lottery Backend Test Suite

This directory contains comprehensive tests for all the backend services that power the ERC-404 lottery system. The tests verify that the system correctly implements the lottery requirements.

## 🎯 Test Coverage

### Core Services Tested

1. **Twitter Poller** (`test-twitter-poller.ts`)

   - Processes Twitter mentions containing "Gacha {ID}"
   - Validates token ownership via smart contract
   - Creates entries for all owned tokens
   - Tracks last processed mention ID
   - Triggers round creation on new entries

2. **Entry Validator** (`test-validate-entries.ts`)

   - Removes ALL entries for deleted tweets
   - Prunes tokens no longer owned (transfers)
   - Auto-adds newly acquired tokens (no new tweet required)
   - Purges invalid non-numeric tweet IDs
   - Handles batch processing efficiently

3. **Fast Delete Sweep** (`test-fast-delete-sweep.ts`)

   - Quickly identifies deleted tweets
   - Removes entries in bulk
   - Filters out non-numeric tweet IDs
   - Respects rate limits

4. **Round Coordinator** (`test-round-coordinator.ts`)

   - Creates rounds with correct duration (6h first, 1h subsequent)
   - Prevents duplicate round creation
   - Calculates freeze window timing
   - Manages first round flag

5. **Freeze Coordinator** (`test-freeze-coordinator.ts`)

   - Builds deterministic snapshots
   - Encodes ERC-404 high-bit IDs
   - Handles empty pools gracefully
   - Ensures idempotent operations

6. **Automated Lottery** (`test-automated-lottery.ts`)
   - Orchestrates the complete flow
   - Manages freeze window (3 min before end)
   - Handles recovery after downtime
   - Creates next round automatically
   - Extracts winner information

## 🚀 Running Tests

### Run All Tests

```bash
npm run test:all
```

### Run Individual Tests

```bash
npm run test:twitter-poller
npm run test:validate-entries
npm run test:fast-delete
npm run test:round-coordinator
npm run test:freeze-coordinator
npm run test:automated-lottery
```

## 📋 Test Requirements Verification

The tests verify these key requirements:

### ✅ Push Only During Freeze

- Single on-chain snapshot per round
- Pushed in the last 3 minutes before round end
- Idempotent to prevent duplicate pushes

### ✅ Deleted Posts Remove Eligibility

- Deleted tweets remove current round eligibility
- Entries stay removed until user reposts
- Validated before freeze window

### ✅ Transfers Remove Eligibility

- Transferred tokens are pruned from pool
- Eligibility restored when re-acquired
- No new tweet required for re-entry

### ✅ New Tokens Auto-Enter

- Newly acquired tokens auto-enter existing tweets
- No additional tweet required
- Synced before freeze

### ✅ Round Timing

- First round: 6 hours
- Subsequent rounds: 1 hour
- Auto-start if pool has entries after draw

## 🔍 Test Output

Each test provides detailed output showing:

- What functionality is being tested
- Step-by-step verification
- Pass/fail status for each check
- Summary of all tests

Example output:

```
🧪 Starting validateEntries Service Tests...

Test 1: Empty pool handling
✅ Correctly handles empty pool

Test 2: Invalid tweet ID purging
✅ Invalid tweet IDs correctly purged

📊 Test Summary:
- Empty pool handling: ✅
- Invalid tweet ID purging: ✅
- Batch processing: ✅
- Final sweep mode: ✅

🎉 All validateEntries tests completed!
```

## 🛠️ Test Implementation

Tests use the project's existing infrastructure:

- TypeScript with ts-node execution
- Direct service imports
- Mock-free testing where possible
- Clear console output for debugging

## 📝 Adding New Tests

To add a new test:

1. Create a new file: `test-{service-name}.ts`
2. Follow the existing pattern:

   ```typescript
   async function runTests() {
     console.log("🧪 Starting {Service} Tests...\n");

     // Test cases here

     console.log("🎉 All {service} tests completed!");
   }

   if (require.main === module) {
     runTests()
       .then(() => process.exit(0))
       .catch(() => process.exit(1));
   }
   ```

3. Add to `run-all-tests.ts`
4. Add npm script to `package.json`

## 🔧 Troubleshooting

If tests fail:

1. Check database connection settings in `.env`
2. Ensure required environment variables are set
3. Verify smart contract addresses are correct
4. Check Twitter API credentials (if testing live)

## 📊 Test Coverage Goals

- ✅ Core business logic
- ✅ Edge cases and error handling
- ✅ Integration between services
- ✅ Recovery mechanisms
- ✅ Performance characteristics

The test suite ensures the lottery system operates reliably and meets all specified requirements.
