# 🔄 Telegram Upsert Wallet Endpoint - Complete Guide

## 📋 Overview

Endpoint baru `/api/v1/auth/telegram/upsert-wallet` dibuat untuk menyederhanakan proses upsert wallet ke database setelah Privy login.

**Endpoint:** `POST /api/v1/auth/telegram/upsert-wallet`

---

## 🔑 Key Features

1. **Simplified Flow:**
   - Tidak perlu initData verification (sudah dilakukan di `/verify`)
   - Langsung upsert dengan `telegram_id`, `wallet_address`, `privy_user_id`

2. **Comprehensive Logging:**
   - Log setiap step dari request sampai database upsert
   - Log error details untuk debugging

3. **Environment Check:**
   - Verify `SUPABASE_SERVICE_ROLE_KEY` exists
   - Ensure RLS bypass works correctly

---

## 📥 Request

### **URL:**
```
POST /api/v1/auth/telegram/upsert-wallet
```

### **Headers:**
```
Content-Type: application/json
```

### **Body:**
```json
{
  "telegram_id": "123456789",
  "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "privy_user_id": "did:privy:abc123"
}
```

---

## 📤 Response

### **Success:**

**Status Code:** `200 OK`

```json
{
  "success": true,
  "message": "Wallet address upserted successfully",
  "data": {
    "telegram_id": "123456789",
    "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "privy_user_id": "did:privy:abc123",
    "is_active": true,
    "last_login_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### **Error Responses:**

#### **400 Bad Request - Missing Fields:**
```json
{
  "success": false,
  "error": "Missing required field: telegram_id",
  "message": "telegram_id is required to upsert wallet"
}
```

#### **400 Bad Request - Invalid Format:**
```json
{
  "success": false,
  "error": "Invalid wallet_address format",
  "message": "wallet_address must be a valid Ethereum address"
}
```

#### **500 Internal Server Error - Database Error:**
```json
{
  "success": false,
  "error": "Database error",
  "message": "Failed to upsert wallet to database",
  "error_code": "PGRST116"
}
```

---

## 🔍 Logging

### **Request Received:**
```
📥 [UPSERT-WALLET] ============================================
📥 [UPSERT-WALLET] Received request to upsert wallet
📥 [UPSERT-WALLET] Request body: { telegram_id: "123456789", ... }
```

### **Validation:**
```
✅ [UPSERT-WALLET] Request validation passed
```

### **Environment Check:**
```
🔍 [UPSERT-WALLET] Checking SUPABASE_SERVICE_ROLE_KEY...
🔍 [UPSERT-WALLET] SUPABASE_SERVICE_ROLE_KEY exists: true
```

### **Database Upsert:**
```
🔍 [UPSERT-WALLET] Attempting to Upsert to Supabase: { telegram_id: "123456789", ... }
🔍 [UPSERT-WALLET] Calling supabase.from('telegram_user_mappings').upsert()...
✅ [UPSERT-WALLET] Database upsert successful!
✅ [UPSERT-WALLET] Upserted data: { id: 1, telegram_id: "123456789", ... }
```

### **Error Logging:**
```
❌ [UPSERT-WALLET] Error upserting to Supabase: { code: "PGRST116", message: "..." }
❌ [UPSERT-WALLET] Error code: PGRST116
❌ [UPSERT-WALLET] Error message: ...
❌ [UPSERT-WALLET] Error details: { ... }
```

---

## 💻 Frontend Integration

### **Hook Usage:**

```typescript
import { useTelegramMiniAppAuth } from "@/hooks/use-telegram-miniapp-auth"

export default function MyComponent() {
  const {
    telegramId,      // Telegram ID from initData verification
    walletAddress,    // Wallet address after Privy login
    privyUserId,      // Privy user ID
    isVerified,       // Whether wallet is verified
  } = useTelegramMiniAppAuth()

  // Hook automatically:
  // 1. Verifies initData and extracts telegram_id
  // 2. Watches for Privy wallet creation
  // 3. Calls /api/v1/auth/telegram/upsert-wallet when wallet is ready
}
```

### **Frontend Logs:**

```
🔍 [FRONTEND] ============================================
🔍 [FRONTEND] Watching for Privy wallet creation...
🚀 [FRONTEND] Privy login success, sending data to backend...
🔍 [FRONTEND] upsertWalletToDatabase called: { telegram_id: "123456789", ... }
🔍 [FRONTEND] Sending request to /api/v1/auth/telegram/upsert-wallet...
✅ [FRONTEND] Wallet address upserted to database: { telegram_id: "123456789", ... }
```

---

## 🔒 Security

### **Environment Variables:**

**Required:**
```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Why Service Role Key?**
- Bypasses Row Level Security (RLS)
- Allows server-side operations without user authentication
- Required for API routes to insert/update data

### **Validation:**
- ✅ `telegram_id` must be numeric string
- ✅ `wallet_address` must be valid Ethereum address (0x + 40 hex chars)
- ✅ `privy_user_id` must be provided

---

## 🧪 Testing

### **cURL:**

```bash
curl -X POST "http://localhost:3000/api/v1/auth/telegram/upsert-wallet" \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": "123456789",
    "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "privy_user_id": "did:privy:abc123"
  }'
```

### **Expected Logs:**

```
📥 [UPSERT-WALLET] Received request to upsert wallet
✅ [UPSERT-WALLET] Request validation passed
🔍 [UPSERT-WALLET] SUPABASE_SERVICE_ROLE_KEY exists: true
🔍 [UPSERT-WALLET] Attempting to Upsert to Supabase: { ... }
✅ [UPSERT-WALLET] Database upsert successful!
```

---

## 🔄 Flow Diagram

```
User logs in via Privy
    ↓
Frontend hook detects wallet creation
    ↓
Extract telegram_id (from initData verification)
    ↓
Call POST /api/v1/auth/telegram/upsert-wallet
    ↓
Backend validates request
    ↓
Check SUPABASE_SERVICE_ROLE_KEY
    ↓
Upsert to telegram_user_mappings table
    ↓
Return success response
    ↓
Frontend updates local state
```

---

## 🐛 Troubleshooting

### **Problem 1: SUPABASE_SERVICE_ROLE_KEY not configured**

**Look for:**
```
❌ [UPSERT-WALLET] SUPABASE_SERVICE_ROLE_KEY not configured!
```

**Solution:**
- Add `SUPABASE_SERVICE_ROLE_KEY` to environment variables
- Restart server after adding

---

### **Problem 2: Database upsert fails**

**Look for:**
```
❌ [UPSERT-WALLET] Error upserting to Supabase: { code: "PGRST116", ... }
```

**Common causes:**
- Table doesn't exist
- RLS policy blocking (shouldn't happen with service role key)
- Invalid data format

**Solution:**
- Check table exists: `telegram_user_mappings`
- Verify RLS policies allow service role
- Check data format matches schema

---

### **Problem 3: Frontend not calling endpoint**

**Look for:**
```
⏸️ [FRONTEND] Waiting for Privy to be ready/authenticated...
```

**Solution:**
- Ensure Privy is ready (`ready === true`)
- Ensure user is authenticated (`authenticated === true`)
- Ensure wallet address is available
- Ensure `telegram_id` is set (from initData verification)

---

## ✅ Checklist

- [x] Endpoint created: `POST /api/v1/auth/telegram/upsert-wallet`
- [x] Comprehensive logging added
- [x] Environment variable check (SUPABASE_SERVICE_ROLE_KEY)
- [x] Frontend hook updated to call new endpoint
- [x] Error handling and validation
- [x] Documentation created

---

## 🎯 Summary

**New Endpoint:**
- ✅ Simplified flow (no initData verification needed)
- ✅ Direct upsert with telegram_id, wallet_address, privy_user_id
- ✅ Comprehensive logging for debugging
- ✅ Environment variable validation

**Frontend Integration:**
- ✅ Hook automatically calls endpoint after Privy login
- ✅ Extracts telegram_id from initData verification
- ✅ Watches for wallet creation
- ✅ Updates local state after success

**Security:**
- ✅ Uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)
- ✅ Validates all input fields
- ✅ Error handling for database operations

**Ready to use!** 🚀

