import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/v1/auth/telegram/pair
 * 
 * Pair Telegram ID with Privy user after successful Telegram login
 * 
 * This endpoint is called after user successfully logs in via Telegram through Privy.
 * It stores the mapping between Telegram ID and Privy user (wallet address) in the database.
 * 
 * Request Body:
 * {
 *   "telegram_id": "123456789", // Required: Telegram user ID from Privy
 *   "telegram_username": "john_doe", // Optional: Telegram username
 *   "wallet_address": "0x...", // Required: Smart Wallet address from Privy
 *   "privy_user_id": "did:privy:...", // Required: Privy user ID (DID)
 *   "first_name": "John", // Optional: Telegram first name
 *   "last_name": "Doe", // Optional: Telegram last name
 *   "photo_url": "https://..." // Optional: Telegram profile photo URL
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Telegram ID paired successfully",
 *   "data": { ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      telegram_id,
      telegram_username,
      wallet_address,
      privy_user_id,
      first_name,
      last_name,
      photo_url,
    } = body

    // Validate required fields
    if (!telegram_id) {
      return NextResponse.json(
        {
          error: "Missing required field: telegram_id",
          message: "telegram_id is required to pair Telegram account",
        },
        { status: 400 }
      )
    }

    if (!wallet_address) {
      return NextResponse.json(
        {
          error: "Missing required field: wallet_address",
          message: "wallet_address is required to pair Telegram account",
        },
        { status: 400 }
      )
    }

    if (!privy_user_id) {
      return NextResponse.json(
        {
          error: "Missing required field: privy_user_id",
          message: "privy_user_id is required to pair Telegram account",
        },
        { status: 400 }
      )
    }

    // Validate telegram_id format (should be numeric string)
    if (!/^\d+$/.test(telegram_id)) {
      return NextResponse.json(
        {
          error: "Invalid telegram_id format",
          message: "telegram_id must be a numeric string",
        },
        { status: 400 }
      )
    }

    // Normalize wallet address
    const normalizedWalletAddress = wallet_address.toLowerCase()

    const supabase = createSupabaseServiceClient()

    // Upsert telegram user mapping
    // This will create a new mapping or update existing one
    const { data, error } = await supabase
      .from("telegram_user_mappings")
      .upsert(
        {
          telegram_id,
          telegram_username: telegram_username || null,
          wallet_address: normalizedWalletAddress,
          privy_user_id,
          first_name: first_name || null,
          last_name: last_name || null,
          photo_url: photo_url || null,
          is_active: true,
          last_login_at: new Date().toISOString(),
        },
        {
          onConflict: "telegram_id", // Update if telegram_id already exists
        }
      )
      .select()
      .single()

    if (error) {
      console.error("❌ Error pairing Telegram ID:", error)
      return NextResponse.json(
        {
          error: "Failed to pair Telegram ID",
          message: error.message || "Database error",
        },
        { status: 500 }
      )
    }

    console.log("✅ Telegram ID paired successfully:", {
      telegram_id,
      telegram_username: telegram_username || "N/A",
      wallet_address: normalizedWalletAddress,
    })

    return NextResponse.json({
      success: true,
      message: "Telegram ID paired successfully",
      data,
    })
  } catch (error: any) {
    console.error("❌ Error in Telegram pair endpoint:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Failed to process Telegram pairing",
      },
      { status: 500 }
    )
  }
}

