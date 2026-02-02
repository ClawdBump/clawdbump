import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60 // 60 seconds - only for initial validation

interface ContinuousSwapRequest {
  userAddress: string
}

/**
 * API Route: Continuous Swap Trigger (Railway Worker Activation)
 * 
 * This route is now a LIGHTWEIGHT TRIGGER that:
 * 1. Validates the session exists and is running
 * 2. Logs the trigger event
 * 3. Returns immediately
 * 
 * The actual continuous swapping is handled by Railway Worker (server/bumping-worker.ts)
 * which polls the database every 30 seconds and processes swaps independently.
 * 
 * This prevents Vercel timeout issues (5 minute limit) and ensures bumping
 * continues even if user closes the app.
 */
export async function POST(request: NextRequest) {
  try {
    const body: ContinuousSwapRequest = await request.json()
    const { userAddress } = body

    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing required field: userAddress" },
        { status: 400 }
      )
    }

    const normalizedUserAddress = userAddress.toLowerCase()
    const supabase = createSupabaseServiceClient()

    // Fetch active session
    const { data: session, error: sessionError } = await supabase
      .from("bot_sessions")
      .select("id, status, interval_seconds, wallet_rotation_index, token_address, amount_usd")
      .eq("user_address", normalizedUserAddress)
      .eq("status", "running")
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "No active bot session found" },
        { status: 404 }
      )
    }

    console.log(`\n🎯 Continuous swap trigger received for user: ${normalizedUserAddress}`)
    console.log(`   Session ID: ${session.id}`)
    console.log(`   Token: ${session.token_address}`)
    console.log(`   Amount: $${session.amount_usd} USD`)
    console.log(`   Interval: ${session.interval_seconds}s`)
    console.log(`   Current wallet index: ${session.wallet_rotation_index}`)
    console.log(`\n   ℹ️  Railway Worker will handle continuous swapping`)
    console.log(`   ℹ️  Worker polls database every 30 seconds`)
    console.log(`   ℹ️  Swaps will continue even if app is closed\n`)

    // Log trigger event
    await supabase.from("bot_logs").insert({
      user_address: normalizedUserAddress,
      wallet_address: null,
      token_address: session.token_address,
      amount_wei: "0",
      action: "continuous_swap_triggered",
      message: "[System] Continuous swap triggered - Railway Worker will handle execution",
      status: "info",
    })

    // Return immediately - Railway Worker handles the rest
    return NextResponse.json({
      success: true,
      message: "Continuous swap triggered successfully. Railway Worker is now handling swaps.",
      sessionId: session.id,
      workerInfo: {
        pollingInterval: "30 seconds",
        note: "Swaps will continue even if you close the app",
      },
    })
  } catch (error: any) {
    console.error("❌ Error triggering continuous swap:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}






