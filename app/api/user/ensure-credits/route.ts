import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/user/ensure-credits
 * 
 * Ensures a user_credits record exists for the given wallet address.
 * This is called when user logs in to ensure they can use all features.
 * 
 * Request Body:
 * {
 *   "userAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const userAddress = body.userAddress || body.user_address

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: "Missing required field: userAddress" },
        { status: 400 }
      )
    }

    // Validate wallet address format
    const normalizedAddress = userAddress.toLowerCase()
    if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address format" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()

    // Upsert user_credits record (INSERT if not exists, ignore if exists)
    const { data, error } = await supabase
      .from("user_credits")
      .upsert(
        {
          user_address: normalizedAddress,
          balance_wei: "0", // Initial balance is 0
          last_updated: new Date().toISOString(),
        },
        {
          onConflict: "user_address",
          ignoreDuplicates: true, // Don't update if already exists
        }
      )
      .select()
      .single()

    if (error && error.code !== "PGRST116" && error.code !== "23505") {
      console.error("Error ensuring user_credits:", error)
      return NextResponse.json(
        { success: false, error: "Database error", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "User credits record ensured",
      data: data || { user_address: normalizedAddress },
    })
  } catch (error: any) {
    console.error("Error in ensure-credits API:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}
