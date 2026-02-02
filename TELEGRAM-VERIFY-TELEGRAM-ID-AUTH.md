# ✅ Telegram Verify Endpoint - Telegram ID Authentication

## 📋 Overview

Endpoint menggunakan **Telegram ID yang sudah login ke FarBump** sebagai authentication method. Bot hanya perlu verify bahwa Telegram ID tersebut sudah login (ada di database).

**Endpoint:** `GET /api/v1/auth/telegram/verify`

---

## 🔑 Authentication Method

### **Telegram ID Verification**

**Cara kerja:**
1. Bot mengirim request dengan `telegram_id` dari user yang mengirim pesan
2. Endpoint check apakah `telegram_id` ada di database (sudah login)
3. Jika ada → User sudah login → Return data user
4. Jika tidak ada → User belum login → Return `is_valid: false`

**Tidak perlu:**
- ❌ API key
- ❌ Bot token
- ❌ JWT token
- ❌ Authorization header

**Security:**
- ✅ User login auth sudah secure via Privy
- ✅ Hanya Telegram ID yang sudah login bisa dapat data
- ✅ Tidak bisa enumerate users (hanya return data untuk logged-in users)
- ✅ Jika telegram_id tidak ada di database = tidak ada data yang bisa diambil

---

## 📥 Request

### **URL:**
```
GET /api/v1/auth/telegram/verify?telegram_id={telegram_id}
```

### **Headers:**
```
(No headers required)
```

### **Query Parameters:**
- `telegram_id` (required): Telegram user ID to verify

---

## 📤 Response

### **Success - User Logged In:**

**Status Code:** `200 OK`

```json
{
  "success": true,
  "is_valid": true,
  "smart_account_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "privy_user_id": "did:privy:abc123",
  "telegram_username": "john_doe",
  "last_login_at": "2024-01-01T00:00:00Z"
}
```

---

### **Success - User Not Logged In:**

**Status Code:** `200 OK`

```json
{
  "success": true,
  "is_valid": false
}
```

---

### **Error Responses:**

#### **400 Bad Request - Missing telegram_id:**
```json
{
  "success": false,
  "error": "Missing required parameter: telegram_id",
  "message": "telegram_id is required as query parameter"
}
```

#### **400 Bad Request - Invalid telegram_id format:**
```json
{
  "success": false,
  "error": "Invalid telegram_id format",
  "message": "telegram_id must be a numeric string"
}
```

---

## 💻 Usage Examples

### **cURL:**

```bash
curl -X GET "https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=123456789"
```

**No headers needed!**

---

### **JavaScript/TypeScript:**

```typescript
const response = await fetch(
  `https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=${telegramId}`
)

const data = await response.json()

if (data.is_valid) {
  console.log("User is logged in:", {
    wallet: data.smart_account_address,
    privyId: data.privy_user_id,
  })
} else {
  console.log("User has not logged in")
}
```

---

### **Telegram Bot (grammY/Telegraf):**

```typescript
import { Bot } from "grammy"

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!)

bot.command("check", async (ctx) => {
  // Get telegram_id from user who sent message
  const telegramId = ctx.from.id.toString()
  
  // No authentication needed - just verify telegram_id
  const response = await fetch(
    `https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=${telegramId}`
  )
  
  const data = await response.json()
  
  if (data.is_valid) {
    await ctx.reply(
      `✅ You're logged in!\n\n` +
      `Wallet: ${data.smart_account_address}\n` +
      `Privy ID: ${data.privy_user_id}`
    )
  } else {
    await ctx.reply("❌ Please log in to FarBump first")
  }
})
```

---

## 🔒 Security Analysis

### **Why This is Secure:**

1. **User Login Auth:**
   - User login via Privy (secure)
   - Telegram pairing hanya terjadi setelah user login
   - Database hanya berisi Telegram ID yang sudah verified login

2. **Telegram ID Verification:**
   - Hanya Telegram ID yang ada di database bisa dapat data
   - Jika telegram_id tidak ada = user belum login = tidak ada data
   - Tidak bisa enumerate users (hanya return data untuk logged-in users)

3. **No Data Leakage:**
   - Jika user belum login → `is_valid: false` (no data)
   - Jika user sudah login → Return data user tersebut
   - Tidak bisa check status user lain tanpa telegram_id mereka

4. **Bot Context:**
   - Bot sudah tahu telegram_id dari user yang mengirim pesan
   - Bot hanya bisa check status user yang berinteraksi dengan bot
   - Tidak bisa check random telegram_id tanpa context

---

## 🎯 How It Works

### **Flow:**

1. **User mengirim pesan ke bot:**
   ```
   User → Bot: "Check my status"
   Bot gets: telegram_id = 123456789
   ```

2. **Bot call endpoint:**
   ```
   GET /api/v1/auth/telegram/verify?telegram_id=123456789
   ```

3. **Endpoint verify:**
   ```
   Check database: Does telegram_id=123456789 exist?
   - If YES → User logged in → Return data
   - If NO → User not logged in → Return is_valid: false
   ```

4. **Bot respond:**
   ```
   If is_valid: true → "You're logged in! Wallet: 0x..."
   If is_valid: false → "Please log in to FarBump first"
   ```

---

## ✅ Benefits

1. **Simplest Possible:**
   - ✅ No API keys needed
   - ✅ No bot tokens needed
   - ✅ No JWT tokens needed
   - ✅ No headers needed

2. **Secure:**
   - ✅ User login auth secure via Privy
   - ✅ Only logged-in users can get data
   - ✅ Cannot enumerate users
   - ✅ No data leakage

3. **Bot-Friendly:**
   - ✅ Bot already knows telegram_id
   - ✅ Simple request (just query parameter)
   - ✅ Easy to implement

---

## 📋 Comparison

### **Before (API Key):**
```typescript
// Bot needs to manage API key
headers: {
  "Authorization": `Bearer ${process.env.FARBUMP_API_KEY}`,
}
```

### **After (Telegram ID):**
```typescript
// Bot just uses telegram_id (already knows it)
// No headers needed!
fetch(`/api/v1/auth/telegram/verify?telegram_id=${telegramId}`)
```

---

## 🔧 Setup

### **No Environment Variables Needed!**

**Removed:**
- ❌ `FARBUMP_API_KEY`
- ❌ `FARBUMP_JWT_SECRET`
- ❌ `TELEGRAM_BOT_TOKEN` (for this endpoint)

**Endpoint works out of the box!**

---

## 🧪 Testing

### **Test with Valid User:**

```bash
curl "https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=123456789"
```

**Expected Response (if logged in):**
```json
{
  "success": true,
  "is_valid": true,
  "smart_account_address": "0x...",
  "privy_user_id": "did:privy:...",
  "telegram_username": "...",
  "last_login_at": "..."
}
```

---

### **Test with Invalid User:**

```bash
curl "https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=999999999"
```

**Expected Response:**
```json
{
  "success": true,
  "is_valid": false
}
```

---

## 🎯 Summary

**Authentication Method:**
- ✅ **Telegram ID Verification** - Check apakah telegram_id ada di database
- ✅ **No API keys** - Tidak perlu manage keys
- ✅ **No headers** - Simple request

**Security:**
- ✅ User login auth secure via Privy
- ✅ Only logged-in users can get data
- ✅ Cannot enumerate users
- ✅ No data leakage

**Benefits:**
- ✅ Simplest possible implementation
- ✅ Bot-friendly (bot already knows telegram_id)
- ✅ Secure (only verified Telegram IDs can get data)
- ✅ No setup needed (works out of the box)

---

## 📚 Related Endpoints

- `GET /api/v1/auth/telegram/check` - Similar endpoint (public, no auth)
- `POST /api/v1/auth/telegram/pair` - Pair Telegram ID with Privy user (internal use)

---

## ✅ Conclusion

**Endpoint sekarang menggunakan Telegram ID verification sebagai authentication method.**

**Cara kerja:**
1. Bot mengirim `telegram_id` dari user
2. Endpoint verify apakah `telegram_id` ada di database (sudah login)
3. Jika ada → Return data user
4. Jika tidak ada → Return `is_valid: false`

**Tidak perlu:**
- ❌ API keys
- ❌ Bot tokens
- ❌ JWT tokens
- ❌ Headers

**Simple, secure, and bot-friendly!** ✅

