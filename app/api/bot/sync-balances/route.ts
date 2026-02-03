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
 * API Endpoint: Sync All Bot Wallet Credits with On-Chain Balance
 * 
 * This endpoint syncs all bot_wallet_credits records with actual on-chain balance.
 * Useful for:
 * - Fixing discrepancies between database and blockchain
 * - Initial sync after migration
 * - Periodic maintenance
 * 
 * Flow:
 * 1. Fetch all bot_wallet_credits for user
 * 2. For each bot wallet, fetch on-chain balance (Native ETH + WETH)
 * 3. Update database with on-chain balance
 * 4. Return sync results
 * 
 * Request Body:
 * - userAddress: User's Smart Wallet address
 * 
 * Response:
 * - success: boolean
 * - synced: number of wallets synced
 * - results: array of sync results per wallet
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

    // Create public client for blockchain queries
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    })

    console.log(`\n🔄 Syncing all bot wallet credits for ${normalizedUserAddress}...`)

    // Step 1: Fetch all bot wallet credits from database
    const { data: botCreditsData, error: fetchError } = await supabase
      .from("bot_wallet_credits")
      .select("id, bot_wallet_address, native_eth_balance_wei, weth_balance_wei")
      .eq("user_address", normalizedUserAddress)

    if (fetchError) {
      console.error("❌ Error fetching bot wallet credits:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch bot wallet credits", details: fetchError.message },
        { status: 500 }
      )
    }

    if (!botCreditsData || botCreditsData.length === 0) {
      console.log("ℹ️ No bot wallet credits found for user")
      return NextResponse.json({
        success: true,
        synced: 0,
        message: "No bot wallet credits found",
        results: [],
      })
    }

    console.log(`   → Found ${botCreditsData.length} bot wallet(s) to sync`)

    // Step 2: Sync each bot wallet with on-chain balance
    const syncResults: Array<{
      botWalletAddress: string
      previousNativeEth: string
      previousWeth: string
      newNativeEth: string
      newWeth: string
      synced: boolean
      error?: string
    }> = []

    let syncedCount = 0

    for (const creditRecord of botCreditsData) {
      const botWalletAddress = creditRecord.bot_wallet_address.toLowerCase() as Address
      const previousNativeEth = creditRecord.native_eth_balance_wei || "0"
      const previousWeth = creditRecord.weth_balance_wei || "0"

      try {
        console.log(`\n   📊 Syncing Bot Wallet: ${botWalletAddress}`)
        console.log(`      → Previous: ${formatEther(BigInt(previousNativeEth))} Native ETH + ${formatEther(BigInt(previousWeth))} WETH`)

        // Fetch on-chain balance (Native ETH + WETH)
        let onChainNativeEth = BigInt(0)
        let onChainWeth = BigInt(0)

        try {
          onChainNativeEth = await publicClient.getBalance({
            address: botWalletAddress,
          })
          console.log(`      → On-chain Native ETH: ${formatEther(onChainNativeEth)} ETH`)
        } catch (error: any) {
          console.warn(`      ⚠️ Failed to fetch Native ETH: ${error.message}`)
        }

        try {
          onChainWeth = await publicClient.readContract({
            address: WETH_ADDRESS,
            abi: WETH_ABI,
            functionName: "balanceOf",
            args: [botWalletAddress],
          }) as bigint
          console.log(`      → On-chain WETH: ${formatEther(onChainWeth)} WETH`)
        } catch (error: any) {
          console.warn(`      ⚠️ Failed to fetch WETH: ${error.message}`)
        }

        const totalOnChain = onChainNativeEth + onChainWeth
        const totalPrevious = BigInt(previousNativeEth) + BigInt(previousWeth)

        console.log(`      → Total: ${formatEther(totalOnChain)} ETH (on-chain) vs ${formatEther(totalPrevious)} ETH (database)`)

        // Update database with on-chain balance
        const { error: updateError } = await supabase
          .from("bot_wallet_credits")
          .update({
            native_eth_balance_wei: onChainNativeEth.toString(),
            weth_balance_wei: onChainWeth.toString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", creditRecord.id)

        if (updateError) {
          console.error(`      ❌ Error updating database: ${updateError.message}`)
          syncResults.push({
            botWalletAddress: creditRecord.bot_wallet_address,
            previousNativeEth,
            previousWeth,
            newNativeEth: onChainNativeEth.toString(),
            newWeth: onChainWeth.toString(),
            synced: false,
            error: updateError.message,
          })
        } else {
          console.log(`      ✅ Synced successfully`)
          syncedCount++
          syncResults.push({
            botWalletAddress: creditRecord.bot_wallet_address,
            previousNativeEth,
            previousWeth,
            newNativeEth: onChainNativeEth.toString(),
            newWeth: onChainWeth.toString(),
            synced: true,
          })

          // Log sync activity
          await supabase.from("bot_logs").insert({
            user_address: normalizedUserAddress,
            bot_wallet_address: botWalletAddress,
            action: "balance_synced",
            message: `[System] Bot wallet balance synced: ${formatEther(onChainNativeEth)} Native ETH + ${formatEther(onChainWeth)} WETH = ${formatEther(totalOnChain)} ETH total`,
            status: "success",
            amount_wei: totalOnChain.toString(),
            created_at: new Date().toISOString(),
          })
        }
      } catch (error: any) {
        console.error(`      ❌ Error syncing wallet ${botWalletAddress}: ${error.message}`)
        syncResults.push({
          botWalletAddress: creditRecord.bot_wallet_address,
          previousNativeEth,
          previousWeth,
          newNativeEth: "0",
          newWeth: "0",
          synced: false,
          error: error.message,
        })
      }
    }

    console.log(`\n✅ Sync completed: ${syncedCount}/${botCreditsData.length} wallet(s) synced`)

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      total: botCreditsData.length,
      results: syncResults,
      message: `Synced ${syncedCount} out of ${botCreditsData.length} bot wallet(s)`,
    })
  } catch (error: any) {
    console.error("❌ Error in sync-balances API:", error)
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

