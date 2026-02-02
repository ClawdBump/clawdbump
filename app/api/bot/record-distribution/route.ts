import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * API Route: Record Credit Distribution to Bot Wallets
 * 
 * Records distributed credits from main wallet to bot wallets in database.
 * This ensures credit balance calculation includes bot wallet credits.
 * 
 * IMPORTANT: 
 * - Only uses weth_balance_wei for credit tracking (distributed_amount_wei removed)
 * - Uses UPSERT to ensure only 1 row per bot_wallet_address
 * - If record exists, adds to existing weth_balance_wei
 * - If record doesn't exist, creates new record with weth_balance_wei
 * - Credit value is 1:1 (WETH = ETH in terms of credit calculation)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress, distributions, txHash } = body as {
      userAddress: string
      distributions: Array<{ botWalletAddress: string; amountWei: string; wethAmountWei?: string }>
      txHash: string
    }

    if (!userAddress || !distributions || !txHash) {
      return NextResponse.json(
        { error: "Missing required fields: userAddress, distributions, txHash" },
        { status: 400 }
      )
    }

    if (!Array.isArray(distributions) || distributions.length === 0) {
      return NextResponse.json(
        { error: "distributions must be a non-empty array" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const normalizedUserAddress = userAddress.toLowerCase()

    // Calculate total WETH distributed (sum of all distributions)
    // This will be deducted from main wallet credit (user_credits.balance_wei)
    let totalDistributedWei = BigInt(0)
    
    // Upsert distribution records for each bot wallet
    // IMPORTANT: Only 1 row per bot_wallet_address (unique constraint)
    // If record exists, add to existing weth_balance_wei
    // If record doesn't exist, create new record with weth_balance_wei
    // 
    // CREDIT SYSTEM (1:1 Value):
    // - Only weth_balance_wei is used for credit tracking
    // - When distributing: Add to bot_wallet_credits.weth_balance_wei AND subtract from user_credits.balance_wei
    // - Total Credit = user_credits.balance_wei (main wallet) + SUM(bot_wallet_credits.weth_balance_wei) (bot wallets)
    // - Credit value is 1:1 (WETH = ETH in terms of credit calculation)
    // 
    // WHY WETH?
    // - Bot wallets hold WETH instead of Native ETH for gasless transactions
    // - WETH can be directly used in Uniswap v4 swaps without unwrapping
    // - Paymaster Coinbase allows ERC20 (WETH) transfers that were rejected for Native ETH
    
    for (const dist of distributions) {
      const botWalletAddress = dist.botWalletAddress.toLowerCase()
      const wethAmountWei = dist.wethAmountWei || dist.amountWei
      totalDistributedWei += BigInt(wethAmountWei)
      
      // Check if record exists
      const { data: existingRecord } = await supabase
        .from("bot_wallet_credits")
        .select("weth_balance_wei")
        .eq("user_address", normalizedUserAddress)
        .eq("bot_wallet_address", botWalletAddress)
        .single()
      
      if (existingRecord) {
        // Update existing record: add to existing weth_balance_wei
        const currentBalance = BigInt(existingRecord.weth_balance_wei || "0")
        const newBalance = currentBalance + BigInt(wethAmountWei)
        
        const { error: updateError } = await supabase
          .from("bot_wallet_credits")
          .update({
            weth_balance_wei: newBalance.toString(),
            tx_hash: txHash, // Update tx_hash to most recent
          })
          .eq("user_address", normalizedUserAddress)
          .eq("bot_wallet_address", botWalletAddress)
        
        if (updateError) {
          console.error(`❌ Error updating distribution for ${botWalletAddress}:`, updateError)
          return NextResponse.json(
            { error: "Failed to update distribution", details: updateError.message },
            { status: 500 }
          )
        }
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from("bot_wallet_credits")
          .insert({
            user_address: normalizedUserAddress,
            bot_wallet_address: botWalletAddress,
            weth_balance_wei: wethAmountWei,
            tx_hash: txHash,
          })
        
        if (insertError) {
          console.error(`❌ Error inserting distribution for ${botWalletAddress}:`, insertError)
          return NextResponse.json(
            { error: "Failed to record distribution", details: insertError.message },
            { status: 500 }
          )
        }
      }
    }

    // CRITICAL: Deduct distributed amount from main wallet credit (user_credits.balance_wei)
    // This prevents double counting: credit should not be counted in both main wallet and bot wallets
    console.log(`\n💰 Deducting ${totalDistributedWei.toString()} wei from main wallet credit...`)
    
    // Get current main wallet credit
    const { data: userCreditData, error: fetchUserCreditError } = await supabase
      .from("user_credits")
      .select("balance_wei")
      .eq("user_address", normalizedUserAddress)
      .single()

    if (fetchUserCreditError && fetchUserCreditError.code !== "PGRST116") {
      console.error("❌ Error fetching user credit balance:", fetchUserCreditError)
      return NextResponse.json(
        { error: "Failed to fetch user credit balance", details: fetchUserCreditError.message },
        { status: 500 }
      )
    }

    const currentMainWalletCreditWei = userCreditData?.balance_wei 
      ? BigInt(userCreditData.balance_wei.toString())
      : BigInt(0)

    if (currentMainWalletCreditWei < totalDistributedWei) {
      console.warn(`⚠️ Warning: Main wallet credit (${currentMainWalletCreditWei.toString()}) is less than distributed amount (${totalDistributedWei.toString()})`)
      console.warn(`   → Setting main wallet credit to 0`)
      // Set to 0 if insufficient (should not happen, but handle gracefully)
      const { error: updateUserCreditError } = await supabase
        .from("user_credits")
        .upsert(
          {
            user_address: normalizedUserAddress,
            balance_wei: "0",
            last_updated: new Date().toISOString(),
          },
          {
            onConflict: "user_address",
          }
        )
      
      if (updateUserCreditError) {
        console.error("❌ Error updating user credit balance:", updateUserCreditError)
        return NextResponse.json(
          { error: "Failed to update user credit balance", details: updateUserCreditError.message },
          { status: 500 }
        )
      }
    } else {
      // Deduct distributed amount from main wallet credit
      const newMainWalletCreditWei = currentMainWalletCreditWei - totalDistributedWei
      
      const { error: updateUserCreditError } = await supabase
        .from("user_credits")
        .upsert(
          {
            user_address: normalizedUserAddress,
            balance_wei: newMainWalletCreditWei.toString(),
            last_updated: new Date().toISOString(),
          },
          {
            onConflict: "user_address",
          }
        )
      
      if (updateUserCreditError) {
        console.error("❌ Error updating user credit balance:", updateUserCreditError)
        return NextResponse.json(
          { error: "Failed to update user credit balance", details: updateUserCreditError.message },
          { status: 500 }
        )
      }
      
      console.log(`   ✅ Main wallet credit updated: ${currentMainWalletCreditWei.toString()} → ${newMainWalletCreditWei.toString()} wei`)
    }

    console.log(`✅ Recorded ${distributions.length} distribution(s) for user ${normalizedUserAddress}`)
    console.log(`   → Added ${totalDistributedWei.toString()} wei to bot wallets`)
    console.log(`   → Deducted ${totalDistributedWei.toString()} wei from main wallet`)
    console.log(`   → Credit balance is now correctly distributed (no double counting)`)

    return NextResponse.json({
      success: true,
      message: "Distribution recorded successfully",
      recordsCount: distributions.length,
    })
  } catch (error: any) {
    console.error("❌ Error in record-distribution API:", error)
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

