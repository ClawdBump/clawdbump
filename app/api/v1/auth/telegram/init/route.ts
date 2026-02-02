import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/v1/auth/telegram/init
 * 
 * Telegram Authentication Bridge Endpoint
 * 
 * ⚠️ IMPORTANT: This endpoint is for Telegram Login Widget STANDARD (not Privy)
 * 
 * Privy Telegram OAuth does NOT use this endpoint.
 * Privy handles Telegram OAuth automatically - no custom endpoints needed.
 * 
 * This endpoint is only useful if you want to implement
 * a custom Telegram Login Widget (not using Privy).
 * 
 * For Privy Telegram OAuth:
 * - Privy handles all OAuth flow automatically
 * - User clicks "Login via Telegram" → Privy opens OAuth popup
 * - User logs in at Telegram OAuth page (no message sent)
 * - Privy handles callback automatically
 * - User data available via usePrivy() hook
 * 
 * This endpoint handles the Telegram Login Widget STANDARD flow:
 * 1. Extracts telegram_id and telegram_username from query parameters
 * 2. Stores Telegram details in a secure, short-lived session cookie
 * 3. Redirects user to frontend login page with telegram_id as query parameter
 * 
 * Query Parameters:
 * - telegram_id (required): Telegram user ID
 * - telegram_username (optional): Telegram username
 * 
 * Response:
 * - Redirects to /login?tid=[telegram_id] on success
 * - Returns 400 error if telegram_id is missing
 * 
 * Security:
 * - Session cookie is HttpOnly, Secure, and SameSite=Strict
 * - Cookie expires in 10 minutes (short-lived session)
 * - Cookie name: telegram_auth_session
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const telegramId = searchParams.get("telegram_id")
    const telegramUsername = searchParams.get("telegram_username")

    // Validate required parameter
    if (!telegramId) {
      console.error("❌ Missing required parameter: telegram_id")
      return NextResponse.json(
        {
          error: "Missing required parameter: telegram_id",
          message: "telegram_id is required to initiate Telegram authentication",
        },
        { status: 400 }
      )
    }

    // Validate telegram_id format (should be numeric string)
    if (!/^\d+$/.test(telegramId)) {
      console.error("❌ Invalid telegram_id format:", telegramId)
      return NextResponse.json(
        {
          error: "Invalid telegram_id format",
          message: "telegram_id must be a numeric string",
        },
        { status: 400 }
      )
    }

    // Prepare session data to store in cookie
    const sessionData = {
      telegram_id: telegramId,
      telegram_username: telegramUsername || null,
      timestamp: Date.now(),
      expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes from now
    }

    // Store session data in secure cookie
    // Cookie settings:
    // - HttpOnly: Prevents JavaScript access (XSS protection)
    // - Secure: Only sent over HTTPS (production)
    // - SameSite=Strict: CSRF protection
    // - Max-Age: 10 minutes (600 seconds)
    const cookieStore = await cookies()
    cookieStore.set("telegram_auth_session", JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 600, // 10 minutes
      path: "/",
    })

    console.log("✅ Telegram auth session created:", {
      telegram_id: telegramId,
      telegram_username: telegramUsername || "N/A",
    })

    // Redirect to frontend login page with telegram_id as query parameter
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("tid", telegramId)
    if (telegramUsername) {
      loginUrl.searchParams.set("username", telegramUsername)
    }

    // Return redirect response
    return NextResponse.redirect(loginUrl.toString(), {
      status: 302,
    })
  } catch (error: any) {
    console.error("❌ Error in Telegram auth init endpoint:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Failed to process Telegram authentication",
      },
      { status: 500 }
    )
  }
}

/**
 * TODO: Implement Privy DID pairing logic
 * 
 * After user successfully connects their wallet via Privy, we need to:
 * 1. Retrieve the telegram_id from the session cookie (or query parameter)
 * 2. Get the Privy DID/user ID from the authenticated Privy session
 * 3. Store the mapping between Telegram ID and Privy DID in the database
 * 
 * Suggested implementation location:
 * - Create a new endpoint: POST /api/v1/auth/telegram/pair
 * - Or handle it in the existing login flow after Privy authentication succeeds
 * 
 * Database schema suggestion:
 * - Table: telegram_user_mappings (or similar)
 * - Columns:
 *   - telegram_id (string, unique)
 *   - privy_did (string, unique)
 *   - privy_user_id (string)
 *   - wallet_address (string) - Smart Wallet address from Privy
 *   - created_at (timestamp)
 *   - updated_at (timestamp)
 * 
 * Example pairing logic:
 * ```typescript
 * // After Privy authentication succeeds:
 * const telegramId = getTelegramIdFromCookie() // or from query param
 * const privyUser = await privy.getUser() // Get authenticated Privy user
 * const walletAddress = privyUser.wallet?.address // Smart Wallet address
 * 
 * // Store mapping in database
 * await supabase
 *   .from("telegram_user_mappings")
 *   .upsert({
 *     telegram_id: telegramId,
 *     privy_did: privyUser.id,
 *     privy_user_id: privyUser.id,
 *     wallet_address: walletAddress,
 *     updated_at: new Date().toISOString(),
 *   })
 * ```
 */

