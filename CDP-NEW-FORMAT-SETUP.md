# CDP New Format Setup Guide (2026)

## ✅ **Kode Sudah Diupdate!**

Railway worker telah diupdate untuk support **format baru CDP API key** dari https://portal.cdp.coinbase.com/

---

## 📄 **Format JSON Baru (2026):**

Ketika Anda download JSON dari CDP Portal, format nya sekarang:

```json
{
   "id": "60f8fbe5-b356-4451-a3c9-ae2a90685cc0",
   "privateKey": "6q0NlI1WcvnWPeOUSrYmmnh6ufAXA1GvGMQ5RI8lLaSkWBJdO9rkhqpV63CxSCZjS2M+HEWj3SlCqrU1RmMmTg=="
}
```

**Perubahan dari format lama:**
- ❌ OLD: `"name": "organizations/{org_id}/apiKeys/{key_id}"`
- ✅ NEW: `"id": "{key_id}"`

- ❌ OLD: `"privateKey": "-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"`
- ✅ NEW: `"privateKey": "base64string=="`

---

## 🚀 **Setup Steps:**

### **Step 1: Gunakan Nilai dari JSON File**

Dari file `cdp_api_key.json` yang Anda download:

**Value 1 - API Key ID:**
```
60f8fbe5-b356-4451-a3c9-ae2a90685cc0
```

**Value 2 - Private Key (base64):**
```
6q0NlI1WcvnWPeOUSrYmmnh6ufAXA1GvGMQ5RI8lLaSkWBJdO9rkhqpV63CxSCZjS2M+HEWj3SlCqrU1RmMmTg==
```

### **Step 2: Update `.env.local`**

```bash
# Coinbase Developer Platform (CDP) API Credentials
# New format (2026) - from portal.cdp.coinbase.com
CDP_API_KEY_NAME="60f8fbe5-b356-4451-a3c9-ae2a90685cc0"
CDP_API_KEY_PRIVATE_KEY="6q0NlI1WcvnWPeOUSrYmmnh6ufAXA1GvGMQ5RI8lLaSkWBJdO9rkhqpV63CxSCZjS2M+HEWj3SlCqrU1RmMmTg=="
```

⚠️ **PENTING:** 
- Gunakan field `"id"` untuk `CDP_API_KEY_NAME`
- Gunakan field `"privateKey"` untuk `CDP_API_KEY_PRIVATE_KEY`
- Copy paste **persis** seperti di JSON (base64 format, no need to convert)

### **Step 3: Test Locally**

```bash
npm run dev
```

Coba start bumping. Check console untuk:
```
✅ CDP Client configured successfully
   API Key ID: 60f8fbe5-b356-4451...
```

### **Step 4: Update Railway**

1. Go to: https://railway.app
2. Select **FarBump Worker** service
3. Click **"Variables"** tab
4. Add/Update variables:

```
CDP_API_KEY_NAME = 60f8fbe5-b356-4451-a3c9-ae2a90685cc0

CDP_API_KEY_PRIVATE_KEY = 6q0NlI1WcvnWPeOUSrYmmnh6ufAXA1GvGMQ5RI8lLaSkWBJdO9rkhqpV63CxSCZjS2M+HEWj3SlCqrU1RmMmTg==
```

5. Wait for auto-redeploy (1-2 minutes)

### **Step 5: Update Vercel**

1. Go to: https://vercel.com/your-project/settings/environment-variables
2. Update variables (same as Railway):

```
CDP_API_KEY_NAME = 60f8fbe5-b356-4451-a3c9-ae2a90685cc0

CDP_API_KEY_PRIVATE_KEY = 6q0NlI1WcvnWPeOUSrYmmnh6ufAXA1GvGMQ5RI8lLaSkWBJdO9rkhqpV63CxSCZjS2M+HEWj3SlCqrU1RmMmTg==
```

3. Redeploy Vercel

### **Step 6: Verify Railway Worker**

Check Railway Logs untuk:

```
=================================================
🚀 FarBump Bumping Worker Started
=================================================
✅ CDP Client configured successfully
   API Key ID: 60f8fbe5-b356-4451...
```

Jika berhasil, Anda akan melihat:
```
🔄 [Worker] Processing swap for user 0xYourAddress
✅ Swap successful! TX: 0xHash
```

**NO MORE** `❌ Invalid authentication credentials` errors! 🎉

---

## 🔧 **Backward Compatibility:**

Kode sekarang **support both formats**:

✅ **Old Format (PEM):** Still works
```bash
CDP_API_KEY_NAME="organizations/xxx/apiKeys/xxx"
CDP_API_KEY_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"
```

✅ **New Format (Base64):** Now supported
```bash
CDP_API_KEY_NAME="60f8fbe5-b356-4451-a3c9-ae2a90685cc0"
CDP_API_KEY_PRIVATE_KEY="6q0NlI1WcvnWPeOUSrYmmnh6ufAXA1GvGMQ5RI8lLaSkWBJdO9rkhqpV63CxSCZjS2M+HEWj3SlCqrU1RmMmTg=="
```

---

## 📋 **Checklist:**

- [x] Kode updated untuk support format baru
- [ ] Download `cdp_api_key.json` dari https://portal.cdp.coinbase.com/
- [ ] Copy field `"id"` → `CDP_API_KEY_NAME`
- [ ] Copy field `"privateKey"` → `CDP_API_KEY_PRIVATE_KEY`
- [ ] Update `.env.local`
- [ ] Test locally dengan `npm run dev`
- [ ] Update Railway variables
- [ ] Update Vercel variables
- [ ] Verify Railway logs show `✅ CDP Client configured successfully`
- [ ] Test bumping from app
- [ ] Check Railway logs for swap execution

---

## 🐛 **Troubleshooting:**

### **Issue: Still getting "Invalid authentication credentials"**

**Check:**
1. Apakah Anda copy paste **exact values** dari JSON file?
2. Apakah ada extra spaces atau quotes?
3. Check Railway logs untuk detailed error:
   ```
   ❌ Failed to configure CDP Client: [error message]
      API Key Name format: 60f8fbe5-b356-4451...
      Private Key format: 6q0NlI1WcvnWPeOUSr...
   ```

### **Issue: Private key format error**

Pastikan:
- Private key adalah **base64 string** (tanpa spaces atau line breaks)
- Ends with `==` (typical base64 padding)
- Length sekitar 88 characters

### **Issue: API key not found**

Pastikan:
- API key belum di-delete dari CDP Portal
- API key punya permissions yang benar:
  - ✅ Create Smart Accounts
  - ✅ Execute Transactions
  - ✅ Read Accounts

---

## 📚 **Related Files:**

- `server/bumping-worker.ts` - Lines 31-56 (CDP configuration with new format support)
- `cdp_api_key.json` - Downloaded from CDP Portal
- `.env.local` - Local environment variables
- `RAILWAY-AUTH-FIX.md` - General authentication troubleshooting

---

**Last Updated:** 2026-01-28
**CDP Format Version:** 2026 (New)
**Status:** ✅ Ready to Use

