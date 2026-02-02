# 🔄 Database Column Mapping - Telegram User Mappings

## 📋 Overview

Dokumen ini menjelaskan mapping antara variabel di kode dan kolom di database Supabase `telegram_user_mappings`.

---

## 🗄️ Database Schema

**Table:** `telegram_user_mappings`

```sql
CREATE TABLE telegram_user_mappings (
  id BIGSERIAL PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,        -- Telegram user ID (TEXT, not BigInt)
  telegram_username TEXT,                  -- Telegram username (optional)
  privy_user_id TEXT NOT NULL,             -- Privy user ID (DID) - NOT privy_did
  wallet_address TEXT NOT NULL,            -- Smart Wallet address
  first_name TEXT,                         -- Telegram first name
  last_name TEXT,                          -- Telegram last name
  photo_url TEXT,                          -- Telegram profile photo URL
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Important Notes:**
- ✅ `telegram_id` is **TEXT** (not BigInt) - supports very long Telegram IDs
- ✅ All column names use **snake_case**
- ✅ Column name is `privy_user_id` (NOT `privy_did`)

---

## 🔄 Frontend to Backend Mapping

### **Frontend (camelCase):**
```typescript
{
  telegramId: "123456789",
  walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  privyUserId: "did:privy:abc123"
}
```

### **Backend (snake_case for database):**
```typescript
{
  telegram_id: "123456789",      // Mapped from telegramId
  wallet_address: "0x...",        // Mapped from walletAddress
  privy_user_id: "did:privy:..." // Mapped from privyUserId
}
```

---

## 📝 Code Mapping

### **1. Frontend Hook (`hooks/use-telegram-miniapp-auth.ts`)**

**Sends to backend:**
```typescript
body: JSON.stringify({
  telegram_id: String(tgId),           // snake_case, string type
  wallet_address: walletAddr.toLowerCase(), // snake_case, normalized
  privy_user_id: String(privyId),       // snake_case, string type
})
```

---

### **2. Backend Endpoint (`app/api/v1/auth/telegram/upsert-wallet/route.ts`)**

**Accepts both formats (camelCase or snake_case):**
```typescript
const telegram_id = body.telegram_id || body.telegramId
const wallet_address = body.wallet_address || body.walletAddress
const privy_user_id = body.privy_user_id || body.privyUserId || body.privy_did
```

**Upserts to database (snake_case only):**
```typescript
const upsertData = {
  telegram_id: String(telegram_id),      // TEXT type
  wallet_address: normalizedWalletAddress, // TEXT type, lowercase
  privy_user_id: String(privy_user_id),   // TEXT type
  is_active: true,
  last_login_at: new Date().toISOString(),
}
```

---

## ✅ Column Name Verification

### **Correct (snake_case):**
- ✅ `telegram_id` - matches database
- ✅ `wallet_address` - matches database
- ✅ `privy_user_id` - matches database (NOT `privy_did`)

### **Incorrect (camelCase in database operations):**
- ❌ `telegramId` - should be `telegram_id`
- ❌ `walletAddress` - should be `wallet_address`
- ❌ `privyUserId` - should be `privy_user_id`
- ❌ `privy_did` - should be `privy_user_id`

---

## 🔍 Type Verification

### **telegram_id:**
- **Database Type:** `TEXT` (not BigInt)
- **Reason:** Telegram IDs can be very long (up to 19 digits)
- **Code:** `String(telegram_id)` - ensure string type

### **wallet_address:**
- **Database Type:** `TEXT`
- **Format:** `0x` + 40 hex characters (lowercase)
- **Code:** `wallet_address.toLowerCase()`

### **privy_user_id:**
- **Database Type:** `TEXT`
- **Format:** `did:privy:...` (DID format)
- **Code:** `String(privy_user_id)` - ensure string type

---

## 🧪 Testing

### **Test Request:**
```bash
curl -X POST "http://localhost:3000/api/v1/auth/telegram/upsert-wallet" \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": "123456789",
    "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "privy_user_id": "did:privy:abc123"
  }'
```

### **Expected Database Record:**
```sql
SELECT * FROM telegram_user_mappings WHERE telegram_id = '123456789';

-- Result:
-- id: 1
-- telegram_id: '123456789' (TEXT)
-- wallet_address: '0x742d35cc6634c0532925a3b844bc9e7595f0beb' (lowercase)
-- privy_user_id: 'did:privy:abc123' (TEXT)
-- is_active: true
-- last_login_at: '2024-01-01T00:00:00Z'
```

---

## 🐛 Common Issues

### **Issue 1: Column name mismatch**

**Error:**
```
column "telegramId" does not exist
```

**Solution:**
- Use `telegram_id` (snake_case) not `telegramId` (camelCase)

---

### **Issue 2: Type mismatch**

**Error:**
```
invalid input syntax for type bigint: "123456789"
```

**Solution:**
- Database uses `TEXT` not `BIGINT`
- Ensure `String(telegram_id)` in code

---

### **Issue 3: privy_did vs privy_user_id**

**Error:**
```
column "privy_did" does not exist
```

**Solution:**
- Use `privy_user_id` (database column name)
- NOT `privy_did` (old/incorrect name)

---

## ✅ Checklist

- [x] All column names use snake_case
- [x] `telegram_id` is TEXT type (not BigInt)
- [x] Frontend maps camelCase to snake_case
- [x] Backend accepts both formats but stores as snake_case
- [x] All values converted to string type
- [x] `wallet_address` normalized to lowercase
- [x] Column name is `privy_user_id` (NOT `privy_did`)

---

## 🎯 Summary

**Database Schema:**
- ✅ All columns use **snake_case**
- ✅ `telegram_id` is **TEXT** (supports long IDs)
- ✅ Column name is `privy_user_id` (NOT `privy_did`)

**Code Mapping:**
- ✅ Frontend sends snake_case to backend
- ✅ Backend accepts both camelCase and snake_case
- ✅ Backend stores as snake_case (matches database)
- ✅ All values converted to string type

**All mappings verified and correct!** ✅

