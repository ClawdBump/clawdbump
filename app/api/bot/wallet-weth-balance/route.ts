import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * API Endpoint: Get WETH Balance for a Specific Bot Wallet
 * 
 * Returns the total WETH balance for a specific bot wallet from database.
 * Used to check if bot wallet has sufficient WETH before starting swap.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress, botWalletAddress } = body as {
      userAddress: string
      botWalletAddress: string
    }

    if (!userAddress || !botWalletAddress) {
      return NextResponse.json(
        { error: "Missing required fields: userAddress, botWalletAddress" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const normalizedUserAddress = userAddress.toLowerCase()
    const normalizedBotWalletAddress = botWalletAddress.toLowerCase()

    // Fetch WETH balance from database for this specific bot wallet
    // IMPORTANT: Only 1 row per bot_wallet_address, only weth_balance_wei is used
    const { data: creditRecord, error: fetchError } = await supabase
      .from("bot_wallet_credits")
      .select("weth_balance_wei")
      .eq("user_address", normalizedUserAddress)
      .eq("bot_wallet_address", normalizedBotWalletAddress)
      .single()

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        // No record found - return 0 balance
        return NextResponse.json({
          success: true,
          wethBalanceWei: "0",
          botWalletAddress: normalizedBotWalletAddress,
        })
      }
      
      console.error("❌ Error fetching bot wallet WETH balance:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch bot wallet WETH balance", details: fetchError.message },
        { status: 500 }
      )
    }

    // Get WETH balance (only weth_balance_wei is used)
    const wethBalanceWei = creditRecord 
      ? BigInt(creditRecord.weth_balance_wei || "0")
      : BigInt(0)

    return NextResponse.json({
      success: true,
      wethBalanceWei: wethBalanceWei.toString(),
      botWalletAddress: normalizedBotWalletAddress,
    })
  } catch (error: any) {
    console.error("❌ Error in wallet-weth-balance API:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

