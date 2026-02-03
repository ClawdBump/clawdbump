import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { createPublicClient, http, formatEther, type Address } from "viem"
import { base } from "viem/chains"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// WETH Contract Address (Base Network)
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const

// WETH ABI for balance check
const WETH_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

/**
 * API Endpoint: Auto-Sync All Bot Wallet Credits (Background Job)
 * 
 * This endpoint syncs all bot_wallet_credits records with on-chain balance.
 * Called automatically every 1 minute by background worker.
 * 
 * NOTE: This does NOT create log entries in bot_logs (silent sync)
 * 
 * Request Body:
 * - userAddress: (Optional) Specific user address, or omit to sync all users
 * 
 * Response:
 * - success: boolean
 * - synced: number of wallets synced
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { userAddress } = body as { userAddress?: string }

    const supabase = createSupabaseServiceClient()
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    })

    console.log(`\n🔄 [Auto-Sync] Starting automatic balance sync...`)

    // Build query - sync all users or specific user
    let query = supabase
      .from("bot_wallet_credits")
      .select("id, user_address, bot_wallet_address, native_eth_balance_wei, weth_balance_wei")

    if (userAddress) {
      query = query.eq("user_address", userAddress.toLowerCase())
      console.log(`   → Syncing for user: ${userAddress}`)
    } else {
      console.log(`   → Syncing for all users`)
    }

    const { data: botCreditsData, error: fetchError } = await query

    if (fetchError) {
      console.error("❌ Error fetching bot wallet credits:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch bot wallet credits", details: fetchError.message },
        { status: 500 }
      )
    }

    if (!botCreditsData || botCreditsData.length === 0) {
      console.log("ℹ️ No bot wallet credits found")
      return NextResponse.json({
        success: true,
        synced: 0,
        message: "No bot wallet credits found",
      })
    }

    console.log(`   → Found ${botCreditsData.length} bot wallet(s) to sync`)

    let syncedCount = 0
    let errorCount = 0

    // Sync each bot wallet (silent - no logs)
    for (const creditRecord of botCreditsData) {
      const botWalletAddress = creditRecord.bot_wallet_address.toLowerCase() as Address

      try {
        // Fetch on-chain balance (Native ETH + WETH)
        let onChainNativeEth = BigInt(0)
        let onChainWeth = BigInt(0)

        try {
          onChainNativeEth = await publicClient.getBalance({
            address: botWalletAddress,
          })
        } catch (error: any) {
          console.warn(`   ⚠️ Failed to fetch Native ETH for ${botWalletAddress.substring(0, 10)}...: ${error.message}`)
        }

        try {
          onChainWeth = await publicClient.readContract({
            address: WETH_ADDRESS,
            abi: WETH_ABI,
            functionName: "balanceOf",
            args: [botWalletAddress],
          }) as bigint
        } catch (error: any) {
          console.warn(`   ⚠️ Failed to fetch WETH for ${botWalletAddress.substring(0, 10)}...: ${error.message}`)
        }

        // Update database with on-chain balance (silent - no logs)
        const { error: updateError } = await supabase
          .from("bot_wallet_credits")
          .update({
            native_eth_balance_wei: onChainNativeEth.toString(),
            weth_balance_wei: onChainWeth.toString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", creditRecord.id)

        if (updateError) {
          console.error(`   ❌ Error updating ${botWalletAddress.substring(0, 10)}...: ${updateError.message}`)
          errorCount++
        } else {
          syncedCount++
        }
      } catch (error: any) {
        console.error(`   ❌ Error syncing ${botWalletAddress.substring(0, 10)}...: ${error.message}`)
        errorCount++
      }
    }

    console.log(`✅ [Auto-Sync] Completed: ${syncedCount} synced, ${errorCount} errors`)

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      errors: errorCount,
      total: botCreditsData.length,
      message: `Auto-synced ${syncedCount} bot wallet(s)`,
    })
  } catch (error: any) {
    console.error("❌ Error in auto-sync-balances API:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 }
    )
  }
}

