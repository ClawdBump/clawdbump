import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { getAddress, type Address, type Hex } from "viem"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * API Endpoint: Send Smart Wallet Transaction (No Approval Required)
 * 
 * This endpoint sends transactions from user's Privy Smart Wallet
 * WITHOUT requiring user approval by using Privy's Smart Wallet API.
 * 
 * Request Body:
 * - userAddress: User's main Smart Wallet address
 * - to: (Optional) Transaction recipient address (for single transaction)
 * - data: (Optional) Transaction data (for single transaction)
 * - value: (Optional) Transaction value in wei (for single transaction)
 * - calls: (Optional) Array of batch calls (for batch transaction)
 * 
 * Returns:
 * - txHash: Transaction hash
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      userAddress, 
      to, 
      data, 
      value, 
      calls 
    } = body as {
      userAddress: string
      to?: string
      data?: string
      value?: string
      calls?: Array<{ to: string; data: string; value: string }>
    }

    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing required field: userAddress" },
        { status: 400 }
      )
    }

    if (!to && !calls) {
      return NextResponse.json(
        { error: "Either 'to' or 'calls' must be provided" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const normalizedUserAddress = userAddress.toLowerCase()

    // Privy credentials for Smart Wallet API
    const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!
    const privyAppSecret = process.env.PRIVY_APP_SECRET!

    if (!privyAppId || !privyAppSecret) {
      return NextResponse.json(
        { error: "Privy credentials not configured" },
        { status: 500 }
      )
    }

    // Get user's Privy user ID from database
    const { data: userMapping, error: userMappingError } = await supabase
      .from("telegram_user_mappings")
      .select("privy_user_id")
      .eq("wallet_address", normalizedUserAddress)
      .single()

    if (userMappingError || !userMapping?.privy_user_id) {
      return NextResponse.json(
        { 
          error: "User not found in database. Please ensure user has logged in via Privy."
        },
        { status: 404 }
      )
    }

    const privyUserId = userMapping.privy_user_id
    const mainWalletAddress = getAddress(userAddress)

    // Privy Smart Wallet API endpoint
    const privyApiUrl = `https://auth.privy.io/api/v1/users/${privyUserId}/smart-wallets/${mainWalletAddress}/user-operations`
    
    // Format request body
    const requestBody: any = {
      network: "base",
    }

    if (calls && calls.length > 0) {
      // Batch calls
      requestBody.calls = calls.map(call => ({
        to: call.to,
        data: call.data || '0x',
        value: call.value || '0',
      }))
    } else if (to) {
      // Single transaction
      requestBody.calls = [{
        to: to,
        data: data || '0x',
        value: value || '0',
      }]
    }

    // Call Privy Smart Wallet API (no user approval needed)
    const txResponse = await fetch(privyApiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${privyAppSecret}`,
        "privy-app-id": privyAppId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    })

    if (!txResponse.ok) {
      const errorData = await txResponse.json().catch(() => ({ message: txResponse.statusText }))
      console.error(`❌ Privy Smart Wallet API error:`, errorData)
      return NextResponse.json(
        { error: `Privy Smart Wallet API error: ${errorData.message || txResponse.statusText}` },
        { status: txResponse.status }
      )
    }

    const txData = await txResponse.json()
    // Privy Smart Wallet returns UserOperation hash or transaction hash
    const txHash = txData.txHash || txData.hash || txData.transactionHash || txData.userOpHash || txData.userOperationHash

    if (!txHash) {
      console.error(`❌ Privy Smart Wallet API response:`, txData)
      return NextResponse.json(
        { error: "No transaction hash returned from Privy Smart Wallet API" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      txHash: txHash,
    })
  } catch (error: any) {
    console.error("❌ Error in send-smart-wallet-transaction:", error)
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 }
    )
  }
}

