import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { formatEther } from "viem"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * API Endpoint: Sync Credit with On-Chain Balance
 * 
 * Synchronizes user_credits.balance_wei with actual on-chain balance.
 * This is useful when database credit differs from on-chain balance.
 * 
 * Use cases:
 * - User withdrew WETH directly from Smart Account (not via bot)
 * - Database credit is higher than actual on-chain balance
 * - Need to reconcile database with blockchain state
 * 
 * Flow:
 * 1. Receive on-chain balance from frontend (already fetched)
 * 2. Compare with database credit
 * 3. If on-chain < database: Sync down (set to on-chain balance)
 * 4. If on-chain > database: Optional sync up (can be disabled)
 * 
 * Request Body:
 * - userAddress: User's Smart Wallet address
 * - onChainBalanceWei: Current on-chain balance (Native ETH + WETH) in wei
 * - syncUp: (Optional) If true, allow syncing up when on-chain > database
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress, onChainBalanceWei, syncUp } = body as {
      userAddress: string
      onChainBalanceWei: string
      syncUp?: boolean
    }

    if (!userAddress || !onChainBalanceWei) {
      return NextResponse.json(
        { error: "Missing required fields: userAddress, onChainBalanceWei" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const normalizedUserAddress = userAddress.toLowerCase()
    const onChainBalance = BigInt(onChainBalanceWei)

    console.log(`\n🔄 Syncing credit for ${normalizedUserAddress}...`)
    console.log(`   → On-chain balance: ${formatEther(onChainBalance)} ETH`)

    // Step 1: Get current database credit
    const { data: userCreditData, error: fetchError } = await supabase
      .from("user_credits")
      .select("balance_wei")
      .eq("user_address", normalizedUserAddress)
      .single()

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("❌ Error fetching user credit balance:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch user credit balance", details: fetchError.message },
        { status: 500 }
      )
    }

    const currentCreditWei = userCreditData?.balance_wei 
      ? BigInt(userCreditData.balance_wei.toString())
      : BigInt(0)
    
    console.log(`   → Database credit: ${formatEther(currentCreditWei)} ETH`)

    // Step 2: Check if sync is needed
    if (onChainBalance === currentCreditWei) {
      console.log(`✅ Credit already in sync!`)
      return NextResponse.json({
        success: true,
        synced: false,
        message: "Credit already matches on-chain balance",
        currentCreditWei: currentCreditWei.toString(),
        currentCreditEth: formatEther(currentCreditWei),
        onChainBalanceWei: onChainBalance.toString(),
        onChainBalanceEth: formatEther(onChainBalance),
      })
    }

    // Step 3: Determine sync direction
    let newCreditWei: bigint
    let syncReason: string

    if (onChainBalance < currentCreditWei) {
      // On-chain balance is lower - sync down (always allowed)
      newCreditWei = onChainBalance
      syncReason = "On-chain balance is lower than database credit"
      console.log(`   ⬇️ Syncing DOWN: ${formatEther(currentCreditWei)} → ${formatEther(onChainBalance)} ETH`)
    } else if (onChainBalance > currentCreditWei) {
      // On-chain balance is higher - sync up (only if allowed)
      if (syncUp) {
        newCreditWei = onChainBalance
        syncReason = "On-chain balance is higher than database credit (sync up enabled)"
        console.log(`   ⬆️ Syncing UP: ${formatEther(currentCreditWei)} → ${formatEther(onChainBalance)} ETH`)
      } else {
        console.log(`   ℹ️ On-chain balance is higher but sync up is disabled`)
        return NextResponse.json({
          success: true,
          synced: false,
          message: "On-chain balance is higher but sync up is disabled",
          currentCreditWei: currentCreditWei.toString(),
          currentCreditEth: formatEther(currentCreditWei),
          onChainBalanceWei: onChainBalance.toString(),
          onChainBalanceEth: formatEther(onChainBalance),
          note: "Use /api/credit/add to add credit manually",
        })
      }
    } else {
      // Should not reach here (already handled above)
      return NextResponse.json({
        success: true,
        synced: false,
        message: "No sync needed",
      })
    }

    // Step 4: Update database with new credit
    console.log(`\n💾 Updating database...`)
    console.log(`   → Old credit: ${formatEther(currentCreditWei)} ETH`)
    console.log(`   → New credit: ${formatEther(newCreditWei)} ETH`)
    console.log(`   → Reason: ${syncReason}`)

    const { error: updateError } = await supabase
      .from("user_credits")
      .upsert(
        {
          user_address: normalizedUserAddress,
          balance_wei: newCreditWei.toString(),
          last_updated: new Date().toISOString(),
        },
        {
          onConflict: "user_address",
        }
      )

    if (updateError) {
      console.error("❌ Error updating user credit balance:", updateError)
      return NextResponse.json(
        { error: "Failed to update user credit balance", details: updateError.message },
        { status: 500 }
      )
    }

    console.log(`✅ Credit synced successfully!`)
    console.log(`   → User: ${normalizedUserAddress}`)
    console.log(`   → New credit: ${formatEther(newCreditWei)} ETH`)

    return NextResponse.json({
      success: true,
      synced: true,
      message: "Credit synced with on-chain balance",
      syncReason,
      previousCreditWei: currentCreditWei.toString(),
      previousCreditEth: formatEther(currentCreditWei),
      newCreditWei: newCreditWei.toString(),
      newCreditEth: formatEther(newCreditWei),
      differenceWei: (newCreditWei - currentCreditWei).toString(),
      differenceEth: formatEther(newCreditWei > currentCreditWei ? newCreditWei - currentCreditWei : currentCreditWei - newCreditWei),
      onChainBalanceWei: onChainBalance.toString(),
      onChainBalanceEth: formatEther(onChainBalance),
    })
  } catch (error: any) {
    console.error("❌ Error in sync-credit API:", error)
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

