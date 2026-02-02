import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface UpdateLogRequest {
  logId: number
  txHash: string
  status: "success" | "failed" | "pending"
  message?: string // Optional: Update message if provided
}

/**
 * API Route: Update bot log with transaction hash
 * 
 * This route updates a bot log entry with the transaction hash after a transaction completes
 */
export async function POST(request: NextRequest) {
  try {
    const body: UpdateLogRequest = await request.json()
    const { logId, txHash, status } = body

    if (!logId || !txHash) {
      return NextResponse.json(
        { error: "Missing required fields: logId, txHash" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()

    const updateData: {
      tx_hash: string
      status: "success" | "failed" | "pending"
      message?: string
    } = {
      tx_hash: txHash,
      status: status || "success",
    }
    
    // Update message if provided (for wallet-specific funding logs)
    if (body.message) {
      updateData.message = body.message
    }

    const { error: updateError } = await supabase
      .from("bot_logs")
      .update(updateData)
      .eq("id", logId)

    if (updateError) {
      console.error("❌ Error updating bot log:", updateError)
      return NextResponse.json(
        { error: "Failed to update bot log" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Bot log updated successfully",
    })
  } catch (error: any) {
    console.error("❌ Error in update log:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

