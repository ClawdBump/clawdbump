import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/v1/auth/telegram/upsert-wallet
 * 
 * Upsert wallet address for Telegram user after Privy login
 * 
 * This endpoint is called from frontend after Privy login succeeds.
 * It upserts (INSERT or UPDATE) the wallet_address in telegram_user_mappings table.
 * 
 * Request Body:
 * {
 *   "telegram_id": "123456789",
 *   "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
 *   "privy_user_id": "did:privy:abc123"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Wallet address upserted successfully",
 *   "data": { ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    console.log("📥 [UPSERT-WALLET] ============================================")
    console.log("📥 [UPSERT-WALLET] Received request to upsert wallet")
    
    const body = await request.json()
    
    // Map frontend camelCase to database snake_case
    // Frontend sends: telegramId, walletAddress, privyUserId
    // Database expects: telegram_id, wallet_address, privy_user_id
    const telegram_id = body.telegram_id || body.telegramId
    const wallet_address = body.wallet_address || body.walletAddress
    const privy_user_id = body.privy_user_id || body.privyUserId || body.privy_did

    console.log("📥 [UPSERT-WALLET] Request body (raw):", body)
    console.log("📥 [UPSERT-WALLET] Request body (mapped to snake_case):", {
      telegram_id: telegram_id,
      wallet_address: wallet_address,
      privy_user_id: privy_user_id,
      has_telegram_id: !!telegram_id,
      has_wallet_address: !!wallet_address,
      has_privy_user_id: !!privy_user_id,
    })

    // =============================================
    // 1. Validate Request Body
    // =============================================
    if (!telegram_id) {
      console.error("❌ [UPSERT-WALLET] Missing telegram_id")
      return NextResponse.json(
        {
          success: false,
          error: "Missing required field: telegram_id",
          message: "telegram_id is required to upsert wallet",
        },
        { status: 400 }
      )
    }

    if (!wallet_address) {
      console.error("❌ [UPSERT-WALLET] Missing wallet_address")
      return NextResponse.json(
        {
          success: false,
          error: "Missing required field: wallet_address",
          message: "wallet_address is required to upsert wallet",
        },
        { status: 400 }
      )
    }

    if (!privy_user_id) {
      console.error("❌ [UPSERT-WALLET] Missing privy_user_id")
      return NextResponse.json(
        {
          success: false,
          error: "Missing required field: privy_user_id",
          message: "privy_user_id is required to upsert wallet",
        },
        { status: 400 }
      )
    }

    // Validate telegram_id format (should be numeric string)
    if (!/^\d+$/.test(telegram_id)) {
      console.error("❌ [UPSERT-WALLET] Invalid telegram_id format:", telegram_id)
      return NextResponse.json(
        {
          success: false,
          error: "Invalid telegram_id format",
          message: "telegram_id must be a numeric string",
        },
        { status: 400 }
      )
    }

    // Validate wallet address format
    const normalizedWalletAddress = wallet_address.toLowerCase()
    if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedWalletAddress)) {
      console.error("❌ [UPSERT-WALLET] Invalid wallet_address format:", wallet_address)
      return NextResponse.json(
        {
          success: false,
          error: "Invalid wallet_address format",
          message: "wallet_address must be a valid Ethereum address",
        },
        { status: 400 }
      )
    }

    console.log("✅ [UPSERT-WALLET] Request validation passed")

    // =============================================
    // 2. Check Supabase Service Role Key
    // =============================================
    console.log("🔍 [UPSERT-WALLET] Checking SUPABASE_SERVICE_ROLE_KEY...")
    const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
    console.log("🔍 [UPSERT-WALLET] SUPABASE_SERVICE_ROLE_KEY exists:", hasServiceRoleKey)
    
    if (!hasServiceRoleKey) {
      console.error("❌ [UPSERT-WALLET] SUPABASE_SERVICE_ROLE_KEY not configured!")
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration error",
          message: "SUPABASE_SERVICE_ROLE_KEY is not configured. This is required to bypass RLS.",
        },
        { status: 500 }
      )
    }

    // =============================================
    // 3. Prepare Data for Upsert (snake_case for database)
    // =============================================
    // IMPORTANT: All column names must match database schema exactly (snake_case)
    // Database schema: telegram_id (TEXT), wallet_address (TEXT), privy_user_id (TEXT)
    const upsertData = {
      telegram_id: String(telegram_id), // Ensure it's a string (TEXT type in database)
      wallet_address: normalizedWalletAddress, // Already normalized to lowercase
      privy_user_id: String(privy_user_id), // Ensure it's a string (TEXT type in database)
      is_active: true,
      last_login_at: new Date().toISOString(),
    }

    console.log("🔍 [UPSERT-WALLET] Attempting to Upsert to Supabase (snake_case columns):", {
      telegram_id: upsertData.telegram_id,
      wallet_address: upsertData.wallet_address,
      privy_user_id: upsertData.privy_user_id,
      is_active: upsertData.is_active,
      last_login_at: upsertData.last_login_at,
    })
    console.log("🔍 [UPSERT-WALLET] Data types:", {
      telegram_id_type: typeof upsertData.telegram_id,
      wallet_address_type: typeof upsertData.wallet_address,
      privy_user_id_type: typeof upsertData.privy_user_id,
    })

    // =============================================
    // 4. Upsert to Database
    // =============================================
    console.log("🔍 [UPSERT-WALLET] Creating Supabase service client...")
    const supabase = createSupabaseServiceClient()
    
    console.log("🔍 [UPSERT-WALLET] Calling supabase.from('telegram_user_mappings').upsert()...")
    const { data, error } = await supabase
      .from("telegram_user_mappings")
      .upsert(
        upsertData,
        {
          onConflict: "telegram_id", // Update if telegram_id already exists
        }
      )
      .select()
      .single()

    if (error) {
      console.error("❌ [UPSERT-WALLET] Error upserting to Supabase:", error)
      console.error("❌ [UPSERT-WALLET] Error code:", error.code)
      console.error("❌ [UPSERT-WALLET] Error message:", error.message)
      console.error("❌ [UPSERT-WALLET] Error details:", JSON.stringify(error, null, 2))
      return NextResponse.json(
        {
          success: false,
          error: "Database error",
          message: error.message || "Failed to upsert wallet to database",
          error_code: error.code,
        },
        { status: 500 }
      )
    }

    console.log("✅ [UPSERT-WALLET] Database upsert successful!")
    console.log("✅ [UPSERT-WALLET] Upserted data:", {
      id: data?.id,
      telegram_id: data?.telegram_id,
      wallet_address: data?.wallet_address,
      privy_user_id: data?.privy_user_id,
      is_active: data?.is_active,
      last_login_at: data?.last_login_at,
    })

    return NextResponse.json({
      success: true,
      message: "Wallet address upserted successfully",
      data: {
        telegram_id: data.telegram_id,
        wallet_address: data.wallet_address,
        privy_user_id: data.privy_user_id,
        is_active: data.is_active,
        last_login_at: data.last_login_at,
      },
    })
  } catch (error: any) {
    console.error("❌ [UPSERT-WALLET] Unexpected error:", error)
    console.error("❌ [UPSERT-WALLET] Error stack:", error.stack)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error.message || "Failed to upsert wallet address",
      },
      { status: 500 }
    )
  }
}

