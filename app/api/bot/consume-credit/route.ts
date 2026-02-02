import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { formatEther } from "viem"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * API Endpoint: Consume Credit from Bot Wallet
 * 
 * Reduces credit balance when bot wallet consumes credit during swap execution.
 * 
 * Logic:
 * 1. Find the bot_wallet_credits record for this bot wallet (only 1 row per bot_wallet_address)
 * 2. Reduce the weth_balance_wei by the consumed amount
 * 3. If weth_balance_wei becomes 0 or negative, set it to 0
 * 
 * This ensures:
 * - Total credit balance = Main wallet credit + Sum of remaining bot wallet credits
 * - Credit balance decreases in real-time as bot consumes credit
 * - Only valid credits from Distribute function are tracked
 * - Only weth_balance_wei is used (distributed_amount_wei removed)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress, botWalletAddress, consumedWethAmountWei } = body as {
      userAddress: string
      botWalletAddress: string
      consumedWethAmountWei: string
    }

    if (!userAddress || !botWalletAddress || !consumedWethAmountWei) {
      return NextResponse.json(
        { error: "Missing required fields: userAddress, botWalletAddress, consumedWethAmountWei" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const normalizedUserAddress = userAddress.toLowerCase()
    const normalizedBotWalletAddress = botWalletAddress.toLowerCase()

    // Find the bot_wallet_credits record for this bot wallet
    // IMPORTANT: Only 1 row per bot_wallet_address (unique constraint)
    // Only weth_balance_wei is used (distributed_amount_wei removed)
    const { data: creditRecord, error: fetchError } = await supabase
      .from("bot_wallet_credits")
      .select("id, weth_balance_wei")
      .eq("user_address", normalizedUserAddress)
      .eq("bot_wallet_address", normalizedBotWalletAddress)
      .single()

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        // No record found - bot wallet may not have received credit yet
        console.warn(`⚠️ No credit record found for bot wallet ${normalizedBotWalletAddress}`)
        return NextResponse.json({
          success: true,
          message: "No credit record found for this bot wallet",
          consumedWethAmountWei: "0",
          remainingCreditWei: "0",
        })
      }
      
      console.error("❌ Error fetching bot wallet credits:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch bot wallet credits", details: fetchError.message },
        { status: 500 }
      )
    }

    if (!creditRecord) {
      return NextResponse.json({
        success: true,
        message: "No credit record found for this bot wallet",
        consumedWethAmountWei: "0",
        remainingCreditWei: "0",
      })
    }

    // Get current WETH balance (only weth_balance_wei is used)
    const currentBalanceWei = BigInt(creditRecord.weth_balance_wei || "0")
    const consumedAmount = BigInt(consumedWethAmountWei)

    // Check if there's enough credit to consume
    if (currentBalanceWei < consumedAmount) {
      console.warn(
        `⚠️ Insufficient credit: Current ${formatEther(currentBalanceWei)} WETH, Consumed ${formatEther(consumedAmount)} WETH`
      )
      // Consume all available credit (set to 0)
      const { error: updateError } = await supabase
        .from("bot_wallet_credits")
        .update({ 
          weth_balance_wei: "0",
        })
        .eq("id", creditRecord.id)

      if (updateError) {
        console.error("❌ Error updating credit:", updateError)
        return NextResponse.json(
          { error: "Failed to update credit", details: updateError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: "Consumed all available credit (insufficient balance)",
        consumedWethAmountWei: currentBalanceWei.toString(),
        remainingCreditWei: "0",
      })
    }

    // Consume credit: subtract consumed amount from current balance
    const newBalance = currentBalanceWei - consumedAmount

    const { error: updateError } = await supabase
      .from("bot_wallet_credits")
      .update({ 
        weth_balance_wei: newBalance.toString(),
      })
      .eq("id", creditRecord.id)

    if (updateError) {
      console.error("❌ Error updating credit:", updateError)
      return NextResponse.json(
        { error: "Failed to update credit", details: updateError.message },
        { status: 500 }
      )
    }

    console.log(`✅ WETH credit consumed:`)
    console.log(`   Bot Wallet: ${normalizedBotWalletAddress}`)
    console.log(`   Consumed: ${formatEther(consumedAmount)} WETH`)
    console.log(`   Remaining: ${formatEther(newBalance)} WETH`)

    return NextResponse.json({
      success: true,
      message: "Credit consumed successfully",
      consumedWethAmountWei: consumedAmount.toString(),
      remainingCreditWei: newBalance.toString(),
    })
  } catch (error: any) {
    console.error("❌ Error in consume-credit API:", error)
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

