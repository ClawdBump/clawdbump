import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const VALID_ACTIONS = ["check_balance", "check_status", "stop_bumping", "start_bumping"] as const
type BotAction = (typeof VALID_ACTIONS)[number]

interface BotActionBody {
  telegramId: string
  action: string
  params?: {
    tokenAddress?: string
    amountUsd?: string
    intervalSeconds?: number
  }
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

function getBotSecret(): string | undefined {
  return process.env.CLAWDBUMP_BOT_SECRET
}

/**
 * POST /api/telegram/bot-action
 *
 * Called by Clawdbump Bot (OpenClaw) to perform actions on behalf of a Telegram user.
 * Authenticates via CLAWDBUMP_BOT_SECRET; resolves telegramId → wallet_address from telegram_user_mappings.
 *
 * Body: { telegramId, action, params? }
 * Actions: check_balance | check_status | stop_bumping | start_bumping
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth: verify bot secret
    const authHeader = request.headers.get("authorization")
    const secretHeader = request.headers.get("x-bot-secret")
    const secret = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : secretHeader ?? ""

    const expectedSecret = getBotSecret()
    if (!expectedSecret) {
      console.error("❌ [bot-action] CLAWDBUMP_BOT_SECRET not configured")
      return NextResponse.json(
        { success: false, error: "server_config", message: "Bot action not configured" },
        { status: 500 }
      )
    }
    if (secret !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: "unauthorized", message: "Invalid or missing bot secret" },
        { status: 401 }
      )
    }

    // 2. Parse body
    let body: BotActionBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: "bad_request", message: "Invalid JSON body" },
        { status: 400 }
      )
    }

    const { telegramId, action, params = {} } = body
    if (!telegramId || typeof telegramId !== "string") {
      return NextResponse.json(
        { success: false, error: "bad_request", message: "Missing or invalid telegramId" },
        { status: 400 }
      )
    }
    if (!action || !VALID_ACTIONS.includes(action as BotAction)) {
      return NextResponse.json(
        {
          success: false,
          error: "bad_request",
          message: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`,
        },
        { status: 400 }
      )
    }

    // 3. Resolve telegramId → wallet_address
    const supabase = createSupabaseServiceClient()
    const { data: user, error: userError } = await supabase
      .from("telegram_user_mappings")
      .select("telegram_id, wallet_address")
      .eq("telegram_id", String(telegramId))
      .single()

    if (userError || !user?.wallet_address) {
      console.log(`⚠️ [bot-action] User not found for telegramId: ${telegramId}`)
      return NextResponse.json(
        {
          success: false,
          error: "user_not_found",
          message: "User belum login via Mini App.",
        },
        { status: 404 }
      )
    }

    const walletAddress = user.wallet_address.toLowerCase()
    const baseUrl = getBaseUrl()

    // 4. Route action to internal APIs
    switch (action as BotAction) {
      case "check_balance": {
        const res = await fetch(`${baseUrl}/api/credit-balance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: walletAddress }),
        })
        const data = await res.json()
        if (!res.ok) {
          return NextResponse.json(
            {
              success: false,
              action: "check_balance",
              error: data.error ?? "Failed to fetch balance",
              message: data.error ?? "Gagal mengambil balance",
            },
            { status: 200 }
          )
        }
        return NextResponse.json({
          success: true,
          action: "check_balance",
          data: {
            balanceEth: data.balanceEth,
            balanceWei: data.balanceWei,
            mainWalletCreditWei: data.mainWalletCreditWei,
            botWalletCreditsWei: data.botWalletCreditsWei,
          },
        })
      }

      case "check_status": {
        const res = await fetch(
          `${baseUrl}/api/bot/session?userAddress=${encodeURIComponent(walletAddress)}`,
          { method: "GET", headers: { Accept: "application/json" } }
        )
        const data = await res.json()
        if (!res.ok) {
          return NextResponse.json(
            {
              success: false,
              action: "check_status",
              error: data.error ?? "Failed to fetch session",
              message: data.error ?? "Gagal mengambil status",
            },
            { status: 200 }
          )
        }
        return NextResponse.json({
          success: true,
          action: "check_status",
          data: { session: data.session ?? null },
        })
      }

      case "stop_bumping": {
        const res = await fetch(
          `${baseUrl}/api/bot/session?userAddress=${encodeURIComponent(walletAddress)}`,
          { method: "DELETE", headers: { Accept: "application/json" } }
        )
        const data = await res.json()
        if (!res.ok) {
          return NextResponse.json(
            {
              success: false,
              action: "stop_bumping",
              error: data.error ?? "Failed to stop session",
              message: data.error ?? "Gagal menghentikan session",
            },
            { status: 200 }
          )
        }
        return NextResponse.json({
          success: true,
          action: "stop_bumping",
          data: { session: data.session ?? null },
        })
      }

      case "start_bumping": {
        const { tokenAddress, amountUsd, intervalSeconds } = params
        if (!tokenAddress || !amountUsd || intervalSeconds == null) {
          return NextResponse.json(
            {
              success: false,
              action: "start_bumping",
              error: "missing_params",
              message:
                "Parameter kurang. Butuh: tokenAddress, amountUsd, intervalSeconds (2-600).",
            },
            { status: 400 }
          )
        }
        const numInterval = Number(intervalSeconds)
        if (numInterval < 2 || numInterval > 600) {
          return NextResponse.json(
            {
              success: false,
              action: "start_bumping",
              error: "invalid_interval",
              message: "intervalSeconds harus antara 2 dan 600.",
            },
            { status: 400 }
          )
        }
        const res = await fetch(`${baseUrl}/api/bot/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: walletAddress,
            tokenAddress,
            amountUsd: String(amountUsd),
            intervalSeconds: numInterval,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          return NextResponse.json(
            {
              success: false,
              action: "start_bumping",
              error: data.error ?? "Failed to start session",
              message: data.error ?? "Gagal memulai session",
            },
            { status: 200 }
          )
        }
        return NextResponse.json({
          success: true,
          action: "start_bumping",
          data: { session: data.session ?? null },
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: "bad_request", message: "Unknown action" },
          { status: 400 }
        )
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error("❌ [bot-action] Error:", err)
    return NextResponse.json(
      {
        success: false,
        error: "internal_error",
        message: err.message || "Internal server error",
      },
      { status: 500 }
    )
  }
}
