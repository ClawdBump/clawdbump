# ClawdBot Architecture & Security

## Overview

ClawdBot adalah AI assistant yang berinteraksi dengan user melalui Telegram chat untuk membantu melakukan bumping automation. Dokumen ini menjelaskan arsitektur, authentication, authorization, dan security measures.

---

## 1. Arsitektur ClawdBot

### 1.1 Komponen Utama

```
┌─────────────────┐
│  Telegram Bot   │ (ClawdBot)
│  (AI Assistant)  │
└────────┬────────┘
         │
         │ Webhook / Long Polling
         │
         ▼
┌─────────────────┐
│  Next.js API    │ (/api/telegram/webhook)
│  Routes         │
└────────┬────────┘
         │
         ├──► AI Service (OpenAI/Anthropic)
         ├──► Supabase Database
         ├──► CDP SDK (for transactions)
         └──► Existing Bumping APIs
```

### 1.2 Flow Interaksi

1. **User mengirim pesan ke ClawdBot di Telegram**
2. **Telegram mengirim webhook ke Next.js API**
3. **API memverifikasi Telegram signature** (security)
4. **API mengidentifikasi user dari Telegram ID**
5. **API memverifikasi user di database** (authorization)
6. **API memproses pesan dengan AI**
7. **AI memahami intent dan memanggil action yang sesuai**
8. **API menjalankan action (start bumping, check balance, dll)**
9. **API mengirim response ke user via Telegram Bot API**

---

## 2. Authentication & User Identification

### 2.1 Memastikan User A Tidak Tertukar dengan User B

#### Problem
- User A mengirim pesan ke bot
- User B mencoba mengakses data User A
- Bot harus tahu siapa yang sedang berbicara

#### Solution: Multi-Layer Authentication

**Layer 1: Telegram Signature Verification**
```typescript
// Setiap webhook dari Telegram memiliki signature
// Verifikasi signature menggunakan TELEGRAM_BOT_TOKEN

function verifyTelegramWebhook(
  body: string,
  signature: string,
  botToken: string
): boolean {
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest()
  
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(body)
    .digest('hex')
  
  return calculatedHash === signature
}
```

**Layer 2: Telegram User ID Extraction**
```typescript
// Dari webhook, extract Telegram User ID
const telegramUserId = webhook.message.from.id

// Telegram User ID adalah unique identifier
// Tidak bisa dipalsukan karena divalidasi oleh Telegram
```

**Layer 3: Database Verification**
```typescript
// Verifikasi user ada di database
const user = await supabase
  .from("telegram_user_mappings")
  .select("telegram_id, wallet_address, privy_user_id")
  .eq("telegram_id", telegramUserId)
  .single()

if (!user) {
  // User belum terdaftar, minta login dulu
  return "Please login via Telegram Mini App first"
}

// Sekarang kita tahu:
// - Telegram ID: 123456789 (dari Telegram, tidak bisa dipalsukan)
// - Wallet Address: 0x... (dari database)
// - Privy User ID: did:privy:... (dari database)
```

**Layer 4: Session Management (Optional)**
```typescript
// Untuk extra security, bisa tambahkan session
interface ClawdBotSession {
  telegramId: string
  walletAddress: string
  privyUserId: string
  sessionId: string
  expiresAt: number
  lastActivity: number
}

// Store session in Redis or database
// Validate session on every request
```

### 2.2 Flow Authentication

```
1. Telegram Webhook Received
   ↓
2. Verify Telegram Signature ✅
   ↓
3. Extract Telegram User ID (from.from.id)
   ↓
4. Query Database: telegram_user_mappings WHERE telegram_id = ?
   ↓
5. If NOT FOUND → Return: "Please login first"
   ↓
6. If FOUND → Get wallet_address, privy_user_id
   ↓
7. Use wallet_address for all subsequent operations
   ↓
8. All API calls use wallet_address (NOT telegram_id)
```

---

## 3. Security: Mencegah API Abuse

### 3.1 Problem: User Menembak API dengan Telegram ID Orang Lain

**Attack Scenario:**
```
Attacker mengirim request langsung ke API:
POST /api/bot/start-bumping
{
  "telegramId": "123456789", // Telegram ID korban
  "amount": "1000000000000000000"
}

Attacker bisa:
- Start bumping dengan kredit korban
- Check balance korban
- Stop bumping korban
- Dll
```

### 3.2 Solution: Multi-Layer Security

#### Layer 1: Telegram Webhook Only (Recommended)

**Jangan expose API endpoint langsung!**

```typescript
// ❌ BAD: Expose API endpoint
POST /api/bot/start-bumping
{
  "telegramId": "...",
  "amount": "..."
}
// Siapa saja bisa call dengan telegram ID orang lain!

// ✅ GOOD: Only accept from Telegram webhook
POST /api/telegram/webhook
// Telegram signature verification required
// Telegram User ID extracted from webhook (cannot be faked)
```

**Implementation:**
```typescript
// app/api/telegram/webhook/route.ts
export async function POST(request: NextRequest) {
  // 1. Verify Telegram signature
  const body = await request.text()
  const signature = request.headers.get('x-telegram-bot-api-secret-token')
  
  if (!verifyTelegramWebhook(body, signature, TELEGRAM_BOT_TOKEN)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }
  
  const webhook = JSON.parse(body)
  
  // 2. Extract Telegram User ID (from Telegram, cannot be faked)
  const telegramUserId = webhook.message.from.id
  
  // 3. Verify user in database
  const user = await verifyUser(telegramUserId)
  if (!user) {
    return sendTelegramMessage(telegramUserId, "Please login first")
  }
  
  // 4. Process message with AI
  const response = await processWithAI(webhook.message.text, user)
  
  // 5. Send response
  return sendTelegramMessage(telegramUserId, response)
}
```

#### Layer 2: Rate Limiting

```typescript
// Limit requests per Telegram User ID
const rateLimiter = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(telegramUserId: string): boolean {
  const now = Date.now()
  const limit = rateLimiter.get(telegramUserId)
  
  if (!limit || now > limit.resetAt) {
    rateLimiter.set(telegramUserId, { count: 1, resetAt: now + 60000 }) // 1 minute
    return true
  }
  
  if (limit.count >= 10) { // Max 10 requests per minute
    return false
  }
  
  limit.count++
  return true
}
```

#### Layer 3: IP Whitelist (Optional)

```typescript
// Only accept webhooks from Telegram IP ranges
const TELEGRAM_IP_RANGES = [
  '149.154.160.0/20',
  '91.108.4.0/22',
  // ... other Telegram IPs
]

function isTelegramIP(ip: string): boolean {
  return TELEGRAM_IP_RANGES.some(range => isIPInRange(ip, range))
}
```

#### Layer 4: Request Signing (Advanced)

```typescript
// Jika tetap perlu expose API endpoint, gunakan request signing
interface SignedRequest {
  telegramId: string
  action: string
  params: any
  signature: string
  timestamp: number
}

function verifyRequestSignature(request: SignedRequest): boolean {
  // 1. Get user's secret key from database
  const user = await getUser(request.telegramId)
  const secretKey = user.secretKey // Generated on first login
  
  // 2. Recreate signature
  const data = `${request.telegramId}:${request.action}:${JSON.stringify(request.params)}:${request.timestamp}`
  const calculatedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(data)
    .digest('hex')
  
  // 3. Verify signature matches
  if (calculatedSignature !== request.signature) {
    return false
  }
  
  // 4. Check timestamp (prevent replay attacks)
  const now = Date.now()
  if (now - request.timestamp > 60000) { // 1 minute
    return false
  }
  
  return true
}
```

#### Layer 5: Database-Level Security

```sql
-- Row Level Security (RLS) di Supabase
-- User hanya bisa akses data mereka sendiri

CREATE POLICY "Users can only access their own data"
ON telegram_user_mappings
FOR ALL
USING (
  telegram_id = current_setting('app.telegram_id')::text
);

-- Set telegram_id dari application context
SET app.telegram_id = '123456789';
```

---

## 4. API Endpoint Design

### 4.1 Recommended: Webhook-Only Architecture

```
┌─────────────┐
│  Telegram   │
│     Bot     │
└──────┬──────┘
       │
       │ Webhook (POST)
       │
       ▼
┌─────────────────────┐
│ /api/telegram/webhook│
│ - Verify signature   │
│ - Extract user ID    │
│ - Process with AI    │
│ - Execute actions    │
└─────────────────────┘
```

**Pros:**
- ✅ Telegram signature verification (cannot be faked)
- ✅ User ID dari Telegram (cannot be spoofed)
- ✅ No direct API exposure
- ✅ Built-in rate limiting by Telegram

**Cons:**
- ⚠️ Requires Telegram Bot setup
- ⚠️ Webhook URL must be publicly accessible

### 4.2 Alternative: Signed API Endpoints

Jika tetap perlu expose API endpoint:

```typescript
// app/api/bot/start-bumping/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { telegramId, signature, timestamp, action, params } = body
  
  // 1. Verify signature
  if (!verifyRequestSignature({ telegramId, signature, timestamp, action, params })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }
  
  // 2. Verify user exists
  const user = await getUser(telegramId)
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }
  
  // 3. Execute action
  const result = await executeAction(action, params, user.walletAddress)
  
  return NextResponse.json({ success: true, result })
}
```

---

## 5. Database Schema Updates

### 5.1 Add ClawdBot Session Table

```sql
-- Store active ClawdBot sessions
CREATE TABLE IF NOT EXISTS clawdbot_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES telegram_user_mappings(telegram_id),
  session_id TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  privy_user_id TEXT,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_clawdbot_sessions_telegram_id (telegram_id),
  INDEX idx_clawdbot_sessions_session_id (session_id),
  INDEX idx_clawdbot_sessions_expires_at (expires_at)
);

-- Auto-cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM clawdbot_sessions
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Run cleanup every hour
SELECT cron.schedule('cleanup-sessions', '0 * * * *', 'SELECT cleanup_expired_sessions()');
```

### 5.2 Add User Secret Keys (for request signing)

```sql
-- Add secret key column to telegram_user_mappings
ALTER TABLE telegram_user_mappings
ADD COLUMN IF NOT EXISTS secret_key TEXT;

-- Generate secret key on first login
-- Store hashed version in database
```

---

## 6. Implementation Checklist

### 6.1 Security Measures

- [ ] **Telegram Webhook Signature Verification**
  - Verify `x-telegram-bot-api-secret-token` header
  - Verify webhook payload signature

- [ ] **User Identification**
  - Extract Telegram User ID from webhook (cannot be faked)
  - Verify user exists in database
  - Use `wallet_address` for all operations (not `telegram_id`)

- [ ] **Rate Limiting**
  - Limit requests per Telegram User ID
  - Limit requests per IP address
  - Implement exponential backoff

- [ ] **Input Validation**
  - Validate all user inputs
  - Sanitize AI responses
  - Check action permissions

- [ ] **Audit Logging**
  - Log all ClawdBot interactions
  - Log all API calls
  - Monitor for suspicious activity

### 6.2 AI Integration

- [ ] **AI Service Setup**
  - Choose AI provider (OpenAI, Anthropic, etc.)
  - Set up API keys
  - Configure model parameters

- [ ] **Context Management**
  - Store conversation context per user
  - Implement context window management
  - Handle multi-turn conversations

- [ ] **Intent Recognition**
  - Map user messages to actions
  - Handle ambiguous requests
  - Provide helpful error messages

### 6.3 Action Execution

- [ ] **Action Router**
  - Map intents to API calls
  - Execute actions securely
  - Return results to user

- [ ] **Error Handling**
  - Handle API errors gracefully
  - Provide user-friendly error messages
  - Log errors for debugging

---

## 7. Example Implementation

### 7.1 Webhook Handler

```typescript
// app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { verifyTelegramWebhook } from "@/lib/telegram-verify"

export async function POST(request: NextRequest) {
  try {
    // 1. Verify Telegram signature
    const body = await request.text()
    const signature = request.headers.get('x-telegram-bot-api-secret-token')
    
    if (!verifyTelegramWebhook(body, signature, process.env.TELEGRAM_BOT_TOKEN!)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
    
    const webhook = JSON.parse(body)
    
    // 2. Extract Telegram User ID
    const telegramUserId = String(webhook.message.from.id)
    const messageText = webhook.message.text
    
    // 3. Verify user in database
    const supabase = createSupabaseServiceClient()
    const { data: user, error } = await supabase
      .from("telegram_user_mappings")
      .select("telegram_id, wallet_address, privy_user_id")
      .eq("telegram_id", telegramUserId)
      .single()
    
    if (error || !user) {
      await sendTelegramMessage(telegramUserId, 
        "❌ You need to login first via Telegram Mini App.\n\n" +
        "Please open the app and login with your wallet."
      )
      return NextResponse.json({ success: true })
    }
    
    // 4. Process message with AI
    const aiResponse = await processWithAI(messageText, user)
    
    // 5. Execute actions if needed
    if (aiResponse.action) {
      await executeAction(aiResponse.action, aiResponse.params, user.walletAddress)
    }
    
    // 6. Send response
    await sendTelegramMessage(telegramUserId, aiResponse.message)
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error processing webhook:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

### 7.2 AI Processing

```typescript
// lib/clawdbot-ai.ts
async function processWithAI(
  message: string,
  user: { telegramId: string; walletAddress: string; privyUserId: string }
): Promise<{ message: string; action?: string; params?: any }> {
  // 1. Get user context
  const context = await getUserContext(user.telegramId)
  
  // 2. Call AI service
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `You are ClawdBot, an AI assistant for ClawdBump.
        
User Information:
- Telegram ID: ${user.telegramId}
- Wallet Address: ${user.walletAddress}

Available Actions:
- start_bumping: Start automated bumping
- stop_bumping: Stop bumping
- check_balance: Check credit balance
- check_status: Check bumping status
- distribute_credits: Distribute credits to bot wallets

Context: ${JSON.stringify(context)}`
      },
      {
        role: "user",
        content: message
      }
    ],
    functions: [
      {
        name: "start_bumping",
        description: "Start automated bumping",
        parameters: {
          type: "object",
          properties: {
            amount: { type: "string", description: "Amount in ETH" },
            interval: { type: "number", description: "Interval in seconds" }
          }
        }
      },
      // ... other functions
    ]
  })
  
  // 3. Parse AI response
  const aiMessage = response.choices[0].message.content
  const functionCall = response.choices[0].message.function_call
  
  return {
    message: aiMessage || "I understand. Let me help you with that.",
    action: functionCall?.name,
    params: functionCall ? JSON.parse(functionCall.arguments) : undefined
  }
}
```

---

## 8. Security Best Practices

1. **Never Trust Client Input**
   - Always verify Telegram signature
   - Always verify user in database
   - Always use `wallet_address` from database (not from request)

2. **Use Telegram User ID as Source of Truth**
   - Telegram User ID cannot be faked (comes from Telegram)
   - Use it to lookup `wallet_address` in database
   - Never accept `wallet_address` directly from user

3. **Implement Rate Limiting**
   - Per Telegram User ID
   - Per IP address
   - Per action type

4. **Log Everything**
   - All webhook requests
   - All AI interactions
   - All action executions
   - All errors

5. **Monitor for Abuse**
   - Unusual request patterns
   - Multiple failed authentication attempts
   - Suspicious action sequences

---

## 9. Testing

### 9.1 Security Testing

```typescript
// Test: Cannot fake Telegram User ID
test("Cannot access other user's data", async () => {
  const response = await fetch("/api/telegram/webhook", {
    method: "POST",
    body: JSON.stringify({
      message: {
        from: { id: "999999999" }, // Fake Telegram ID
        text: "check balance"
      }
    })
  })
  
  expect(response.status).toBe(401) // Should fail signature verification
})

// Test: Valid user can access their data
test("Valid user can access their data", async () => {
  const validWebhook = createValidTelegramWebhook({
    telegramId: "123456789",
    message: "check balance"
  })
  
  const response = await fetch("/api/telegram/webhook", {
    method: "POST",
    body: JSON.stringify(validWebhook),
    headers: {
      "x-telegram-bot-api-secret-token": calculateSignature(validWebhook)
    }
  })
  
  expect(response.status).toBe(200)
})
```

---

## 10. Summary

### Key Points:

1. **User Identification:**
   - Telegram User ID dari webhook (cannot be faked)
   - Lookup `wallet_address` dari database
   - Gunakan `wallet_address` untuk semua operations

2. **Security:**
   - Verify Telegram signature pada setiap webhook
   - Jangan expose API endpoint langsung
   - Implement rate limiting
   - Log semua interactions

3. **Architecture:**
   - Webhook-only (recommended)
   - AI processes messages
   - Actions executed via existing APIs
   - Responses sent via Telegram Bot API

### Next Steps:

1. Setup Telegram Bot
2. Implement webhook handler
3. Integrate AI service
4. Connect to existing APIs
5. Test security measures
6. Deploy and monitor

