# Railway Authentication Error - Fix Guide

## ❌ **Error:**
```
❌ Swap failed: Invalid authentication credentials
```

This error occurs in Railway Worker when trying to execute swaps using Coinbase Developer Platform (CDP) SDK.

---

## 🔍 **Root Cause:**

CDP credentials are either:
1. **Missing** from Railway environment variables
2. **Incorrectly formatted** (especially `CDP_API_KEY_PRIVATE_KEY`)
3. **Invalid** (expired or wrong keys)

---

## ✅ **Solution:**

### **Step 1: Get Your CDP Credentials**

#### **Option A: From Local `.env.local` File**

1. Open your `.env.local` file in FarBump project root
2. Find these two variables:
   ```bash
   CDP_API_KEY_NAME=organizations/xxx/apiKeys/xxx
   CDP_API_KEY_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----\nMHxxx...\n-----END EC PRIVATE KEY-----
   ```
3. Copy the exact values (including the `\n` characters!)

#### **Option B: Generate New Keys from Coinbase Dashboard**

1. Go to: https://portal.cdp.coinbase.com/
2. Login with your Coinbase account
3. Click **"API Keys"** in sidebar
4. Click **"Create API Key"**
5. Name: `FarBump Railway Worker`
6. Permissions: Enable **"Create Smart Accounts"** and **"Execute Transactions"**
7. Click **"Create"**
8. **IMPORTANT:** Copy both:
   - API Key Name (format: `organizations/xxx/apiKeys/xxx`)
   - Private Key (multi-line PEM format)

---

### **Step 2: Format Private Key Correctly**

**CRITICAL:** Railway environment variables must have `\n` (backslash-n) for newlines, **NOT actual line breaks**.

#### **Example of CORRECT Format:**
```bash
CDP_API_KEY_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nAoGCCqGSM49AwEHoUQDQgAExxxxxxxxxxxxxxxxxxxxx\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxx==\n-----END EC PRIVATE KEY-----
```

#### **Example of WRONG Format (will cause auth error):**
```bash
CDP_API_KEY_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AoGCCqGSM49AwEHoUQDQgAExxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxx==
-----END EC PRIVATE KEY-----
```

#### **How to Convert:**

If you have multi-line private key, convert to single line with `\n`:

**Before (Multi-line):**
```
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIBxxxxx...
AoGCCqGSM49AwEH...
xxxxxxxxxxxxx==
-----END EC PRIVATE KEY-----
```

**After (Single line with \n):**
```
-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIBxxxxx...\nAoGCCqGSM49AwEH...\nxxxxxxxxxxxxx==\n-----END EC PRIVATE KEY-----
```

**Quick Bash Command to Convert:**
```bash
# Replace actual newlines with \n
cat private_key.pem | tr '\n' '\n' | sed 's/$/\\n/g' | tr -d '\n'
```

Or manually:
1. Copy private key
2. Replace every line break with `\n`
3. Result should be one long string

---

### **Step 3: Add to Railway Environment Variables**

1. **Login to Railway:** https://railway.app
2. **Select Your Project:** FarBump
3. **Select Service:** Bumping Worker (the one running `server/bumping-worker.ts`)
4. **Click "Variables" tab**
5. **Add or Update Variables:**

Click **"+ New Variable"** and add:

#### **Variable 1: CDP_API_KEY_NAME**
```
Name:  CDP_API_KEY_NAME
Value: organizations/YOUR_ORG_ID/apiKeys/YOUR_KEY_ID
```
Example: `organizations/a1b2c3d4-e5f6-7890-abcd-ef1234567890/apiKeys/k1m2n3o4-p5q6-7890-stuv-wx1234567890`

#### **Variable 2: CDP_API_KEY_PRIVATE_KEY**
```
Name:  CDP_API_KEY_PRIVATE_KEY
Value: -----BEGIN EC PRIVATE KEY-----\nMHcCAQEE...\n-----END EC PRIVATE KEY-----
```

⚠️ **IMPORTANT:**
- Value must be **single line** with `\n` (not actual line breaks)
- Must include `-----BEGIN EC PRIVATE KEY-----` and `-----END EC PRIVATE KEY-----`
- Must have `\n` after BEGIN line, between content lines, and before END line

6. **Click "Add"** for each variable

---

### **Step 4: Verify Other Required Variables**

While you're in Railway Variables, ensure these are also set:

```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx...

# Base RPC
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org

# 0x API
ZEROX_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# App URL (optional, defaults to localhost)
NEXT_PUBLIC_APP_URL=https://farbump.vercel.app
```

---

### **Step 5: Redeploy Railway Worker**

After adding/updating variables:

1. Railway will **automatically redeploy** the worker
2. Wait 1-2 minutes for deployment to complete
3. Check **"Deployments"** tab to see status

---

### **Step 6: Verify Fix in Logs**

1. Go to Railway **"Logs"** tab
2. You should see:
   ```
   =================================================
   🚀 FarBump Bumping Worker Started
   =================================================
   ✅ CDP Client configured successfully
   ```

3. If authentication is working, you'll see:
   ```
   🔄 [Worker] Processing swap for user 0xYourAddress
   ✅ Swap successful! TX: 0xHash
   ```

4. **NO MORE** `❌ Invalid authentication credentials` errors

---

## 🧪 **Test the Fix:**

1. **Start Bumping** from app
2. **Check Railway Logs** immediately
3. Look for:
   - ✅ `CDP Client configured successfully`
   - ✅ `[Worker] Processing swap`
   - ✅ `Swap successful`
4. **Check Live Activity** in app - should show swap logs

---

## 🐛 **Still Getting Error?**

### **Check 1: Private Key Format**
```bash
# Should have \n, not actual newlines
echo $CDP_API_KEY_PRIVATE_KEY | grep '\\n'
```

If it shows actual line breaks, it's wrong. Reconvert to `\n` format.

### **Check 2: Key Validity**
Test your CDP credentials locally first:

```typescript
import { Coinbase } from "@coinbase/coinbase-sdk"

const privateKey = process.env.CDP_API_KEY_PRIVATE_KEY!.replace(/\\n/g, '\n')

Coinbase.configure({
  apiKeyName: process.env.CDP_API_KEY_NAME!,
  privateKey: privateKey,
})

console.log("✅ CDP configured successfully")
```

If this fails locally, your keys are invalid. Generate new ones from Coinbase Dashboard.

### **Check 3: Railway Logs for Detailed Error**

Railway logs might show more details:
```
❌ Failed to configure CDP Client: [detailed error message]
```

Common errors:
- `Invalid API key format` → Key format is wrong
- `API key not found` → Key Name is incorrect or key was deleted
- `Unauthorized` → Private key doesn't match API Key Name
- `Private key format error` → Private key has wrong format (missing BEGIN/END, or wrong encoding)

### **Check 4: Restart Railway Service**

Sometimes Railway needs a manual restart:
1. Go to Railway Service
2. Click **"Settings"** tab
3. Scroll down to **"Restart"**
4. Click **"Restart"**
5. Wait for service to restart
6. Check logs again

---

## 📋 **Checklist:**

- [ ] Copy CDP credentials from `.env.local` or generate new ones
- [ ] Convert private key to single line with `\n` (not actual line breaks)
- [ ] Add `CDP_API_KEY_NAME` to Railway Variables
- [ ] Add `CDP_API_KEY_PRIVATE_KEY` to Railway Variables (with `\n`)
- [ ] Verify other required variables are present
- [ ] Wait for Railway to auto-redeploy (1-2 minutes)
- [ ] Check Railway logs for `✅ CDP Client configured successfully`
- [ ] Test bumping from app
- [ ] Verify swaps are executing in Railway logs
- [ ] Check Live Activity tab in app for swap logs

---

## 📄 **Related Files:**

- `server/bumping-worker.ts` - Lines 34-47 (CDP configuration)
- `.env.local` - Local environment variables (copy from here)
- `RAILWAY-WORKER-FIXES.md` - General Railway worker documentation

---

**Last Updated:** 2026-01-28
**Issue:** Railway Authentication Error
**Status:** ✅ Fix Available

