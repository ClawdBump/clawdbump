# 🔐 Telegram Mini App Authentication Implementation

## 📋 Overview

Implementasi autentikasi yang aman untuk Telegram Mini App (TMA) FarBump menggunakan:
- **Telegram initData verification** (HMAC-SHA256)
- **Privy Smart Account** untuk wallet management
- **Supabase** untuk data storage

---

## 🏗️ Architecture

### **Flow:**

1. **User membuka Mini App di Telegram**
   - Telegram menyediakan `initData` via `window.Telegram.WebApp.initData`

2. **Frontend mengirim initData ke backend**
   - Endpoint: `GET /api/v1/auth/telegram/verify?initData=...`
   - Backend verify initData menggunakan HMAC-SHA256

3. **Backend verify initData:**
   - Extract `telegram_id` dari initData
   - Check database apakah user sudah login
   - Return data user jika sudah login, atau `is_valid: false` jika belum

4. **Jika user baru:**
   - User login via Privy
   - Privy create Smart Wallet
   - Frontend update wallet address ke database via `POST /api/v1/auth/telegram/update-wallet`

5. **Jika user sudah login:**
   - Frontend initialize Privy dengan `privy_did` dari database
   - User langsung bisa menggunakan app

---

## 🔧 Backend Implementation

### **1. Utility Function: `lib/telegram-initdata-verify.ts`**

Fungsi untuk verify Telegram initData menggunakan HMAC-SHA256:

```typescript
import crypto from "crypto"

export function verifyTelegramInitData(
  initData: string,
  botToken: string
): { isValid: boolean; data?: Record<string, string>; error?: string }
```

**Algorithm:**
1. Parse initData string (format: `key=value&key=value&hash=...`)
2. Extract hash dari initData
3. Remove hash dari params
4. Sort parameters alphabetically
5. Create `data_check_string`: `key=value\nkey=value...`
6. Create `secret_key`: `HMAC-SHA256(bot_token, "WebAppData")`
7. Calculate hash: `HMAC-SHA256(data_check_string, secret_key)`
8. Compare calculated hash dengan provided hash

**Usage:**
```typescript
import { verifyTelegramInitData, extractTelegramId, extractUserData } from "@/lib/telegram-initdata-verify"

const verification = verifyTelegramInitData(initData, botToken)
if (verification.isValid) {
  const telegramId = extractTelegramId(verification.data!)
  const userData = extractUserData(verification.data!)
}
```

---

### **2. Verify Endpoint: `GET /api/v1/auth/telegram/verify`**

**Request:**
```
GET /api/v1/auth/telegram/verify?initData={raw_initData_string}
```

**Response (User Logged In):**
```json
{
  "success": true,
  "is_valid": true,
  "telegram_id": "123456789",
  "smart_account_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "privy_user_id": "did:privy:abc123",
  "telegram_username": "john_doe",
  "last_login_at": "2024-01-01T00:00:00Z"
}
```

**Response (User Not Logged In):**
```json
{
  "success": true,
  "is_valid": false,
  "telegram_id": "123456789",
  "telegram_username": "john_doe",
  "first_name": "John",
  "last_name": "Doe",
  "photo_url": "https://...",
  "message": "User has not logged in to FarBump via Privy. Please login first."
}
```

**Error Responses:**
- `400`: Missing or invalid initData
- `401`: Invalid initData hash (tampered)
- `500`: Internal server error

---

### **3. Update Wallet Endpoint: `POST /api/v1/auth/telegram/update-wallet`**

**Request:**
```json
{
  "initData": "raw_initData_string",
  "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "privy_user_id": "did:privy:abc123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet address updated successfully",
  "data": {
    "telegram_id": "123456789",
    "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "privy_user_id": "did:privy:abc123",
    "last_login_at": "2024-01-01T00:00:00Z"
  }
}
```

**Security:**
- Verify initData sebelum update
- Extract telegram_id dari initData
- Upsert ke database (create or update)

---

## 💻 Frontend Implementation

### **1. Hook: `hooks/use-telegram-miniapp-auth.ts`**

Hook untuk handle Telegram Mini App authentication:

```typescript
const {
  isTelegramWebApp,        // true if in Telegram Mini App
  isVerified,              // true if user is verified and logged in
  telegramId,              // Telegram user ID
  walletAddress,           // Smart Wallet address
  privyUserId,             // Privy user ID
  isLoading,               // Loading state
  error,                   // Error message
  initData,                // Raw initData string
  verifyInitData,          // Manual verify function
  updateWalletToDatabase,  // Update wallet function
} = useTelegramMiniAppAuth()
```

**Features:**
- Auto-detect Telegram Mini App environment
- Auto-get initData from `window.Telegram.WebApp.initData`
- Auto-verify initData dengan backend
- Auto-update wallet ke database setelah Privy create wallet
- Watch Privy wallet creation dan update database

---

### **2. Usage in `app/page.tsx`**

```typescript
import { useTelegramMiniAppAuth } from "@/hooks/use-telegram-miniapp-auth"

export default function BumpBotDashboard() {
  const { ready, authenticated, user, createWallet } = usePrivy()
  
  // Telegram Mini App authentication
  const {
    isTelegramWebApp,
    isVerified: isTelegramVerified,
    telegramId: telegramMiniAppId,
    walletAddress: telegramWalletAddress,
    isLoading: isTelegramLoading,
    error: telegramError,
  } = useTelegramMiniAppAuth()

  // Hook akan otomatis:
  // 1. Detect Telegram Mini App
  // 2. Get initData
  // 3. Verify dengan backend
  // 4. Update wallet ke database setelah Privy create wallet
}
```

---

## 🔒 Security

### **1. initData Verification**

**Why it's secure:**
- Telegram signs initData dengan bot token
- Hash verification prevents tampering
- Only valid initData from Telegram can pass verification

**Algorithm:**
```
1. Parse initData: key=value&key=value&hash=abc123...
2. Extract hash
3. Remove hash from params
4. Sort params alphabetically
5. Create data_check_string: key=value\nkey=value...
6. Create secret_key: HMAC-SHA256(bot_token, "WebAppData")
7. Calculate hash: HMAC-SHA256(data_check_string, secret_key)
8. Compare with provided hash
```

---

### **2. Database Security**

**RLS (Row Level Security):**
- Service role can manage all records (for API routes)
- Users can read their own mapping (optional)

**Data Validation:**
- telegram_id must be numeric string
- wallet_address must be valid Ethereum address
- initData must be verified before database operations

---

### **3. No API Keys Needed**

**Removed:**
- ❌ `FARBUMP_API_KEY`
- ❌ `FARBUMP_JWT_SECRET`

**Security relies on:**
- ✅ Telegram initData verification (HMAC-SHA256)
- ✅ User login auth via Privy
- ✅ Database RLS policies

---

## 📊 Database Schema

**Table: `telegram_user_mappings`**

```sql
CREATE TABLE telegram_user_mappings (
  id BIGSERIAL PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  telegram_username TEXT,
  privy_user_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 🧪 Testing

### **1. Test initData Verification**

```bash
# Get initData from Telegram Mini App
# In browser console:
window.Telegram.WebApp.initData

# Test endpoint:
curl "http://localhost:3000/api/v1/auth/telegram/verify?initData=YOUR_INIT_DATA"
```

---

### **2. Test Update Wallet**

```bash
curl -X POST "http://localhost:3000/api/v1/auth/telegram/update-wallet" \
  -H "Content-Type: application/json" \
  -d '{
    "initData": "YOUR_INIT_DATA",
    "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "privy_user_id": "did:privy:abc123"
  }'
```

---

## 🚀 Deployment

### **Environment Variables:**

```env
# Telegram Bot Token (from BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Privy (already configured)
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
```

---

## 📝 Flow Diagram

```
┌─────────────────┐
│  Telegram Mini  │
│      App         │
└────────┬────────┘
         │
         │ 1. User opens Mini App
         │    window.Telegram.WebApp.initData
         ▼
┌─────────────────┐
│    Frontend      │
│  (React Hook)    │
└────────┬────────┘
         │
         │ 2. Send initData to backend
         │    GET /api/v1/auth/telegram/verify?initData=...
         ▼
┌─────────────────┐
│    Backend       │
│  (Next.js API)   │
└────────┬────────┘
         │
         │ 3. Verify initData (HMAC-SHA256)
         │    Extract telegram_id
         │    Check database
         ▼
┌─────────────────┐
│    Supabase      │
│    Database      │
└────────┬────────┘
         │
         │ 4. Return user data or is_valid: false
         ▼
┌─────────────────┐
│    Frontend      │
└────────┬────────┘
         │
         │ 5a. If user exists: Initialize Privy
         │ 5b. If new user: Login via Privy → Create Wallet
         │
         │ 6. Update wallet to database
         │    POST /api/v1/auth/telegram/update-wallet
         ▼
┌─────────────────┐
│    Supabase      │
│    Database      │
└─────────────────┘
```

---

## ✅ Checklist

- [x] Create `lib/telegram-initdata-verify.ts` utility
- [x] Update `GET /api/v1/auth/telegram/verify` endpoint
- [x] Create `POST /api/v1/auth/telegram/update-wallet` endpoint
- [x] Create `hooks/use-telegram-miniapp-auth.ts` hook
- [x] Integrate hook into `app/page.tsx`
- [x] Remove `FARBUMP_API_KEY` and `FARBUMP_JWT_SECRET` dependencies
- [x] Add comprehensive documentation

---

## 🎯 Summary

**Authentication Flow:**
1. ✅ Telegram Mini App provides `initData`
2. ✅ Frontend sends `initData` to backend
3. ✅ Backend verifies `initData` using HMAC-SHA256
4. ✅ Backend checks database for user
5. ✅ If user exists: Return data
6. ✅ If new user: Login via Privy → Create Wallet → Update database

**Security:**
- ✅ initData verification prevents tampering
- ✅ No API keys needed
- ✅ Database RLS policies
- ✅ User login auth via Privy

**Simple, secure, and Telegram-native!** 🚀

