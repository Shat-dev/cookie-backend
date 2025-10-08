# CORRECT DATABASE_URL

## ✅ Use This in Railway:

```
postgresql://postgres:Poptropica0606@uulzjchhneskrhkxznnk.pooler.supabase.com:6543/postgres?sslmode=require
```

## ❌ DO NOT Use These:

```
# Regional pooler (WRONG)
postgresql://postgres:Poptropica0606@aws-0-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require

# Direct connection (WRONG - causes DNS issues)
postgresql://postgres:Poptropica0606@db.uulzjchhneskrhkxznnk.supabase.co:5432/postgres?sslmode=require
```

## 🎯 Key Differences:

- **Hostname:** `uulzjchhneskrhkxznnk.pooler.supabase.com` (project-specific)
- **Port:** `6543` (pooler port)
- **Password:** `Poptropica0606` (your new password)

## 🔧 Where to Update:

1. **Railway:** Environment Variables → DATABASE_URL
2. **Local:** `.env` file in backend directory

## 🚀 After Update:

1. Redeploy Railway
2. Check logs - should see successful connection
3. No more "Tenant or user not found" errors
