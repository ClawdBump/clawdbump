import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { formatUnits, createPublicClient, http, type Address } from "viem"
import { base } from "viem/chains"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * API Endpoint: Get Credit Balance
 * 
 * Returns total credit balance for a user:
 * - Main wallet credit: WETH balance from database (user_credits.balance_wei)
 *   - This is ONLY WETH from "Convert $BUMP to Credit" transactions
 *   - NOT from direct WETH transfers (prevents bypass)
 * - Bot wallet credits: Sum of weth_balance_wei from database (bot_wallet_credits)
 *   - This is ONLY WETH distributed via use-distribute-credits.ts
 *   - NOT from direct WETH transfers to bot wallets (prevents bypass)
 * 
 * IMPORTANT SECURITY:
 * - Credit is ONLY calculated from database records (user_credits.balance_wei)
 * - On-chain balance is NOT used to prevent users from bypassing by sending WETH directly
 * - Only WETH from "Convert $BUMP to Credit" and "Distribute Credits" is counted
 * 
 * Credit Display Formula:
 * Total Credit (USD) = (Main Wallet WETH from DB + Bot Wallets WETH from DB) × ETH Price
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress } = body as { userAddress: string }

    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing required field: userAddress" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const normalizedUserAddress = userAddress.toLowerCase()

    // CRITICAL: Only fetch credit from database (user_credits.balance_wei)
    // This ensures only WETH from "Convert $BUMP to Credit" is counted
    // Direct WETH transfers to wallet are NOT counted (prevents bypass)
    console.log(`\n💰 Fetching credit balance from database for ${normalizedUserAddress}...`)
    
    // Fetch main wallet credit from database (user_credits.balance_wei)
    // This is ONLY WETH from "Convert $BUMP to Credit" transactions
    const { data: userCreditData, error: userCreditError } = await supabase
      .from("user_credits")
      .select("balance_wei")
      .eq("user_address", normalizedUserAddress)
      .single()

    if (userCreditError && userCreditError.code !== "PGRST116") {
      console.error("❌ Error fetching user credit balance:", userCreditError)
      return NextResponse.json(
        { error: "Failed to fetch user credit balance", details: userCreditError.message },
        { status: 500 }
      )
    }

    // Main wallet credit = WETH from database (only from Convert $BUMP to Credit)
    const mainWalletCreditWei = userCreditData?.balance_wei 
      ? BigInt(userCreditData.balance_wei.toString())
      : BigInt(0)
    
    console.log(`   → Main Wallet WETH (from DB): ${formatUnits(mainWalletCreditWei, 18)} WETH`)
    console.log(`   → Note: Only WETH from "Convert $BUMP to Credit" is counted`)

    // Fetch bot wallet credits from database
    // IMPORTANT: Only 1 row per bot_wallet_address, only weth_balance_wei is used
    const { data: botCreditsData, error: botCreditsError } = await supabase
      .from("bot_wallet_credits")
      .select("weth_balance_wei")
      .eq("user_address", normalizedUserAddress)

    if (botCreditsError && botCreditsError.code !== "PGRST116") {
      console.error("❌ Error fetching bot credit balance:", botCreditsError)
      return NextResponse.json(
        { error: "Failed to fetch bot credit balance", details: botCreditsError.message },
        { status: 500 }
      )
    }

    // Calculate bot wallet credits (from database)
    // This is ONLY WETH distributed via use-distribute-credits.ts
    // Direct WETH transfers to bot wallets are NOT counted (prevents bypass)
    const botWalletCreditsWei = botCreditsData?.reduce((sum, record) => {
      const amountWei = BigInt(record.weth_balance_wei || "0")
      return sum + amountWei
    }, BigInt(0)) || BigInt(0)
    
    console.log(`   → Bot Wallets WETH (from DB): ${formatUnits(botWalletCreditsWei, 18)} WETH`)
    console.log(`   → Note: Only WETH from "Distribute Credits" is counted`)
    
    // Total credit = Main wallet WETH (from DB) + Bot wallets WETH (from DB)
    // Both are ONLY from legitimate sources (Convert $BUMP to Credit + Distribute Credits)
    const totalCreditWei = mainWalletCreditWei + botWalletCreditsWei
    const balanceWei = totalCreditWei.toString()
    const balanceEth = formatUnits(BigInt(balanceWei), 18)
    
    console.log(`   → Total Credit: ${balanceEth} WETH (from database only)`)
    console.log(`   → Security: Direct WETH transfers are NOT counted`)

    return NextResponse.json({
      success: true,
      balanceWei,
      balanceEth,
      mainWalletCreditWei: mainWalletCreditWei.toString(),
      botWalletCreditsWei: botWalletCreditsWei.toString(),
      lastUpdated: userCreditData?.last_updated || new Date().toISOString(),
      debug: {
        source: "database_only",
        note: "Only WETH from Convert $BUMP to Credit and Distribute Credits is counted",
      },
    })
  } catch (error: any) {
    console.error("❌ Error in credit-balance API:", error)
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

