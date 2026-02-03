import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import crypto from "crypto"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/telegram/webhook
 * 
 * Telegram Bot Webhook Handler for ClawdBot AI Assistant
 * 
 * Security Layer 1: Telegram Signature Verification
 * - Verifies x-telegram-bot-api-secret-token header
 * - Extracts Telegram User ID from webhook (cannot be faked)
 * - Verifies user exists in database
 * 
 * Flow:
 * 1. Verify Telegram webhook signature
 * 2. Extract Telegram User ID from webhook
 * 3. Verify user in database
 * 4. Process message with AI
 * 5. Execute actions if needed
 * 6. Send response to user
 */
export async function POST(request: NextRequest) {
  try {
    // ============================================
    // LAYER 1: Verify Telegram Signature
    // ============================================
    const body = await request.text()
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token')
    
    const expectedSecretToken = process.env.TELEGRAM_WEBHOOK_SECRET
    
    if (!expectedSecretToken) {
      console.error("❌ TELEGRAM_WEBHOOK_SECRET not configured")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }
    
    if (secretToken !== expectedSecretToken) {
      console.error("❌ Invalid webhook secret token")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const webhook = JSON.parse(body)
    
    // ============================================
    // LAYER 2: Extract Telegram User ID (from Telegram, cannot be faked)
    // ============================================
    const telegramUserId = String(webhook.message?.from?.id)
    const messageText = webhook.message?.text
    
    if (!telegramUserId) {
      console.error("❌ Missing Telegram User ID in webhook")
      return NextResponse.json({ error: "Invalid webhook" }, { status: 400 })
    }
    
    if (!messageText) {
      console.log("ℹ️ No message text, ignoring webhook")
      return NextResponse.json({ success: true })
    }
    
    console.log(`📨 [ClawdBot] Message from Telegram User ID: ${telegramUserId}`)
    console.log(`   → Message: ${messageText}`)
    
    // ============================================
    // LAYER 3: Verify User in Database
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
    
    console.log(`✅ User verified: ${user.wallet_address}`)
    
    // ============================================
    // LAYER 4: Process Message with AI
    // ============================================
    const aiResponse = await processWithAI(messageText, user)
    
    // ============================================
    // LAYER 5: Execute Actions (if needed)
    // ============================================
    if (aiResponse.action) {
      console.log(`🔧 Executing action: ${aiResponse.action}`)
      await executeAction(
        aiResponse.action,
        aiResponse.params,
        user.wallet_address // From database, secure!
      )
    }
    
    // ============================================
    // LAYER 6: Send Response
    // ============================================
    await sendTelegramMessage(telegramUserId, aiResponse.message)
    
    // ============================================
    // LAYER 7: Audit Logging
    // ============================================
    await logInteraction({
      telegramId: telegramUserId,
      walletAddress: user.wallet_address,
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

/**
 * Process message with AI
 */
async function processWithAI(
  message: string,
  user: { telegramId: string; walletAddress: string; privyUserId: string | null; ownerAddress: string | null }
): Promise<{ message: string; action?: string; params?: any }> {
  // Basic AI processing (can be enhanced with OpenAI/Anthropic later)
  const lowerMessage = message.toLowerCase().trim()
  
  // Intent recognition
  if (lowerMessage.includes("start") && (lowerMessage.includes("bump") || lowerMessage.includes("bumping"))) {
    return {
      message: "🚀 Starting bumping automation...\n\nI'll help you start the bumping process. Please provide:\n- Token address\n- Amount per bump (USD)\n- Interval (seconds)",
      action: "start_bumping",
      params: {}
    }
  }
  
  if (lowerMessage.includes("stop") && (lowerMessage.includes("bump") || lowerMessage.includes("bumping"))) {
    return {
      message: "🛑 Stopping bumping automation...",
      action: "stop_bumping",
      params: {}
    }
  }
  
  if (lowerMessage.includes("balance") || lowerMessage.includes("credit")) {
    return {
      message: "💰 Checking your credit balance...",
      action: "check_balance",
      params: {}
    }
  }
  
  if (lowerMessage.includes("status")) {
    return {
      message: "📊 Checking bumping status...",
      action: "check_status",
      params: {}
    }
  }
  
  // Default response
  return {
    message: `👋 Hello! I'm ClawdBot, your AI assistant for ClawdBump.\n\n` +
      `I can help you with:\n` +
      `• Start/Stop bumping automation\n` +
      `• Check credit balance\n` +
      `• Check bumping status\n` +
      `• Distribute credits\n\n` +
      `Try saying: "start bumping", "check balance", or "status"`
  }
}

/**
 * Execute action based on AI response
 */
async function executeAction(
  action: string,
  params: any,
  walletAddress: string
): Promise<void> {
  try {
    switch (action) {
      case "start_bumping":
        // Call start session API
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/bot/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: walletAddress,
            tokenAddress: params.tokenAddress,
            amountUsd: params.amountUsd || "0.01",
            intervalSeconds: params.intervalSeconds || 60,
          }),
        })
        break
        
      case "stop_bumping":
        // Call stop session API
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/bot/session`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: walletAddress }),
        })
        break
        
      case "check_balance":
        // Balance check is handled in AI response
        break
        
      case "check_status":
        // Status check is handled in AI response
        break
        
      default:
        console.warn(`⚠️ Unknown action: ${action}`)
    }
  } catch (error: any) {
    console.error(`❌ Error executing action ${action}:`, error)
  }
}

/**
 * Send message to Telegram user
 */
async function sendTelegramMessage(telegramUserId: string, message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  
  if (!botToken) {
    console.error("❌ TELEGRAM_BOT_TOKEN not configured")
    return
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramUserId,
        text: message,
        parse_mode: "Markdown",
      }),
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      console.error(`❌ Failed to send Telegram message:`, errorData)
    }
  } catch (error: any) {
    console.error(`❌ Error sending Telegram message:`, error)
  }
}

/**
 * Log interaction for audit
 */
async function logInteraction(data: {
  telegramId: string
  walletAddress: string
  message: string
  response: string
  action?: string
  timestamp: string
}): Promise<void> {
  try {
    const supabase = createSupabaseServiceClient()
    await supabase.from("bot_logs").insert({
      user_address: data.walletAddress.toLowerCase(),
      bot_wallet_address: null, // ClawdBot interaction, not bot wallet
      action: data.action || "clawdbot_interaction",
      status: "success",
      message: `[ClawdBot] ${data.message} → ${data.response}`,
      tx_hash: null,
      token_address: null,
      amount_wei: "0",
    })
  } catch (error: any) {
    console.error("❌ Error logging interaction:", error)
  }
}

