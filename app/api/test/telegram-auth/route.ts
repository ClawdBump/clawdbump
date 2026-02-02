import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/test/telegram-auth
 * 
 * Test endpoint untuk debug Telegram OAuth response false
 * 
 * Query Parameters:
 * - bot_token: Bot token untuk test
 * - telegram_id: Telegram user ID (optional, untuk test)
 * 
 * Response:
 * - Bot info dari Telegram API
 * - Domain validation check
 * - Bot token validation
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const botToken = searchParams.get("bot_token")
    const telegramId = searchParams.get("telegram_id")

    if (!botToken) {
      return NextResponse.json(
        {
          error: "Missing bot_token parameter",
          message: "Add ?bot_token=YOUR_BOT_TOKEN to URL",
        },
        { status: 400 }
      )
    }

    // Test 1: Get bot info
    const botInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getMe`
    )
    const botInfo = await botInfoResponse.json()

    if (!botInfo.ok) {
      return NextResponse.json(
        {
          error: "Invalid bot token",
          message: botInfo.description || "Bot token is invalid",
          botInfo,
        },
        { status: 400 }
      )
    }

    // Test 2: Get bot updates (to check if bot is active)
    const updatesResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates`
    )
    const updates = await updatesResponse.json()

    // Test 3: Check if we can get webhook info (if configured)
    const webhookInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    )
    const webhookInfo = await webhookInfoResponse.json()

    return NextResponse.json({
      success: true,
      botInfo: {
        id: botInfo.result.id,
        username: botInfo.result.username,
        first_name: botInfo.result.first_name,
        is_bot: botInfo.result.is_bot,
      },
      botStatus: {
        updates_ok: updates.ok,
        updates_count: updates.ok ? updates.result?.length || 0 : 0,
        webhook_configured: webhookInfo.ok && webhookInfo.result?.url,
      },
      validation: {
        bot_id: botInfo.result.id,
        expected_bot_id: 8456270009,
        bot_id_match: botInfo.result.id === 8456270009,
        bot_username: botInfo.result.username,
        expected_username: "farbump_bot",
        username_match: botInfo.result.username === "farbump_bot",
      },
      recommendations: {
        domain_check: "Verify domain in BotFather: /setdomain → should be 'farbump.vercel.app' (without https://)",
        privy_config: "Verify in Privy Dashboard: Bot Token and Bot Handle (@farbump_bot) must match",
        user_start_bot: "User must send /start to bot in Telegram before login",
      },
    })
  } catch (error: any) {
    console.error("❌ Error in Telegram auth test:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Failed to test Telegram authentication",
      },
      { status: 500 }
    )
  }
}

