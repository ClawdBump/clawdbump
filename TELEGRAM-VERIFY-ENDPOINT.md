# 🔐 Telegram Verify Endpoint - Bot Integration

## 📋 Overview

Endpoint untuk bot (ClawdBumpbot) untuk memverifikasi dan mengambil data user yang login via Telegram.

**Endpoint:** `GET /api/v1/auth/telegram/verify`

---

## 🔑 Authentication

**Required Header:**
```
Authorization: Bearer {FARBUMP_API_KEY}
```

**Environment Variable:**
- `FARBUMP_API_KEY` - API key untuk autentikasi bot requests
- `FARBUMP_JWT_SECRET` (optional) - Secret untuk JWT token generation (default: uses FARBUMP_API_KEY)

---

## 📥 Request

### **URL:**
```
GET /api/v1/auth/telegram/verify?telegram_id={telegram_id}
```

### **Headers:**
```
Authorization: Bearer {FARBUMP_API_KEY}
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
  "auth_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0ZWxlZ3JhbV9pZCI6IjEyMzQ1Njc4OSIsIndhbGxldF9hZGRyZXNzIjoiMHg3NDJkMzVDYzY2MzRDMDUzMjkyNWEzYjg0NEJjOWU3NTlmMGJFYiIsInByaXZ5X3VzZXJfaWQiOiJkaWQ6cHJpdnk6YWJjMTIzIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE3MDQxNTM2MDB9.signature"
}
```

**Additional Fields (optional):**
- `telegram_username` - Telegram username (if available)
- `last_login_at` - Last login timestamp

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

#### **401 Unauthorized - Missing API Key:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Missing or invalid Authorization header. Use: Authorization: Bearer {FARBUMP_API_KEY}"
}
```

#### **401 Unauthorized - Invalid API Key:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

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

#### **500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Failed to verify Telegram user"
}
```

---

## 🔐 JWT Token Details

### **Token Structure:**

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload:**
```json
{
  "telegram_id": "123456789",
  "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "privy_user_id": "did:privy:abc123",
  "iat": 1704067200,
  "exp": 1704153600
}
```

**Expiration:** 24 hours from issuance

**Signature:** HMAC-SHA256 using `FARBUMP_JWT_SECRET` or `FARBUMP_API_KEY`

---

## 💻 Usage Examples

### **cURL:**

```bash
curl -X GET "https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=123456789" \
  -H "Authorization: Bearer YOUR_FARBUMP_API_KEY"
```

### **JavaScript/TypeScript:**

```typescript
const response = await fetch(
  `https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=${telegramId}`,
  {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${process.env.FARBUMP_API_KEY}`,
    },
  }
)

const data = await response.json()

if (data.is_valid) {
  console.log("User is logged in:", {
    wallet: data.smart_account_address,
    privyId: data.privy_user_id,
    authToken: data.auth_token,
  })
} else {
  console.log("User has not logged in")
}
```

### **Python:**

```python
import requests

telegram_id = "123456789"
api_key = "YOUR_FARBUMP_API_KEY"

response = requests.get(
    f"https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id={telegram_id}",
    headers={"Authorization": f"Bearer {api_key}"}
)

data = response.json()

if data.get("is_valid"):
    print(f"User logged in: {data['smart_account_address']}")
    print(f"Auth token: {data['auth_token']}")
else:
    print("User has not logged in")
```

### **Telegram Bot (grammY/Telegraf):**

```typescript
import { Bot } from "grammy"

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!)

bot.command("check", async (ctx) => {
  const telegramId = ctx.from.id.toString()
  
  const response = await fetch(
    `https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=${telegramId}`,
    {
      headers: {
        "Authorization": `Bearer ${process.env.FARBUMP_API_KEY}`,
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

### **1. Environment Variables**

**Required:**
```env
FARBUMP_API_KEY=your-secret-api-key-here
```

**Optional:**
```env
FARBUMP_JWT_SECRET=your-jwt-secret-here
```

**Note:** If `FARBUMP_JWT_SECRET` is not set, `FARBUMP_API_KEY` will be used as JWT secret.

---

### **2. Generate API Key**

**Recommendation:**
- Use a strong, random string (at least 32 characters)
- Store securely (environment variables, secrets manager)
- Never commit to Git
- Rotate periodically

**Example:**
```bash
# Generate random API key
openssl rand -hex 32
```

---

## 🔒 Security

### **Best Practices:**

1. **API Key Security:**
   - Store in environment variables
   - Never expose in client-side code
   - Use HTTPS only
   - Rotate keys periodically

2. **JWT Token:**
   - Tokens expire after 24 hours
   - Tokens are signed with HMAC-SHA256
   - Validate token signature on verification

3. **Rate Limiting:**
   - Consider implementing rate limiting for production
   - Monitor for suspicious activity

4. **Logging:**
   - Log all API key validation attempts
   - Monitor for failed authentication attempts

---

## 📊 Response Fields

### **When User is Logged In:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` for successful requests |
| `is_valid` | boolean | `true` if user is logged in |
| `smart_account_address` | string | User's Smart Wallet address (0x...) |
| `privy_user_id` | string | Privy user ID (DID format) |
| `auth_token` | string | JWT token for authenticated requests |
| `telegram_username` | string \| null | Telegram username (if available) |
| `last_login_at` | string | ISO timestamp of last login |

### **When User is Not Logged In:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` for successful requests |
| `is_valid` | boolean | `false` if user is not logged in |

---

## 🧪 Testing

### **Test with Valid User:**

```bash
# Replace with actual telegram_id and API key
curl -X GET "https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=123456789" \
  -H "Authorization: Bearer YOUR_FARBUMP_API_KEY"
```

**Expected Response:**
```json
{
  "success": true,
  "is_valid": true,
  "smart_account_address": "0x...",
  "privy_user_id": "did:privy:...",
  "auth_token": "eyJ..."
}
```

---

### **Test with Invalid User:**

```bash
curl -X GET "https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=999999999" \
  -H "Authorization: Bearer YOUR_FARBUMP_API_KEY"
```

**Expected Response:**
```json
{
  "success": true,
  "is_valid": false
}
```

---

### **Test with Missing API Key:**

```bash
curl -X GET "https://farbump.vercel.app/api/v1/auth/telegram/verify?telegram_id=123456789"
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Missing or invalid Authorization header..."
}
```

---

## 📚 Related Endpoints

- `GET /api/v1/auth/telegram/check` - Check login status (no auth required, simpler response)
- `POST /api/v1/auth/telegram/pair` - Pair Telegram ID with Privy user (internal use)

---

## ✅ Summary

**Endpoint:** `GET /api/v1/auth/telegram/verify`

**Authentication:** Bearer token (`FARBUMP_API_KEY`)

**Purpose:** Verify Telegram user login and get authentication data

**Response:**
- `is_valid: true` - User logged in, returns wallet address, Privy ID, and JWT token
- `is_valid: false` - User not logged in

**JWT Token:** Valid for 24 hours, contains telegram_id, wallet_address, and privy_user_id

