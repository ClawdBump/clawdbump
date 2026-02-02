import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { verifyTelegramInitData, extractTelegramId, extractUserData } from "@/lib/telegram-initdata-verify"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/v1/auth/telegram/verify
 * 
 * Verify Telegram Mini App initData and UPSERT user data to database
 * 
 * This endpoint:
 * 1. Verifies initData using HMAC-SHA256
 * 2. Performs UPSERT to Supabase (creates or updates record)
 * 3. Returns the upserted user data
 * 
 * Authentication:
 * - Uses Telegram initData verification (HMAC-SHA256)
 * - Validates initData using TELEGRAM_BOT_TOKEN
 * - Automatically creates/updates user record on every valid request
 * 
 * Query Parameters:
 * - initData (required): Raw initData string from window.Telegram.WebApp.initData
 * 
 * Response (success):
 * {
 *   "success": true,
 *   "is_valid": true,
 *   "telegram_id": "123456789",
 *   "telegram_username": "john_doe",
 *   "last_login": "2024-01-01T00:00:00Z",
 *   "wallet_address": "0x..." (if exists),
 *   "privy_user_id": "did:privy:abc123" (if exists)
 * }
 * 
 * Error Responses:
 * - 400: Missing or invalid initData
 * - 401: Invalid initData hash (tampered)
 * - 500: Internal server error
 */
export async function GET(request: NextRequest) {
  try {
    // =============================================
    // 1. Get initData from Query Parameters
    // =============================================
    const { searchParams } = new URL(request.url)
    const initData = searchParams.get("initData")

    console.log("📥 [VERIFY] Incoming initData:", initData ? `${initData.substring(0, 100)}...` : "null")
    console.log("📥 [VERIFY] Full initData length:", initData?.length || 0)

    if (!initData) {
      const response = NextResponse.json(
        {
          success: false,
          error: "Missing required parameter: initData",
          message: "initData is required as query parameter. Get it from window.Telegram.WebApp.initData",
        },
        { status: 400 }
      )
      
      // Add anti-cache headers
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      response.headers.set('Expires', '0')
      response.headers.set('Surrogate-Control', 'no-store')
      
      return response
    }

    // =============================================
    // 2. Verify Telegram initData
    // =============================================
    console.log("🔍 [VERIFY] Step 1: Starting initData verification...")
    const botToken = process.env.TELEGRAM_BOT_TOKEN

    if (!botToken) {
      console.error("❌ [VERIFY] TELEGRAM_BOT_TOKEN not configured in environment variables")
      const response = NextResponse.json(
        {
          success: false,
          error: "Server configuration error",
          message: "Telegram bot token is not configured",
        },
        { status: 500 }
      )
      
      // Add anti-cache headers
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      response.headers.set('Expires', '0')
      response.headers.set('Surrogate-Control', 'no-store')
      
      return response
    }

    console.log("🔍 [VERIFY] Step 2: Verifying initData with HMAC-SHA256...")
    console.log("🔍 [VERIFY] Step 2: Bot token exists:", !!botToken)
    // Verify initData using HMAC-SHA256
    const verification = verifyTelegramInitData(initData, botToken)

    console.log("🔍 [VERIFY] HMAC Verification Result:", {
      isValid: verification.isValid,
      error: verification.error || null,
    })

    if (!verification.isValid) {
      console.warn("⚠️ [VERIFY] Invalid initData:", verification.error)
      const response = NextResponse.json(
        {
          success: false,
          error: "Invalid initData",
          message: verification.error || "initData verification failed. Data may be tampered with.",
        },
        { status: 401 }
      )
      
      // Add anti-cache headers
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      response.headers.set('Expires', '0')
      response.headers.set('Surrogate-Control', 'no-store')
      
      return response
    }

    console.log("✅ [VERIFY] Step 2: initData verification successful!")

    if (!verification.data) {
      console.error("❌ [VERIFY] Verification data is null")
      const response = NextResponse.json(
        {
          success: false,
          error: "Invalid initData",
          message: "Failed to parse initData",
        },
        { status: 400 }
      )
      
      // Add anti-cache headers
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      response.headers.set('Expires', '0')
      response.headers.set('Surrogate-Control', 'no-store')
      
      return response
    }

    // =============================================
    // 3. Extract Telegram ID and User Data
    // =============================================
    console.log("🔍 [VERIFY] Step 3: Extracting Telegram ID and user data...")
    const telegramId = extractTelegramId(verification.data)

    if (!telegramId) {
      console.error("❌ [VERIFY] Could not extract telegram_id from initData")
      const response = NextResponse.json(
        {
          success: false,
          error: "Missing telegram_id",
          message: "Could not extract telegram_id from initData",
        },
        { status: 400 }
      )
      
      // Add anti-cache headers
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      response.headers.set('Expires', '0')
      response.headers.set('Surrogate-Control', 'no-store')
      
      return response
    }

    console.log("✅ [VERIFY] Step 3: Telegram ID extracted:", telegramId)

    // Extract additional user data
    const userData = extractUserData(verification.data)
    console.log("✅ [VERIFY] Step 3: User data extracted:", {
      telegram_id: telegramId,
      username: userData.username,
      first_name: userData.first_name,
    })

    // =============================================
    // 4. UPSERT to Supabase Database
    // =============================================
    console.log("🔍 [VERIFY] Step 4: Performing UPSERT to Supabase...")
    console.log("🔍 [VERIFY] Using SUPABASE_SERVICE_ROLE_KEY:", !!process.env.SUPABASE_SERVICE_ROLE_KEY)
    
    const supabase = createSupabaseServiceClient()
    
    const upsertData = {
      telegram_id: String(telegramId),
      telegram_username: userData.username || null,
      first_name: userData.first_name || null,
      last_name: userData.last_name || null,
      photo_url: userData.photo_url || null,
      last_login_at: new Date().toISOString(),
    }
    
    console.log("🔍 [VERIFY] Attempting to UPSERT to Supabase:", upsertData)

    const { data: upsertedData, error: upsertError } = await supabase
      .from("telegram_user_mappings")
      .upsert(upsertData, { 
        onConflict: 'telegram_id',
        ignoreDuplicates: false 
      })
      .select()
      .single()
    
    console.log("🔍 [VERIFY] UPSERT result:", {
      success: !upsertError,
      has_data: !!upsertedData,
      error_code: upsertError?.code,
      error_message: upsertError?.message,
    })

    if (upsertError) {
      console.error("❌ [VERIFY] Supabase Error during UPSERT:", upsertError)
      const response = NextResponse.json(
        {
          success: false,
          error: "Database error",
          message: upsertError.message || "Failed to save user data to database",
          details: upsertError,
        },
        { status: 500 }
      )
      
      // Add anti-cache headers
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      response.headers.set('Expires', '0')
      response.headers.set('Surrogate-Control', 'no-store')
      
      return response
    }

    console.log("✅ [VERIFY] Step 4: UPSERT successful:", {
      telegram_id: upsertedData.telegram_id,
      username: upsertedData.telegram_username,
      last_login: upsertedData.last_login_at,
    })

    // =============================================
    // 5. Return Success Response with Anti-Cache Headers
    // =============================================
    console.log("✅ Telegram user verified and data saved:", {
      telegram_id: upsertedData.telegram_id,
      wallet_address: upsertedData.wallet_address,
      privy_user_id: upsertedData.privy_user_id,
    })

    const response = NextResponse.json({
      success: true,
      is_valid: true,
      telegram_id: upsertedData.telegram_id,
      telegram_username: upsertedData.telegram_username,
      first_name: upsertedData.first_name,
      last_name: upsertedData.last_name,
      photo_url: upsertedData.photo_url,
      last_login: upsertedData.last_login_at,
      wallet_address: upsertedData.wallet_address || null,
      privy_user_id: upsertedData.privy_user_id || null,
    })
    
    // Add anti-cache headers to prevent 304 Not Modified
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Expires', '0')
    response.headers.set('Surrogate-Control', 'no-store')
    
    return response
  } catch (error: any) {
    console.error("❌ Error in Telegram verify endpoint:", error)
    const response = NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error.message || "Failed to verify Telegram user",
      },
      { status: 500 }
    )
    
    // Add anti-cache headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Expires', '0')
    response.headers.set('Surrogate-Control', 'no-store')
    
    return response
  }
}
