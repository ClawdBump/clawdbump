# 🔍 Telegram Mini App - Debug Logging Guide

## 📋 Overview

Semua endpoint dan hook sudah ditambahkan dengan **comprehensive logging** untuk memudahkan debugging. Log akan muncul di:
- **Backend:** Terminal/console server (Vercel logs)
- **Frontend:** Browser console (DevTools)

---

## 🔍 Log Format

Semua log menggunakan format:
```
[STEP] [COMPONENT] Message: details
```

**Components:**
- `[VERIFY]` - `/api/v1/auth/telegram/verify` endpoint
- `[UPDATE-WALLET]` - `/api/v1/auth/telegram/update-wallet` endpoint
- `[VERIFY-UTIL]` - `lib/telegram-initdata-verify.ts` utility
- `[FRONTEND]` - `hooks/use-telegram-miniapp-auth.ts` hook

**Steps:**
- `Step 1`, `Step 2`, etc. - Urutan proses
- `Final result` - Hasil akhir

---

## 📊 Log Flow

### **1. Frontend - Get initData**

```
🔍 [FRONTEND] Starting initData verification...
🔍 [FRONTEND] Sending request to /api/v1/auth/telegram/verify...
```

---

### **2. Backend - Verify Endpoint**

```
🔍 [VERIFY] Step 1: Starting initData verification...
🔍 [VERIFY] Step 2: Verifying initData with HMAC-SHA256...
🔍 [VERIFY-UTIL] Starting initData verification...
🔍 [VERIFY-UTIL] Hash comparison: { calculatedHash: "...", providedHash: "...", isValid: true }
✅ [VERIFY-UTIL] Hash verification successful!
✅ [VERIFY] Step 2: initData verification successful!
🔍 [VERIFY] Step 3: Extracting Telegram ID and user data...
✅ [VERIFY] Step 3: Telegram ID extracted: 123456789
✅ [VERIFY] Step 3: User data extracted: { telegram_id: "123456789", username: "john_doe", ... }
🔍 [VERIFY] Step 4: Querying Supabase database...
ℹ️ [VERIFY] Step 4: User not found in database (telegram_id: 123456789)
ℹ️ [VERIFY] Step 4: User needs to login via Privy first
```

**OR if user exists:**

```
✅ [VERIFY] Step 4: User found in database: { telegram_id: "123456789", wallet_address: "0x...", privy_user_id: "did:privy:..." }
✅ [VERIFY] Final result: { telegram_id: "123456789", wallet_address: "0x...", privy_user_id: "did:privy:..." }
```

---

### **3. Frontend - After Privy Login**

```
🔍 [FRONTEND] Watching for Privy wallet creation...
🔍 [FRONTEND] Privy wallet check: { smartWallet_address: "0x...", user_wallet_address: "0x...", currentWalletAddress: "0x...", user_id: "did:privy:..." }
🚀 [FRONTEND] Calling updateWalletToDatabase...
🔍 [FRONTEND] updateWalletToDatabase called: { wallet_address: "0x...", privy_user_id: "did:privy:...", has_initData: true }
🔍 [FRONTEND] Sending request to /api/v1/auth/telegram/update-wallet...
```

---

### **4. Backend - Update Wallet Endpoint**

```
🔍 [UPDATE-WALLET] Step 1: Received request to update wallet
🔍 [UPDATE-WALLET] Step 1: Request body: { has_initData: true, wallet_address: "0x...", privy_user_id: "did:privy:..." }
🔍 [UPDATE-WALLET] Step 1: Validating wallet address format...
✅ [UPDATE-WALLET] Step 1: Wallet address format valid: 0x...
🔍 [UPDATE-WALLET] Step 2: Verifying initData with HMAC-SHA256...
✅ [UPDATE-WALLET] Step 2: initData verification successful!
🔍 [UPDATE-WALLET] Step 3: Extracting Telegram ID and user data...
✅ [UPDATE-WALLET] Step 3: Telegram ID and user data extracted: { telegram_id: "123456789", username: "john_doe", ... }
🔍 [UPDATE-WALLET] Step 4: Checking existing user mapping in Supabase...
ℹ️ [UPDATE-WALLET] Step 4: User not found in database, will INSERT new record
🔍 [UPDATE-WALLET] Step 5: Upserting to Supabase database...
✅ [UPDATE-WALLET] Step 5: Database upsert successful!
✅ [UPDATE-WALLET] Final result: { telegram_id: "123456789", wallet_address: "0x...", privy_user_id: "did:privy:...", database_record: {...} }
```

---

## 🐛 Troubleshooting dengan Logs

### **Problem 1: initData verification fails**

**Look for:**
```
❌ [VERIFY-UTIL] Hash mismatch - initData may be tampered with
⚠️ [VERIFY] Step 2: Invalid initData: ...
```

**Solution:**
- Check `TELEGRAM_BOT_TOKEN` di environment variables
- Verify initData dari `window.Telegram.WebApp.initData` masih valid
- Check apakah bot token match dengan bot yang digunakan di Mini App

---

### **Problem 2: User not found in database**

**Look for:**
```
ℹ️ [VERIFY] Step 4: User not found in database (telegram_id: 123456789)
ℹ️ [VERIFY] Step 4: User needs to login via Privy first
```

**This is normal!** User perlu login via Privy dulu, lalu hook akan otomatis call `/update-wallet`.

**Check next:**
```
🔍 [FRONTEND] Watching for Privy wallet creation...
```

Jika tidak ada log ini, berarti:
- Privy belum ready
- User belum authenticated
- initData belum tersedia

---

### **Problem 3: Wallet not updating to database**

**Look for:**
```
🚀 [FRONTEND] Calling updateWalletToDatabase...
```

**If this log doesn't appear:**
- Check apakah Privy wallet sudah dibuat
- Check apakah `ready`, `authenticated`, `user`, dan `initData` semua `true`

**If log appears but fails:**
```
❌ [FRONTEND] Update wallet request failed: { error: "..." }
❌ [UPDATE-WALLET] Step 5: Error upserting user mapping: ...
```

**Check:**
- Supabase connection
- Database schema (table `telegram_user_mappings` exists)
- RLS policies

---

### **Problem 4: Database upsert fails**

**Look for:**
```
❌ [UPDATE-WALLET] Step 5: Error upserting user mapping: { code: "...", message: "..." }
```

**Common errors:**
- `PGRST116`: Record not found (should not happen with upsert)
- `23505`: Unique constraint violation (telegram_id already exists but conflict)
- `42P01`: Table doesn't exist

**Solution:**
- Check Supabase table exists
- Check RLS policies allow INSERT/UPDATE
- Check `SUPABASE_SERVICE_ROLE_KEY` is correct

---

## ✅ Success Flow Logs

**Complete success flow akan terlihat seperti ini:**

```
# 1. Frontend gets initData
🔍 [FRONTEND] Starting initData verification...

# 2. Backend verifies initData
🔍 [VERIFY] Step 1: Starting initData verification...
✅ [VERIFY] Step 2: initData verification successful!
✅ [VERIFY] Step 3: Telegram ID extracted: 123456789
ℹ️ [VERIFY] Step 4: User not found in database (telegram_id: 123456789)

# 3. User logs in via Privy
🔍 [FRONTEND] Watching for Privy wallet creation...
🔍 [FRONTEND] Privy wallet check: { currentWalletAddress: "0x...", user_id: "did:privy:..." }
🚀 [FRONTEND] Calling updateWalletToDatabase...

# 4. Backend updates database
🔍 [UPDATE-WALLET] Step 1: Received request to update wallet
✅ [UPDATE-WALLET] Step 2: initData verification successful!
✅ [UPDATE-WALLET] Step 3: Telegram ID and user data extracted: { telegram_id: "123456789", ... }
ℹ️ [UPDATE-WALLET] Step 4: User not found in database, will INSERT new record
✅ [UPDATE-WALLET] Step 5: Database upsert successful!
✅ [UPDATE-WALLET] Final result: { telegram_id: "123456789", wallet_address: "0x...", ... }

# 5. Frontend confirms
✅ [FRONTEND] Wallet address updated to database: { telegram_id: "123456789", wallet_address: "0x...", ... }
✅ [FRONTEND] Local state updated
```

---

## 📝 Checklist untuk Debug

1. **Check initData verification:**
   - ✅ `[VERIFY-UTIL] Hash verification successful!`
   - ✅ `[VERIFY] Step 2: initData verification successful!`

2. **Check Telegram ID extraction:**
   - ✅ `[VERIFY] Step 3: Telegram ID extracted: 123456789`

3. **Check database query:**
   - ✅ `[VERIFY] Step 4: Querying Supabase database...`
   - ✅ `[VERIFY] Step 4: User not found` OR `User found in database`

4. **Check Privy wallet creation:**
   - ✅ `[FRONTEND] Watching for Privy wallet creation...`
   - ✅ `[FRONTEND] Privy wallet check: { currentWalletAddress: "0x...", ... }`

5. **Check wallet update:**
   - ✅ `[FRONTEND] Calling updateWalletToDatabase...`
   - ✅ `[UPDATE-WALLET] Step 5: Database upsert successful!`
   - ✅ `[FRONTEND] Wallet address updated to database`

---

## 🎯 Summary

**Semua langkah sudah ditambahkan logging:**
- ✅ initData verification (HMAC-SHA256)
- ✅ Telegram ID extraction
- ✅ Database query (Supabase)
- ✅ Database upsert (INSERT/UPDATE)
- ✅ Frontend hook flow
- ✅ Privy wallet detection

**Gunakan logs ini untuk:**
1. Verify setiap langkah berjalan dengan benar
2. Identify di mana proses gagal
3. Debug database issues
4. Track user flow dari initData sampai database

**Semua log menggunakan prefix `[STEP] [COMPONENT]` untuk mudah di-filter!** 🔍

