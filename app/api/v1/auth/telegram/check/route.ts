import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/v1/auth/telegram/check
 * 
 * Check if a Telegram user has logged in to FarBump
 * 
 * This endpoint is used by ClawdBumpbot to check if a Telegram user
 * has logged in to FarBump via Telegram OAuth.
 * 
 * Query Parameters:
 * - telegram_id (required): Telegram user ID to check
 * 
 * Response:
 * {
 *   "is_logged_in": true,
 *   "wallet_address": "0x...",
 *   "telegram_username": "john_doe",
 *   "last_login_at": "2024-01-01T00:00:00Z"
 * }
 * 
 * OR if not logged in:
 * {
 *   "is_logged_in": false
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const telegramId = searchParams.get("telegram_id")

    if (!telegramId) {
      return NextResponse.json(
        {
          error: "Missing required parameter: telegram_id",
          message: "telegram_id is required to check login status",
        },
        { status: 400 }
      )
    }

    // Validate telegram_id format
    if (!/^\d+$/.test(telegramId)) {
      return NextResponse.json(
        {
          error: "Invalid telegram_id format",
          message: "telegram_id must be a numeric string",
        },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()

    // Check if user has logged in
    const { data, error } = await supabase
      .from("telegram_user_mappings")
      .select("wallet_address, telegram_username, last_login_at, is_active")
      .eq("telegram_id", telegramId)
      .eq("is_active", true)
      .single()

    if (error) {
      // If no record found, user hasn't logged in
      if (error.code === "PGRST116") {
        return NextResponse.json({
          is_logged_in: false,
          message: "User has not logged in to FarBump via Telegram",
        })
      }

      console.error("❌ Error checking Telegram login status:", error)
      return NextResponse.json(
        {
          error: "Failed to check login status",
          message: error.message || "Database error",
        },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({
        is_logged_in: false,
        message: "User has not logged in to FarBump via Telegram",
      })
    }

    return NextResponse.json({
      is_logged_in: true,
      wallet_address: data.wallet_address,
      telegram_username: data.telegram_username || null,
      last_login_at: data.last_login_at,
    })
  } catch (error: any) {
    console.error("❌ Error in Telegram check endpoint:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Failed to check Telegram login status",
      },
      { status: 500 }
    )
  }
}

