# Database Setup Guide

## The Problem

You're getting `[fastDeleteSweep] failed (attempt 1): Tenant or user not found` because your Supabase database is empty and doesn't have the required tables.

## The Solution

Set up your database schema by running the provided SQL script.

## Steps to Fix

### 1. 🌐 Go to Supabase Dashboard

- Visit: https://supabase.com/dashboard/project/uulzjchhneskrhkxznnk
- Navigate to the **SQL Editor** section

### 2. 📋 Copy the SQL Script

- Open the file: `complete-schema-setup.sql` in this directory
- Copy the entire contents

### 3. 🚀 Run the Script

- Paste the SQL script into the SQL Editor
- Click **RUN** or **Execute**
- Wait for completion

### 4. ✅ Verify Setup

The script includes verification queries at the end. You should see:

- List of all created tables with their column counts
- app_state table initialized with default values
- Success message

### 5. 🔄 Redeploy Your Backend

After the database schema is set up:

- Your Railway backend should work without the "Tenant or user not found" error
- The fastDeleteSweep service and other components will be able to find the required tables

## Expected Tables

The script will create these tables:

- `entries` - Store lottery entries
- `winners` - Store lottery winners
- `app_state` - Store application state (like Twitter polling state)
- `lottery_rounds` - Store lottery round information
- `lottery_entries` - Link entries to specific lottery rounds
- `lottery_winners` - Store winners for specific rounds

## What This Fixes

- ✅ Resolves "Tenant or user not found" errors
- ✅ Enables all database operations
- ✅ Allows proper Twitter polling and entry tracking
- ✅ Enables lottery functionality

## Troubleshooting

If you get any errors:

1. Make sure you're in the correct Supabase project
2. Check that you have proper permissions (you should as the project owner)
3. Try running smaller sections of the script if the full script fails
4. Contact me if you need help debugging specific errors

## Connection Working ✅

Since "option 1 worked", your Railway deployment is now properly connecting to Supabase using the pooler connection. Once you set up the schema, everything should work perfectly!
