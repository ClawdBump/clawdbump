# 🔑 CDP Setup yang Benar - Panduan Lengkap

## ❌ Kesalahan Umum

**JANGAN pakai:**
```bash
NEXT_PUBLIC_CDP_PROJECT_ID=...  # ❌ Salah! Ini untuk client-side
CDP_API_KEY_ID=...              # ❌ Salah! Bukan ini namanya
CDP_API_KEY_SECRET=...          # ❌ Salah! Bukan ini namanya
```

## ✅ Yang Benar

### Method 1: Pakai Environment Variables (Recommended)

**File `.env.local`:**
```bash
# Extract dari file cdp_api_key.json yang di-download
CDP_API_KEY_NAME="organizations/abc-123/apiKeys/xyz-456"
CDP_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIB...your-full-private-key-here...
-----END EC PRIVATE KEY-----"
```

**File `app/api/bot/get-or-create-wallets/route.ts`:**
```typescript
import { Coinbase } from "@coinbase/coinbase-sdk"

// Configure CDP
Coinbase.configure({
  apiKeyName: process.env.CDP_API_KEY_NAME!,
  privateKey: process.env.CDP_PRIVATE_KEY!,
})
```

### Method 2: Pakai File JSON Langsung

**File `cdp_api_key.json` (di root project):**
```json
{
  "name": "organizations/abc-123/apiKeys/xyz-456",
  "privateKey": "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE...\n-----END EC PRIVATE KEY-----"
}
```

**File `app/api/bot/get-or-create-wallets/route.ts`:**
```typescript
import { Coinbase } from "@coinbase/coinbase-sdk"
import path from "path"

// Configure CDP from JSON file
const apiKeyPath = path.join(process.cwd(), "cdp_api_key.json")
Coinbase.configureFromJson(apiKeyPath)
```

**⚠️ IMPORTANT:** Jangan commit `cdp_api_key.json` ke Git!

**File `.gitignore`:**
```
cdp_api_key.json
```

---

## 📦 Instalasi SDK

### Yang Sudah Dilakukan:
```bash
pnpm add @coinbase/coinbase-sdk  # ✅ Sudah terinstall v0.25.0
```

### Jika Error atau Perlu Reinstall:
```bash
pnpm remove @coinbase/coinbase-sdk
pnpm add @coinbase/coinbase-sdk@latest
```

---

## 🔍 Struktur File `cdp_api_key.json`

Saat Anda download dari Coinbase Portal, isi file akan seperti ini:

```json
{
  "name": "organizations/1234567890-abcd-1234-efgh-567890abcdef/apiKeys/0987654321-zyxw-9876-vuts-321098765432",
  "privateKey": "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmn\noAoGCCqGSM49AwEHoUQDQgAE1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZa\nbcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVW==\n-----END EC PRIVATE KEY-----"
}
```

**Extract untuk Environment Variables:**

1. **CDP_API_KEY_NAME** = ambil dari field `"name"`
   ```
   organizations/1234567890-abcd-1234-efgh-567890abcdef/apiKeys/0987654321-zyxw-9876-vuts-321098765432
   ```

2. **CDP_PRIVATE_KEY** = ambil dari field `"privateKey"` 
   ```
   -----BEGIN EC PRIVATE KEY-----
   MHcCAQEEIABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmn
   oAoGCCqGSM49AwEHoUQDQgAE1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZa
   bcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVW==
   -----END EC PRIVATE KEY-----
   ```

---

## 🚀 Cara Setup (Step by Step)

### Option A: Pakai Environment Variables (Recommended untuk Vercel)

1. **Download `cdp_api_key.json`** dari Coinbase Portal

2. **Open file JSON**, copy isinya

3. **Edit `.env.local`:**
   ```bash
   # Paste value dari field "name"
   CDP_API_KEY_NAME="organizations/abc-123/apiKeys/xyz-456"
   
   # Paste value dari field "privateKey"
   # PENTING: Harus multi-line, persis seperti di file JSON
   CDP_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----
   MHcCAQEEIB...baris1...
   oAoGCCqGSM...baris2...
   bcdefghijk...baris3...
   -----END EC PRIVATE KEY-----"
   ```

4. **Restart dev server:**
   ```bash
   pnpm dev
   ```

5. **Test:**
   - Click "Generate Bot Wallet"
   - Check console untuk log CDP

### Option B: Pakai File JSON Langsung (Recommended untuk Development)

1. **Download `cdp_api_key.json`** dari Coinbase Portal

2. **Copy file ke root project:**
   ```
   FarBump/
   ├── cdp_api_key.json  ← Taruh di sini
   ├── app/
   ├── lib/
   └── ...
   ```

3. **Update `.gitignore`:**
   ```bash
   echo "cdp_api_key.json" >> .gitignore
   ```

4. **Update API route untuk pakai JSON file:**
   ```typescript
   import { Coinbase } from "@coinbase/coinbase-sdk"
   import path from "path"
   
   const apiKeyPath = path.join(process.cwd(), "cdp_api_key.json")
   Coinbase.configureFromJson(apiKeyPath)
   ```

5. **Restart dev server:**
   ```bash
   pnpm dev
   ```

---

## 🧪 Testing

### 1. Check Environment Variables
```bash
# Di terminal:
node -e "console.log(process.env.CDP_API_KEY_NAME)"
# Should output: organizations/abc-123/apiKeys/xyz-456

node -e "console.log(process.env.CDP_PRIVATE_KEY?.substring(0, 30))"
# Should output: -----BEGIN EC PRIVATE KEY-----
```

### 2. Test di Console Browser
```javascript
// Setelah click "Generate Bot Wallet", check console:
// ✅ Should see:
// "🔧 Initializing Coinbase CDP SDK..."
// "✅ CDP SDK configured successfully"
// "🚀 Creating 5 bot wallets..."

// ❌ If error:
// "❌ Missing CDP credentials"
// → Check .env.local
```

### 3. Check Database
```sql
-- Di Supabase SQL Editor:
SELECT * FROM wallets_data;
-- Should have 5 rows after successful generation
```

---

## ⚠️ Common Errors & Solutions

### Error: "CDP credentials not configured"

**Penyebab:** Environment variables tidak terbaca

**Solusi:**
```bash
# 1. Check .env.local exists
ls -la .env.local

# 2. Check isinya
cat .env.local | grep CDP

# 3. Restart dev server
pnpm dev
```

### Error: "Invalid private key format"

**Penyebab:** Private key tidak di-copy dengan benar (hilang newline)

**Solusi:**
```bash
# Private key HARUS multi-line di .env.local:
CDP_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----
baris1
baris2
baris3
-----END EC PRIVATE KEY-----"

# BUKAN single-line:
# CDP_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\nbaris1\nbaris2..."  ❌
```

### Error: "File not found: cdp_api_key.json"

**Penyebab:** File JSON tidak ada di root project

**Solusi:**
```bash
# Check file location:
ls -la cdp_api_key.json

# Should be at:
# FarBump/cdp_api_key.json

# NOT at:
# FarBump/app/cdp_api_key.json  ❌
```

---

## 🔒 Security Checklist

- [ ] `.env.local` tidak di-commit ke Git
- [ ] `cdp_api_key.json` tidak di-commit ke Git
- [ ] `.gitignore` sudah include kedua file tersebut
- [ ] Vercel environment variables sudah di-set (untuk production)
- [ ] Private key tidak di-share ke siapapun
- [ ] API key di-rotate secara berkala

---

## 🎯 Recommendation

**Untuk Development:**
- ✅ Pakai Method 2 (JSON file langsung)
- Lebih mudah, tidak perlu copy-paste multi-line

**Untuk Production (Vercel):**
- ✅ Pakai Method 1 (Environment Variables)
- Set di Vercel Dashboard → Settings → Environment Variables

---

## 📚 Dokumentasi Resmi

- **CDP SDK:** https://docs.cdp.coinbase.com/
- **API Keys:** https://docs.cdp.coinbase.com/get-started/docs/cdp-api-keys/
- **Server Wallets:** https://docs.cdp.coinbase.com/server-wallets/docs/

---

## ✅ Checklist Final

Sebelum test, pastikan:

- [ ] `@coinbase/coinbase-sdk` sudah terinstall (check `package.json`)
- [ ] File `cdp_api_key.json` sudah di-download dari Coinbase Portal
- [ ] `.env.local` sudah ada dan berisi `CDP_API_KEY_NAME` + `CDP_PRIVATE_KEY`
- [ ] **ATAU** file `cdp_api_key.json` sudah di-copy ke root project
- [ ] `.gitignore` sudah include `cdp_api_key.json` dan `.env.local`
- [ ] Dev server sudah di-restart (`pnpm dev`)
- [ ] Database sudah di-setup (run `DATABASE-CDP-SMART-ACCOUNTS.sql`)

**Siap test!** 🚀





