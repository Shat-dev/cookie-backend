# Manual VRF Draw Script

This script allows developers to manually trigger a VRF draw for the active lottery round.

## Usage

```bash
npx ts-node src/scripts/manual-vrf-draw.ts
```

## Requirements

- Active lottery round must exist
- Verified entries must be available
- Proper environment variables must be set (.env file)
- Private key must be configured for blockchain transactions

## What it does

1. Connects to the database
2. Fetches the active lottery round
3. Retrieves all verified entries
4. Pushes snapshot to the smart contract
5. Triggers VRF draw
6. Waits for transaction confirmation
7. Marks round as completed (if winner data is available)
8. Creates the next round
9. Exits cleanly

## Error Handling

The script includes comprehensive error handling and will:
- Log detailed error messages
- Clean up database connections
- Exit with appropriate status codes
- Handle cases where winner data isn't immediately available


