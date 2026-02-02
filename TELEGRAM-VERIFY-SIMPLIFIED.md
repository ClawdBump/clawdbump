# ✅ Telegram Verify Endpoint - Simplified (No API Key Needed)

## 📋 Overview

Endpoint sudah disederhanakan untuk menggunakan **Telegram Bot Token** yang sudah ada, menghilangkan kebutuhan untuk `FARBUMP_API_KEY` dan `FARBUMP_JWT_SECRET`.

**Endpoint:** `GET /api/v1/auth/telegram/verify`

---

## 🔑 Authentication

**Required Header:**
```
Authorization: Bearer {TELEGRAM_BOT_TOKEN}
```

**Environment Variable:**
- `TELEGRAM_BOT_TOKEN` - Telegram bot token dari BotFather (sudah ada untuk Privy)

**No longer needed:**
- ❌ `FARBUMP_API_KEY` - Removed
- ❌ `FARBUMP_JWT_SECRET` - Removed

---

## 📥 Request

### **URL:**
```
GET /api/v1/auth/telegram/verify?telegram_id={telegram_id}
```

### **Headers:**
```
Authorization: Bearer {TELEGRAM_BOT_TOKEN}
```

### **Query Parameters:**
- `telegram_id` (required): Telegram user ID (numeric string)

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

**Note:** JWT `auth_token` dihilangkan karena tidak diperlukan. Bot bisa langsung menggunakan data yang dikembalikan.

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

#### **401 Unauthorized - Missing Bot Token:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Missing or invalid Authorization header. Use: Authorization: Bearer {TELEGRAM_BOT_TOKEN}"
}
```

#### **401 Unauthorized - Invalid Bot Token:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid bot token"
}
```

---

## 💻 Usage Examples

### **cURL:**

```bash
curl -X GET "https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=123456789" \
  -H "Authorization: Bearer YOUR_TELEGRAM_BOT_TOKEN"
```

---

### **JavaScript/TypeScript:**

```typescript
const response = await fetch(
  `https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=${telegramId}`,
  {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${process.env.TELEGRAM_BOT_TOKEN}`,
    },
  }
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
  const telegramId = ctx.from.id.toString()
  
  // Use same bot token for authentication
  const response = await fetch(
    `https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=${telegramId}`,
    {
      headers: {
        "Authorization": `Bearer ${process.env.TELEGRAM_BOT_TOKEN}`,
      },
    }
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

## 🔧 Setup

### **Environment Variables**

**Required:**
```env
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
```

**No longer needed:**
- ❌ `FARBUMP_API_KEY` - Removed
- ❌ `FARBUMP_JWT_SECRET` - Removed

**Note:** `TELEGRAM_BOT_TOKEN` sudah ada untuk Privy Telegram login configuration.

---

## ✅ **Benefits of Simplification**

1. **Simpler Setup:**
   - ✅ Tidak perlu generate API key baru
   - ✅ Gunakan bot token yang sudah ada
   - ✅ Tidak perlu manage JWT secret

2. **Less Complexity:**
   - ✅ Tidak perlu JWT token generation
   - ✅ Return data langsung
   - ✅ Bot bisa langsung gunakan data

3. **Still Secure:**
   - ✅ Bot token authentication
   - ✅ User login auth secure via Privy
   - ✅ Database access secure via RLS

---

## 🔒 Security

### **Why This is Secure:**

1. **Bot Token Authentication:**
   - Bot token dari BotFather (secure)
   - Hanya bot yang punya token bisa access
   - Token tidak exposed di client-side

2. **User Login Auth:**
   - Privy menangani user authentication
   - Telegram pairing secure via database
   - User data hanya accessible jika sudah login

3. **Database Security:**
   - RLS (Row Level Security) enabled
   - Service role key secure
   - No direct database access

---

## 📋 Migration Guide

### **For Bot (ClawdBumpbot):**

**Before:**
```typescript
headers: {
  "Authorization": `Bearer ${process.env.FARBUMP_API_KEY}`,
}
```

**After:**
```typescript
headers: {
  "Authorization": `Bearer ${process.env.TELEGRAM_BOT_TOKEN}`,
}
```

---

### **For Environment Variables:**

**Remove:**
- `FARBUMP_API_KEY`
- `FARBUMP_JWT_SECRET`

**Keep:**
- `TELEGRAM_BOT_TOKEN` (sudah ada)

---

## 🎯 Summary

**Simplified Authentication:**
- ✅ Use `TELEGRAM_BOT_TOKEN` instead of `FARBUMP_API_KEY`
- ✅ Remove JWT token generation
- ✅ Return user data directly
- ✅ Simpler setup, still secure

**Security:**
- ✅ Bot token authentication
- ✅ User login auth secure via Privy
- ✅ No privacy concerns (only bot can access)

**Benefits:**
- ✅ Less complexity
- ✅ No extra keys to manage
- ✅ Use existing bot token
- ✅ Still secure

