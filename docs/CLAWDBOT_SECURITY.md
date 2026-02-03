# ClawdBot Security Guide

## Quick Reference: Preventing API Abuse

### Problem: User Menembak API dengan Telegram ID Orang Lain

**Attack Vector:**
```bash
# Attacker mengirim request langsung
curl -X POST https://api.clawdbump.com/api/bot/start-bumping \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": "123456789",  # Telegram ID korban
    "amount": "1.0"
  }'
```

### Solution: Multi-Layer Defense

#### ✅ Layer 1: Telegram Webhook Only (Primary Defense)

**Jangan expose API endpoint yang menerima `telegramId` langsung!**

```typescript
// ❌ BAD - Expose endpoint dengan telegramId
POST /api/bot/start-bumping
Body: { "telegramId": "123456789", "amount": "1.0" }
// Siapa saja bisa call dengan telegram ID orang lain!

// ✅ GOOD - Only accept Telegram webhook
POST /api/telegram/webhook
// Telegram signature verification required
// Telegram User ID dari webhook (cannot be faked)
```

**Why it works:**
- Telegram webhook memiliki signature yang divalidasi dengan `TELEGRAM_BOT_TOKEN`
- Telegram User ID (`from.id`) berasal dari Telegram, tidak bisa dipalsukan
- Hanya Telegram yang bisa mengirim webhook dengan signature valid

#### ✅ Layer 2: Signature Verification

```typescript
function verifyTelegramWebhook(
  body: string,
  secretToken: string,
  botToken: string
): boolean {
  // Telegram sends secret token in header
  if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return false
  }
  
  // Additional: Verify webhook payload signature
  const calculatedHash = crypto
    .createHmac('sha256', botToken)
    .update(body)
    .digest('hex')
  
  // Compare with signature from Telegram
  return calculatedHash === webhookSignature
}
```

#### ✅ Layer 3: Database Verification

```typescript
// Always verify user exists in database
const user = await supabase
  .from("telegram_user_mappings")
  .select("telegram_id, wallet_address")
  .eq("telegram_id", telegramUserId) // From webhook, not from request body
  .single()

if (!user) {
  return "User not found. Please login first."
}

// Use wallet_address from database (not from request)
const walletAddress = user.walletAddress
```

#### ✅ Layer 4: Rate Limiting

```typescript
// Limit requests per Telegram User ID
const rateLimiter = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(telegramUserId: string): boolean {
  const now = Date.now()
  const limit = rateLimiter.get(telegramUserId)
  
  if (!limit || now > limit.resetAt) {
    rateLimiter.set(telegramUserId, { 
      count: 1, 
      resetAt: now + 60000 // 1 minute window
    })
    return true
  }
  
  if (limit.count >= 10) { // Max 10 requests per minute
    return false
  }
  
  limit.count++
  return true
}
```

#### ✅ Layer 5: Request Signing (If API Endpoint Needed)

Jika tetap perlu expose API endpoint (tidak recommended):

```typescript
// Generate secret key untuk setiap user saat login
const secretKey = crypto.randomBytes(32).toString('hex')

// Store hashed version in database
await supabase
  .from("telegram_user_mappings")
  .update({ secret_key_hash: hashSecretKey(secretKey) })
  .eq("telegram_id", telegramUserId)

// User must sign every request
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
  
  // 2. Recreate signature
  const data = `${request.telegramId}:${request.action}:${JSON.stringify(request.params)}:${request.timestamp}`
  const calculatedSignature = crypto
    .createHmac('sha256', user.secretKey)
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

---

## Security Checklist

### ✅ Must Have

- [ ] **Telegram Webhook Signature Verification**
  - Verify `x-telegram-bot-api-secret-token` header
  - Verify webhook payload signature (if available)

- [ ] **User Identification from Webhook**
  - Extract Telegram User ID from `webhook.message.from.id`
  - Never accept Telegram User ID from request body

- [ ] **Database Verification**
  - Always verify user exists in `telegram_user_mappings`
  - Use `wallet_address` from database (not from request)

- [ ] **Rate Limiting**
  - Per Telegram User ID
  - Per IP address
  - Per action type

### ✅ Should Have

- [ ] **Input Validation**
  - Validate all parameters
  - Check action permissions
  - Sanitize user inputs

- [ ] **Audit Logging**
  - Log all webhook requests
  - Log all AI interactions
  - Log all action executions

- [ ] **Error Handling**
  - Don't expose internal errors
  - Provide user-friendly messages
  - Log errors for debugging

### ✅ Nice to Have

- [ ] **IP Whitelist**
  - Only accept from Telegram IP ranges
  - Block suspicious IPs

- [ ] **Session Management**
  - Store active sessions
  - Validate session on every request
  - Auto-expire old sessions

- [ ] **Monitoring & Alerts**
  - Monitor for unusual patterns
  - Alert on suspicious activity
  - Track failed authentication attempts

---

## Example: Secure Webhook Handler

```typescript
// app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import crypto from "crypto"

export async function POST(request: NextRequest) {
  try {
    // ============================================
    // LAYER 1: Verify Telegram Signature
    // ============================================
    const body = await request.text()
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token')
    
    if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      console.error("❌ Invalid webhook secret token")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const webhook = JSON.parse(body)
    
    // ============================================
    // LAYER 2: Extract Telegram User ID (from Telegram, cannot be faked)
    // ============================================
    const telegramUserId = String(webhook.message?.from?.id)
    
    if (!telegramUserId) {
      console.error("❌ Missing Telegram User ID in webhook")
      return NextResponse.json({ error: "Invalid webhook" }, { status: 400 })
    }
    
    // ============================================
    // LAYER 3: Rate Limiting
    // ============================================
    if (!checkRateLimit(telegramUserId)) {
      await sendTelegramMessage(telegramUserId, 
        "⏸️ Too many requests. Please wait a moment."
      )
      return NextResponse.json({ success: true })
    }
    
    // ============================================
    // LAYER 4: Verify User in Database
    // ============================================
    const supabase = createSupabaseServiceClient()
    const { data: user, error } = await supabase
      .from("telegram_user_mappings")
      .select("telegram_id, wallet_address, privy_user_id, owner_address")
      .eq("telegram_id", telegramUserId)
      .single()
    
    if (error || !user) {
      console.log(`⚠️ User not found: ${telegramUserId}`)
      await sendTelegramMessage(telegramUserId,
        "❌ You need to login first via Telegram Mini App.\n\n" +
        "Please open the app and login with your wallet."
      )
      return NextResponse.json({ success: true })
    }
    
    // ============================================
    // LAYER 5: Process Message with AI
    // ============================================
    const messageText = webhook.message.text
    const aiResponse = await processWithAI(messageText, user)
    
    // ============================================
    // LAYER 6: Execute Actions (if needed)
    // ============================================
    if (aiResponse.action) {
      // Use wallet_address from database (NOT from request)
      await executeAction(
        aiResponse.action,
        aiResponse.params,
        user.walletAddress // From database, secure!
      )
    }
    
    // ============================================
    // LAYER 7: Send Response
    // ============================================
    await sendTelegramMessage(telegramUserId, aiResponse.message)
    
    // ============================================
    // LAYER 8: Audit Logging
    // ============================================
    await logInteraction({
      telegramId: telegramUserId,
      walletAddress: user.walletAddress,
      message: messageText,
      response: aiResponse.message,
      action: aiResponse.action,
      timestamp: new Date().toISOString()
    })
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("❌ Error processing webhook:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Helper: Rate limiting
const rateLimiter = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(telegramUserId: string): boolean {
  const now = Date.now()
  const limit = rateLimiter.get(telegramUserId)
  
  if (!limit || now > limit.resetAt) {
    rateLimiter.set(telegramUserId, { 
      count: 1, 
      resetAt: now + 60000 // 1 minute
    })
    return true
  }
  
  if (limit.count >= 10) { // Max 10 requests per minute
    return false
  }
  
  limit.count++
  return true
}
```

---

## Key Takeaways

1. **Never Trust Client Input**
   - Always verify Telegram signature
   - Always extract Telegram User ID from webhook (not from request body)
   - Always verify user in database

2. **Use Database as Source of Truth**
   - Lookup `wallet_address` from database using Telegram User ID
   - Never accept `wallet_address` directly from user
   - Use `wallet_address` from database for all operations

3. **Implement Multiple Layers**
   - Telegram signature verification
   - Rate limiting
   - Database verification
   - Audit logging

4. **Monitor for Abuse**
   - Log all interactions
   - Track failed authentications
   - Alert on suspicious patterns

---

## Testing Security

```typescript
// Test 1: Cannot fake Telegram User ID
test("Reject request with fake Telegram User ID", async () => {
  const response = await fetch("/api/telegram/webhook", {
    method: "POST",
    body: JSON.stringify({
      message: {
        from: { id: "999999999" }, // Fake ID
        text: "check balance"
      }
    }),
    headers: {
      "x-telegram-bot-api-secret-token": "fake-secret"
    }
  })
  
  expect(response.status).toBe(401) // Should fail signature verification
})

// Test 2: Valid webhook works
test("Accept valid Telegram webhook", async () => {
  const validWebhook = createValidTelegramWebhook({
    telegramId: "123456789",
    message: "check balance"
  })
  
  const response = await fetch("/api/telegram/webhook", {
    method: "POST",
    body: JSON.stringify(validWebhook),
    headers: {
      "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET
    }
  })
  
  expect(response.status).toBe(200)
})
```

