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
 *   - This is ETH/WETH deposited to Smart Account
 * - Bot wallet credits: Sum of weth_balance_wei from database (bot_wallet_credits)
 *   - This is WETH distributed via use-distribute-credits.ts
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

    // Fetch credit from database (user_credits.balance_wei)
    console.log(`\n💰 Fetching credit balance from database for ${normalizedUserAddress}...`)
    
    // Fetch main wallet credit from database (user_credits.balance_wei)
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

    // Main wallet credit = WETH from database (ETH/WETH deposits)
    const mainWalletCreditWei = userCreditData?.balance_wei 
      ? BigInt(userCreditData.balance_wei.toString())
      : BigInt(0)
    
    console.log(`   → Main Wallet WETH (from DB): ${formatUnits(mainWalletCreditWei, 18)} WETH`)

    // Fetch bot wallet credits from database (Native ETH + WETH)
    const { data: botCreditsData, error: botCreditsError } = await supabase
      .from("bot_wallet_credits")
      .select("native_eth_balance_wei, weth_balance_wei")
      .eq("user_address", normalizedUserAddress)

    if (botCreditsError && botCreditsError.code !== "PGRST116") {
      console.error("❌ Error fetching bot credit balance:", botCreditsError)
      return NextResponse.json(
        { error: "Failed to fetch bot credit balance", details: botCreditsError.message },
        { status: 500 }
      )
    }

    // Calculate bot wallet credits (Native ETH + WETH from database)
    let botNativeEthWei = BigInt(0)
    let botWethWei = BigInt(0)
    
    if (botCreditsData) {
      for (const record of botCreditsData) {
        botNativeEthWei += BigInt(record.native_eth_balance_wei || "0")
        botWethWei += BigInt(record.weth_balance_wei || "0")
      }
    }
    
    const botWalletCreditsWei = botNativeEthWei + botWethWei
    
    console.log(`   → Bot Wallets Native ETH (from DB): ${formatUnits(botNativeEthWei, 18)} ETH`)
    console.log(`   → Bot Wallets WETH (from DB): ${formatUnits(botWethWei, 18)} WETH`)
    console.log(`   → Bot Wallets Total (from DB): ${formatUnits(botWalletCreditsWei, 18)} ETH`)
    
    // Total credit = Main wallet WETH (from DB) + Bot wallets (Native ETH + WETH from DB)
    const totalCreditWei = mainWalletCreditWei + botWalletCreditsWei
    const balanceWei = totalCreditWei.toString()
    const balanceEth = formatUnits(BigInt(balanceWei), 18)
    
    console.log(`   → Total Credit: ${balanceEth} ETH (from database)`)
    console.log(`      = Main Wallet: ${formatUnits(mainWalletCreditWei, 18)} WETH`)
    console.log(`      + Bot Wallets: ${formatUnits(botNativeEthWei, 18)} Native ETH + ${formatUnits(botWethWei, 18)} WETH`)

    return NextResponse.json({
      success: true,
      balanceWei,
      balanceEth,
      mainWalletCreditWei: mainWalletCreditWei.toString(),
      botWalletCreditsWei: botWalletCreditsWei.toString(),
      botNativeEthWei: botNativeEthWei.toString(),
      botWethWei: botWethWei.toString(),
      lastUpdated: userCreditData?.last_updated || new Date().toISOString(),
      debug: {
        source: "database",
        note: "Credits from ETH/WETH deposits to Smart Account (main wallet) + distributed to bot wallets (Native ETH + WETH)",
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
