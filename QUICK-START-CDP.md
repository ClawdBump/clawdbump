# 🚀 Quick Start - CDP Server Wallets V2

## TL;DR

Your code is ready! Just add CDP credentials and test.

---

## ⚡ 3-Step Setup (5 minutes)

### Step 1: Get CDP Credentials (2 min)

1. Go to: https://portal.cdp.coinbase.com/
2. Login / Create account
3. Click "API Keys" → "Create API Key"
4. Select "Server" type
5. Download JSON file

### Step 2: Add to `.env.local` (1 min)

```bash
CDP_API_KEY_NAME="organizations/abc-123/apiKeys/xyz-456"
CDP_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----
YOUR_PRIVATE_KEY_CONTENT_HERE
-----END EC PRIVATE KEY-----"
```

### Step 3: Run Database Migration (2 min)

In Supabase SQL Editor, run:

```sql
ALTER TABLE wallets_data
ADD COLUMN IF NOT EXISTS coinbase_wallet_id TEXT,
ADD COLUMN IF NOT EXISTS chain TEXT DEFAULT 'base-mainnet';

ALTER TABLE wallets_data
ALTER COLUMN owner_private_key DROP NOT NULL,
ALTER COLUMN owner_public_address DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallets_coinbase_wallet_id 
ON wallets_data(coinbase_wallet_id);
```

**Done!** 🎉

---

## 🧪 Test (3 minutes)

### 1. Wallet Creation
```bash
# In your app:
1. Click "Generate Bot Wallet"
2. Wait ~5 seconds
3. Should see "5 wallets created"
```

### 2. Funding
```bash
1. Click "Start Bumping"
2. Approve transaction
3. Wait for 5 transfers to complete
```

### 3. Swaps
```bash
1. Wait for first swap (~30s)
2. Check Live Activity logs
3. Verify transaction on BaseScan
4. Confirm gasless (no gas paid by bot)
```

---

## ✅ What Changed

| Feature | Old | New |
|---------|-----|-----|
| **Wallet Creation** | Manual keys + CREATE2 | `Wallet.create()` |
| **Key Storage** | Encrypted in DB | CDP Nitro Enclaves |
| **Swap Execution** | Manual viem signing | `wallet.invokeContract()` |
| **Gas Sponsorship** | Paymaster (issues) | CDP native (works) |
| **Code Lines** | ~800 | ~200 |

---

## 🎯 Benefits

✅ **No more Paymaster allowlist errors**
✅ **Production-grade security**
✅ **75% less code**
✅ **Native gas sponsorship**
✅ **Same costs ($0.01 total)**

---

## 🐛 Troubleshooting

### "CDP credentials not configured"
```bash
# Check .env.local has CDP_API_KEY_NAME and CDP_PRIVATE_KEY
# Restart: pnpm dev
```

### "Failed to create wallet"
```bash
# Check CDP portal → API Keys
# Ensure "Wallets" permission enabled
# Regenerate key if needed
```

### "Wallet not found"
```sql
-- Check database:
SELECT * FROM wallets_data WHERE coinbase_wallet_id IS NOT NULL;
```

---

## 📚 Full Documentation

- **Migration Guide:** `CDP-MIGRATION-GUIDE.md`
- **Implementation Summary:** `CDP-IMPLEMENTATION-SUMMARY.md`
- **Database Migration:** `DATABASE-CDP-MIGRATION.sql`
- **CDP Docs:** https://docs.cdp.coinbase.com/

---

## 🚀 Deploy to Production

```bash
# Add CDP credentials to Vercel:
vercel env add CDP_API_KEY_NAME
vercel env add CDP_PRIVATE_KEY

# Deploy:
git push origin main
```

---

## ✨ That's It!

Your app is now using CDP Server Wallets V2!

- 🔒 Secure (keys in AWS Nitro Enclaves)
- ⚡ Fast (native gas sponsorship)
- 🎯 Reliable (no Paymaster issues)
- 💰 Cheap (same $0.01 total cost)

**Happy building!** 🚀





