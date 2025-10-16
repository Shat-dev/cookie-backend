#!/bin/bash

# X API One-Time Execution Script Runner
# This script compiles and runs the TypeScript X API execution script

set -e  # Exit on any error

echo "🎯 X API One-Time Execution Runner"
echo "=================================="

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the backend directory"
    exit 1
fi

# Check if TypeScript is compiled
if [ ! -d "dist" ]; then
    echo "📦 Compiling TypeScript..."
    npm run build
fi

# Run the script
echo "🚀 Executing X API calls..."
node dist/scripts/runXApiCallsOnce.js

echo "✅ Script execution completed!"
