# 🚀 Telegram Mini App Authentication - Quick Start

## 📋 Overview

Implementasi autentikasi yang aman untuk Telegram Mini App menggunakan:
- ✅ **Telegram initData verification** (HMAC-SHA256)
- ✅ **Privy Smart Account** untuk wallet management
- ✅ **Supabase** untuk data storage

---

## 🔧 Files Created/Updated

### **Backend:**

1. **`lib/telegram-initdata-verify.ts`**
   - Utility function untuk verify Telegram initData
   - Functions: `verifyTelegramInitData()`, `extractTelegramId()`, `extractUserData()`

2. **`app/api/v1/auth/telegram/verify/route.ts`** (Updated)
   - Endpoint untuk verify initData dan return user data
   - Method: `GET /api/v1/auth/telegram/verify?initData=...`

3. **`app/api/v1/auth/telegram/update-wallet/route.ts`** (New)
   - Endpoint untuk update wallet address setelah Privy create wallet
   - Method: `POST /api/v1/auth/telegram/update-wallet`

### **Frontend:**

4. **`hooks/use-telegram-miniapp-auth.ts`** (New)
   - React hook untuk handle Telegram Mini App authentication
   - Auto-detect Telegram Mini App, verify initData, update wallet

5. **`app/page.tsx`** (Updated)
   - Integrated `useTelegramMiniAppAuth` hook

---

## 🔑 Environment Variables

**Required:**
```env
# Telegram Bot Token (from BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Removed (No longer needed):**
- ❌ `FARBUMP_API_KEY`
- ❌ `FARBUMP_JWT_SECRET`

---

## 📥 API Endpoints

### **1. Verify initData**

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
  "message": "User has not logged in to FarBump via Privy. Please login first."
}
```

---

### **2. Update Wallet**

```
POST /api/v1/auth/telegram/update-wallet
Content-Type: application/json

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

---

## 💻 Frontend Usage

### **Hook Usage:**

```typescript
import { useTelegramMiniAppAuth } from "@/hooks/use-telegram-miniapp-auth"

export default function MyComponent() {
  const {
    isTelegramWebApp,        // true if in Telegram Mini App
    isVerified,              // true if user is verified and logged in
    telegramId,              // Telegram user ID
    walletAddress,           // Smart Wallet address
    privyUserId,             // Privy user ID
    isLoading,               // Loading state
    error,                   // Error message
  } = useTelegramMiniAppAuth()

  // Hook automatically:
  // 1. Detects Telegram Mini App environment
  // 2. Gets initData from window.Telegram.WebApp.initData
  // 3. Verifies initData with backend
  // 4. Updates wallet to database after Privy creates wallet
}
```

---

## 🔒 Security

### **initData Verification:**

**Algorithm:**
1. Parse initData: `key=value&key=value&hash=abc123...`
2. Extract hash
3. Remove hash from params
4. Sort params alphabetically
5. Create `data_check_string`: `key=value\nkey=value...`
6. Create `secret_key`: `HMAC-SHA256(bot_token, "WebAppData")`
7. Calculate hash: `HMAC-SHA256(data_check_string, secret_key)`
8. Compare with provided hash

**Why it's secure:**
- ✅ Telegram signs initData dengan bot token
- ✅ Hash verification prevents tampering
- ✅ Only valid initData from Telegram can pass verification

---

## 🧪 Testing

### **1. Get initData from Telegram Mini App:**

```javascript
// In browser console (when in Telegram Mini App):
window.Telegram.WebApp.initData
```

### **2. Test Verify Endpoint:**

```bash
curl "http://localhost:3000/api/v1/auth/telegram/verify?initData=YOUR_INIT_DATA"
```

### **3. Test Update Wallet:**

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

## 📊 Flow Diagram

```
User opens Telegram Mini App
    ↓
Frontend gets initData from window.Telegram.WebApp.initData
    ↓
Frontend sends initData to GET /api/v1/auth/telegram/verify
    ↓
Backend verifies initData (HMAC-SHA256)
    ↓
Backend checks database for user
    ↓
If user exists:
    → Return user data (wallet_address, privy_user_id)
    → Frontend initializes Privy
    → User can use app

If new user:
    → Return is_valid: false
    → User logs in via Privy
    → Privy creates Smart Wallet
    → Frontend calls POST /api/v1/auth/telegram/update-wallet
    → Database updated
    → User can use app
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

