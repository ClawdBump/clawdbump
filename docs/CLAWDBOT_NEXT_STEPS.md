# ClawdBot Telegram Integration - Next Steps

## Current Status

✅ **Completed:**
- Security Layer 1: Telegram signature verification
- User identification via Telegram User ID
- Basic AI intent recognition
- Webhook handler structure
- Database verification

⚠️ **In Progress:**
- Action execution (partially implemented)
- AI response formatting

❌ **Not Started:**
- Full action implementation
- Error handling for actions
- Advanced AI processing (OpenAI/Anthropic)
- Command parsing and validation
- Session management via Telegram

---

## Next Steps

### 1. Complete Action Execution (Priority: HIGH)

**File:** `app/api/telegram/webhook/route.ts`

**Current Status:**
- `executeAction()` function exists but actions are not fully implemented
- Only basic structure is in place

**Tasks:**

#### 1.1 Implement `check_balance` Action
```typescript
async function executeAction(
  action: string,
  params: any,
  walletAddress: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  
  if (action === "check_balance") {
    // Fetch credit balance
    const { data: creditData } = await supabase
      .from("user_credits")
      .select("balance_wei")
      .eq("wallet_address", walletAddress.toLowerCase())
      .single()
    
    // Fetch bot wallet credits
    const { data: botCredits } = await supabase
      .from("bot_wallet_credits")
      .select("weth_balance_wei, native_eth_balance_wei")
      .eq("user_address", walletAddress.toLowerCase())
    
    // Calculate total
    const totalBalance = // ... calculation
    
    // Update AI response message with balance
    // (This will be sent in the main handler)
  }
}
```

#### 1.2 Implement `check_status` Action
```typescript
if (action === "check_status") {
  // Fetch active bot session
  const { data: session } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("user_address", walletAddress.toLowerCase())
    .eq("status", "running")
    .single()
  
  if (session) {
    // Format status message
    // Include: token address, amount per bump, interval, etc.
  } else {
    // No active session
  }
}
```

#### 1.3 Implement `start_bumping` Action
```typescript
if (action === "start_bumping") {
  // This requires user to provide:
  // - Token address
  // - Amount per bump (USD)
  // - Interval (seconds)
  
  // For now, return a message asking for these details
  // In future, can use conversation state to collect step-by-step
}
```

#### 1.4 Implement `stop_bumping` Action
```typescript
if (action === "stop_bumping") {
  // Call existing stop session API
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/bot/session`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userAddress: walletAddress }),
  })
}
```

---

### 2. Enhance AI Processing (Priority: MEDIUM)

**Current:** Basic keyword matching
**Target:** More sophisticated intent recognition

#### 2.1 Add OpenAI/Anthropic Integration

**Option A: OpenAI**
```typescript
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function processWithAI(
  message: string,
  user: { telegramId: string; walletAddress: string }
): Promise<{ message: string; action?: string; params?: any }> {
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `You are ClawdBot, an AI assistant for ClawdBump.
        You help users manage their bumping automation via Telegram.
        Available actions: check_balance, check_status, start_bumping, stop_bumping.
        Always respond in a friendly, helpful manner.`
      },
      {
        role: "user",
        content: message
      }
    ],
    functions: [
      {
        name: "check_balance",
        description: "Check user's credit balance",
      },
      {
        name: "check_status",
        description: "Check bumping automation status",
      },
      // ... more functions
    ],
    function_call: "auto",
  })
  
  // Parse response and return action
}
```

**Option B: Anthropic Claude**
```typescript
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function processWithAI(message: string, user: any) {
  const response = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: message
      }
    ],
  })
  
  // Parse response
}
```

#### 2.2 Add Conversation Context

Store conversation state in database or Redis:
```typescript
// Store in database
interface ConversationState {
  telegram_id: string
  current_action: string | null
  collected_params: Record<string, any>
  step: number
  updated_at: string
}
```

---

### 3. Add Command Parsing (Priority: MEDIUM)

**File:** `lib/telegram-commands.ts`

```typescript
interface ParsedCommand {
  command: string
  args: string[]
  flags: Record<string, string>
}

export function parseCommand(message: string): ParsedCommand {
  // Parse commands like:
  // "/start_bumping 0x123... 0.01 60"
  // "/check_balance"
  // "/stop"
  
  const parts = message.trim().split(/\s+/)
  const command = parts[0].replace('/', '')
  const args = parts.slice(1)
  
  // Parse flags: --token=0x123, --amount=0.01
  const flags: Record<string, string> = {}
  const filteredArgs: string[] = []
  
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=')
      flags[key] = value
    } else {
      filteredArgs.push(arg)
    }
  })
  
  return { command, args: filteredArgs, flags }
}
```

---

### 4. Add Error Handling (Priority: HIGH)

**Enhance error handling in webhook handler:**

```typescript
export async function POST(request: NextRequest) {
  try {
    // ... existing code
    
  } catch (error: any) {
    console.error("❌ Webhook error:", error)
    
    // Try to get telegramUserId from error context
    const telegramUserId = error.telegramUserId
    
    if (telegramUserId) {
      await sendTelegramMessage(
        telegramUserId,
        "❌ An error occurred. Please try again later."
      )
    }
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

---

### 5. Add Rate Limiting (Priority: MEDIUM)

**Prevent API abuse:**

```typescript
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 requests per minute
})

export async function POST(request: NextRequest) {
  // Get Telegram User ID
  const telegramUserId = // ... extract from webhook
  
  // Check rate limit
  const { success, limit, remaining } = await ratelimit.limit(
    `telegram:${telegramUserId}`
  )
  
  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    )
  }
  
  // ... continue processing
}
```

---

### 6. Add Webhook Setup Documentation (Priority: LOW)

**Create guide for setting up Telegram webhook:**

```markdown
# Setting Up Telegram Webhook

1. Get your bot token from @BotFather
2. Set webhook URL:
   ```bash
   curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://your-domain.com/api/telegram/webhook",
       "secret_token": "your-secret-token"
     }'
   ```

3. Verify webhook:
   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
   ```
```

---

### 7. Testing Checklist

- [ ] Test webhook signature verification
- [ ] Test user identification
- [ ] Test each action (check_balance, check_status, start_bumping, stop_bumping)
- [ ] Test error handling
- [ ] Test rate limiting
- [ ] Test AI processing (if implemented)
- [ ] Test conversation flow (if implemented)

---

## Implementation Order

1. **Week 1:** Complete action execution (check_balance, check_status, stop_bumping)
2. **Week 2:** Add error handling and rate limiting
3. **Week 3:** Enhance AI processing (OpenAI/Anthropic)
4. **Week 4:** Add conversation context and command parsing
5. **Week 5:** Testing and documentation

---

## Environment Variables Needed

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_WEBHOOK_SECRET=your_webhook_secret

# AI (Optional)
OPENAI_API_KEY=your_openai_key
# OR
ANTHROPIC_API_KEY=your_anthropic_key

# Rate Limiting (Optional)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

---

## Resources

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic Messages API](https://docs.anthropic.com/claude/reference/messages_post)

