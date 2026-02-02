import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { formatEther, createPublicClient, http, type Address } from "viem"
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

// Public client for balance checks
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
})

/**
 * API Endpoint: Add Credit to User Account
 * 
 * Adds credit to user_credits.balance_wei when user deposits ETH/WETH to Smart Account.
 * This endpoint should be called after user deposits funds to their Privy Smart Wallet.
 * 
 * Flow:
 * 1. User deposits ETH or WETH to their Privy Smart Account
 * 2. Frontend calls this API to record deposit in database
 * 3. API checks actual on-chain balance (Native ETH + WETH)
 * 4. API updates user_credits.balance_wei to match on-chain balance
 * 
 * Credit Calculation:
 * - Credit = Native ETH + WETH (on-chain balance)
 * - Stored as balance_wei in user_credits table
 * - 1 ETH = 1 WETH = 1 Credit (1:1 value)
 * 
 * Request Body:
 * - userAddress: User's Smart Wallet address
 * - amountWei: (Optional) Deposited amount in wei (for validation)
 * - txHash: (Optional) Deposit transaction hash (for logging)
 * - syncOnly: (Optional) If true, sync database with on-chain balance without adding
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress, amountWei, txHash, syncOnly } = body as {
      userAddress: string
      amountWei?: string
      txHash?: string
      syncOnly?: boolean
    }

    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing required field: userAddress" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const normalizedUserAddress = userAddress.toLowerCase()

    console.log(`\n💰 ${syncOnly ? "Syncing" : "Adding"} credit for ${normalizedUserAddress}...`)
    if (amountWei) {
      console.log(`   → Deposit amount: ${formatEther(BigInt(amountWei))} ETH`)
    }
    if (txHash) {
      console.log(`   → Transaction: ${txHash}`)
    }

    // Step 1: Get actual on-chain balance (Native ETH + WETH)
    console.log(`\n📊 Checking on-chain balance...`)
    
    // Get Native ETH balance
    const nativeEthBalance = await publicClient.getBalance({
      address: normalizedUserAddress as Address,
    })
    console.log(`   → Native ETH: ${formatEther(nativeEthBalance)} ETH`)
    
    // Get WETH balance
    let wethBalance = BigInt(0)
    try {
      wethBalance = await publicClient.readContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "balanceOf",
        args: [normalizedUserAddress as Address],
      }) as bigint
      console.log(`   → WETH: ${formatEther(wethBalance)} WETH`)
    } catch (error: any) {
      console.warn(`   ⚠️ Failed to check WETH balance: ${error.message}`)
    }
    
    // Total on-chain balance = Native ETH + WETH
    const totalOnChainBalanceWei = nativeEthBalance + wethBalance
    console.log(`   → Total (ETH + WETH): ${formatEther(totalOnChainBalanceWei)} ETH`)

    // Step 2: Get current database credit
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
    
    console.log(`\n💾 Database credit: ${formatEther(currentCreditWei)} ETH`)

    // Step 3: Calculate new credit balance
    let newCreditWei: bigint
    
    if (syncOnly) {
      // Sync mode: Set credit to match on-chain balance exactly
      newCreditWei = totalOnChainBalanceWei
      console.log(`\n🔄 Sync mode: Setting credit to on-chain balance`)
    } else if (amountWei) {
      // Add mode with specific amount: Increment credit by deposit amount
      newCreditWei = currentCreditWei + BigInt(amountWei)
      console.log(`\n➕ Add mode: Adding ${formatEther(BigInt(amountWei))} ETH to credit`)
      
      // Validate: New credit should not exceed on-chain balance
      if (newCreditWei > totalOnChainBalanceWei) {
        console.warn(`⚠️ Warning: New credit (${formatEther(newCreditWei)}) exceeds on-chain balance (${formatEther(totalOnChainBalanceWei)})`)
        console.warn(`   → Capping credit to on-chain balance`)
        newCreditWei = totalOnChainBalanceWei
      }
    } else {
      // Auto mode: Use on-chain balance if higher than database credit
      if (totalOnChainBalanceWei > currentCreditWei) {
        newCreditWei = totalOnChainBalanceWei
        console.log(`\n🔄 Auto mode: Syncing credit to higher on-chain balance`)
      } else {
        // No change needed
        console.log(`\n✅ Credit already up to date`)
        return NextResponse.json({
          success: true,
          message: "Credit already up to date",
          currentCreditWei: currentCreditWei.toString(),
          currentCreditEth: formatEther(currentCreditWei),
          onChainBalanceWei: totalOnChainBalanceWei.toString(),
          onChainBalanceEth: formatEther(totalOnChainBalanceWei),
          synced: false,
        })
      }
    }

    // Step 4: Update database with new credit
    console.log(`\n💾 Updating database...`)
    console.log(`   → Old credit: ${formatEther(currentCreditWei)} ETH`)
    console.log(`   → New credit: ${formatEther(newCreditWei)} ETH`)
    console.log(`   → Difference: ${formatEther(newCreditWei - currentCreditWei)} ETH`)

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

    console.log(`✅ Credit updated successfully!`)
    console.log(`   → User: ${normalizedUserAddress}`)
    console.log(`   → New credit: ${formatEther(newCreditWei)} ETH`)

    return NextResponse.json({
      success: true,
      message: syncOnly ? "Credit synced with on-chain balance" : "Credit added successfully",
      previousCreditWei: currentCreditWei.toString(),
      previousCreditEth: formatEther(currentCreditWei),
      newCreditWei: newCreditWei.toString(),
      newCreditEth: formatEther(newCreditWei),
      addedWei: (newCreditWei - currentCreditWei).toString(),
      addedEth: formatEther(newCreditWei - currentCreditWei),
      onChainBalanceWei: totalOnChainBalanceWei.toString(),
      onChainBalanceEth: formatEther(totalOnChainBalanceWei),
      txHash: txHash || null,
    })
  } catch (error: any) {
    console.error("❌ Error in add-credit API:", error)
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

