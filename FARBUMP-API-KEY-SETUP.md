# 🔑 FarBump API Key Setup Guide

## 📋 Overview

`FARBUMP_API_KEY` dan `FARBUMP_JWT_SECRET` adalah **secret keys yang Anda buat sendiri**, bukan dari service eksternal. Ini digunakan untuk autentikasi bot requests ke FarBump API.

---

## 🔐 **Cara Mendapatkan API Keys**

### **Option 1: Generate dengan OpenSSL (Recommended)**

**Windows (PowerShell):**
```powershell
# Generate FARBUMP_API_KEY (32 bytes = 64 hex characters)
openssl rand -hex 32

# Generate FARBUMP_JWT_SECRET (32 bytes = 64 hex characters)
openssl rand -hex 32
```

**Mac/Linux:**
```bash
# Generate FARBUMP_API_KEY
openssl rand -hex 32

# Generate FARBUMP_JWT_SECRET
openssl rand -hex 32
```

**Output Example:**
```
FARBUMP_API_KEY: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
FARBUMP_JWT_SECRET: f9e8d7c6b5a4g3h2i1j0k9l8m7n6o5p4q3r2s1t0u9v8w7x6y5z4a3b2c1d0e9f8
```

---

### **Option 2: Generate dengan Node.js**

**Buat file temporary `generate-keys.js`:**
```javascript
const crypto = require('crypto')

// Generate FARBUMP_API_KEY
const apiKey = crypto.randomBytes(32).toString('hex')
console.log('FARBUMP_API_KEY:', apiKey)

// Generate FARBUMP_JWT_SECRET
const jwtSecret = crypto.randomBytes(32).toString('hex')
console.log('FARBUMP_JWT_SECRET:', jwtSecret)
```

**Run:**
```bash
node generate-keys.js
```

**Output:**
```
FARBUMP_API_KEY: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
FARBUMP_JWT_SECRET: f9e8d7c6b5a4g3h2i1j0k9l8m7n6o5p4q3r2s1t0u9v8w7x6y5z4a3b2c1d0e9f8
```

**Hapus file setelah digunakan:**
```bash
rm generate-keys.js  # Mac/Linux
del generate-keys.js  # Windows
```

---

### **Option 3: Generate dengan Online Tool (Less Secure)**

**⚠️ WARNING:** Hanya gunakan untuk testing, jangan untuk production!

1. Buka: https://www.random.org/strings/
2. Settings:
   - Length: 64
   - Characters: Hexadecimal (0-9, a-f)
   - Generate 2 strings
3. Copy hasil sebagai `FARBUMP_API_KEY` dan `FARBUMP_JWT_SECRET`

---

### **Option 4: Manual (Simple String)**

**⚠️ WARNING:** Kurang secure, hanya untuk development/testing!

```env
FARBUMP_API_KEY=my-secret-api-key-12345
FARBUMP_JWT_SECRET=my-jwt-secret-67890
```

**Note:** Untuk production, gunakan random keys yang panjang (minimal 32 characters).

---

## 📝 **Setup Environment Variables**

### **1. Local Development (.env.local)**

**File:** `.env.local` (di root project)

```env
# FarBump API Keys for Bot Authentication
FARBUMP_API_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
FARBUMP_JWT_SECRET=f9e8d7c6b5a4g3h2i1j0k9l8m7n6o5p4q3r2s1t0u9v8w7x6y5z4a3b2c1d0e9f8
```

**Important:**
- ✅ File `.env.local` sudah di-ignore oleh Git (tidak akan ter-commit)
- ✅ Jangan commit file ini ke repository
- ✅ Jangan share keys dengan siapa pun

---

### **2. Vercel (Production)**

**Via Vercel Dashboard:**

1. Login ke [Vercel Dashboard](https://vercel.com/dashboard)
2. Pilih project **FarBump**
3. Buka **Settings** → **Environment Variables**
4. Tambahkan variables:

   **Variable 1:**
   - **Name:** `FARBUMP_API_KEY`
   - **Value:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`
   - **Environment:** Production, Preview, Development (semua)
   - **Save**

   **Variable 2:**
   - **Name:** `FARBUMP_JWT_SECRET`
   - **Value:** `f9e8d7c6b5a4g3h2i1j0k9l8m7n6o5p4q3r2s1t0u9v8w7x6y5z4a3b2c1d0e9f8`
   - **Environment:** Production, Preview, Development (semua)
   - **Save**

5. **Redeploy** aplikasi untuk apply changes

---

**Via Vercel CLI:**

```bash
# Install Vercel CLI (jika belum)
npm i -g vercel

# Login
vercel login

# Add environment variables
vercel env add FARBUMP_API_KEY
# Paste value ketika diminta

vercel env add FARBUMP_JWT_SECRET
# Paste value ketika diminta

# Pull environment variables (optional)
vercel env pull .env.local
```

---

### **3. Railway (Jika menggunakan Railway Worker)**

**Via Railway Dashboard:**

1. Login ke [Railway Dashboard](https://railway.app/)
2. Pilih project **FarBump**
3. Buka **Variables** tab
4. Tambahkan variables:

   **Variable 1:**
   - **Key:** `FARBUMP_API_KEY`
   - **Value:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`
   - **Save**

   **Variable 2:**
   - **Key:** `FARBUMP_JWT_SECRET`
   - **Value:** `f9e8d7c6b5a4g3h2i1j0k9l8m7n6o5p4q3r2s1t0u9v8w7x6y5z4a3b2c1d0e9f8`
   - **Save**

5. Railway akan **auto-redeploy** setelah variables ditambahkan

---

## 🔒 **Security Best Practices**

### **1. Key Length**

**Minimum:**
- `FARBUMP_API_KEY`: 32 characters (64 hex)
- `FARBUMP_JWT_SECRET`: 32 characters (64 hex)

**Recommended:**
- `FARBUMP_API_KEY`: 64 characters (128 hex)
- `FARBUMP_JWT_SECRET`: 64 characters (128 hex)

---

### **2. Key Storage**

**✅ DO:**
- Store di environment variables
- Use `.env.local` untuk local development
- Use Vercel/Railway environment variables untuk production
- Rotate keys periodically (every 3-6 months)
- Use different keys for development and production

**❌ DON'T:**
- Commit keys ke Git
- Share keys via email/messaging
- Hardcode keys di source code
- Use same keys for multiple projects
- Use weak/predictable keys

---

### **3. Key Rotation**

**When to rotate:**
- Every 3-6 months
- If key is compromised
- If team member leaves
- After security incident

**How to rotate:**
1. Generate new keys
2. Update environment variables
3. Update bot configuration (ClawdBumpbot)
4. Test new keys
5. Remove old keys

---

## 📋 **Quick Setup Checklist**

### **Step 1: Generate Keys**

- [ ] Generate `FARBUMP_API_KEY` (64 hex characters)
- [ ] Generate `FARBUMP_JWT_SECRET` (64 hex characters)
- [ ] Save keys securely (password manager, notes app)

---

### **Step 2: Local Development**

- [ ] Add keys to `.env.local`
- [ ] Restart development server
- [ ] Test endpoint: `GET /api/v1/auth/telegram/verify`

---

### **Step 3: Production (Vercel)**

- [ ] Add `FARBUMP_API_KEY` to Vercel environment variables
- [ ] Add `FARBUMP_JWT_SECRET` to Vercel environment variables
- [ ] Redeploy application
- [ ] Test endpoint in production

---

### **Step 4: Bot Configuration**

- [ ] Update ClawdBumpbot with `FARBUMP_API_KEY`
- [ ] Test bot integration
- [ ] Verify authentication works

---

## 🧪 **Testing**

### **Test API Key:**

```bash
# Replace with your actual telegram_id and API key
curl -X GET "http://localhost:3000/api/v1/auth/telegram/verify?telegram_id=123456789" \
  -H "Authorization: Bearer YOUR_FARBUMP_API_KEY"
```

**Expected Response (if user logged in):**
```json
{
  "success": true,
  "is_valid": true,
  "smart_account_address": "0x...",
  "privy_user_id": "did:privy:...",
  "auth_token": "eyJ..."
}
```

**Expected Response (if invalid API key):**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

---

## 🔍 **Troubleshooting**

### **Issue: "FARBUMP_API_KEY not configured"**

**Error:**
```json
{
  "success": false,
  "error": "Server configuration error",
  "message": "API key authentication is not configured"
}
```

**Fix:**
1. Check environment variable is set: `echo $FARBUMP_API_KEY` (Mac/Linux) or `echo %FARBUMP_API_KEY%` (Windows)
2. Add to `.env.local` for local development
3. Add to Vercel/Railway for production
4. Restart server after adding variables

---

### **Issue: "Invalid API key"**

**Error:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

**Fix:**
1. Verify API key in request header matches environment variable
2. Check for extra spaces or characters
3. Ensure using `Bearer ` prefix: `Authorization: Bearer {KEY}`
4. Verify key is correct in bot configuration

---

### **Issue: JWT Token Invalid**

**Possible Causes:**
- `FARBUMP_JWT_SECRET` not set (defaults to `FARBUMP_API_KEY`)
- Secret mismatch between generation and verification
- Token expired (24 hours)

**Fix:**
1. Set `FARBUMP_JWT_SECRET` explicitly
2. Use same secret for generation and verification
3. Generate new token if expired

---

## 📚 **Related Documentation**

- `TELEGRAM-VERIFY-ENDPOINT.md` - Endpoint documentation
- `CLAWDBUMPBOT-INTEGRATION-GUIDE.md` - Bot integration guide

---

## ✅ **Summary**

**FARBUMP_API_KEY dan FARBUMP_JWT_SECRET:**
- ✅ **Bukan dari service eksternal** - Anda buat sendiri
- ✅ **Generate dengan:** `openssl rand -hex 32` (recommended)
- ✅ **Store di:** Environment variables (`.env.local`, Vercel, Railway)
- ✅ **Length:** Minimum 32 characters (64 hex), recommended 64 characters (128 hex)
- ✅ **Security:** Jangan commit ke Git, rotate periodically

**Quick Start:**
1. Generate keys: `openssl rand -hex 32`
2. Add to `.env.local` for local
3. Add to Vercel for production
4. Update bot configuration
5. Test endpoint

---

## 🎯 **Next Steps**

1. **Generate keys** menggunakan salah satu method di atas
2. **Add to environment variables** (local & production)
3. **Test endpoint** untuk verify keys bekerja
4. **Update bot** (ClawdBumpbot) dengan API key
5. **Test bot integration** end-to-end

