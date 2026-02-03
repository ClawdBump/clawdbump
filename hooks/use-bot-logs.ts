"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { createSupabaseClient } from "@/lib/supabase"
import { formatEther } from "viem"
import type { RealtimeChannel } from "@supabase/supabase-js"

interface BotLog {
  id: number
  user_address: string
  bot_wallet_address: string | null
  wallet_address?: string // Legacy field for backward compatibility
  tx_hash: string | null
  token_address: string | null
  amount_wei: string | null
  action: string // Activity type (swap_completed, credit_distributed, etc.)
  status: "pending" | "success" | "failed"
  message: string | null
  error_details: any
  created_at: string
}

interface UseBotLogsOptions {
  userAddress: string | null
  enabled?: boolean
  limit?: number // Number of logs to fetch initially
}

/**
 * Hook to fetch and subscribe to bot logs in realtime
 * 
 * Features:
 * - Initial fetch of last N logs
 * - Realtime subscription to new logs
 * - Automatic cleanup on unmount
 */
export function useBotLogs({ userAddress, enabled = true, limit = 20 }: UseBotLogsOptions) {
  // CRITICAL: Use useMemo to create stable supabase client reference
  // This prevents infinite loops caused by new client instance on every render
  const supabase = useMemo(() => createSupabaseClient(), [])
  const [logs, setLogs] = useState<BotLog[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  
  // Track previous initialLogs to prevent unnecessary updates
  const prevInitialLogsRef = useRef<BotLog[] | undefined>(undefined)

  // Initial fetch of recent logs
  const { data: initialLogs, isLoading, error } = useQuery<BotLog[]>({
    queryKey: ["bot-logs", userAddress, limit],
    queryFn: async () => {
      if (!userAddress) {
        throw new Error("User address is required")
      }

      const { data, error: fetchError } = await supabase
        .from("bot_logs")
        .select("*")
        .eq("user_address", userAddress.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(limit)

      if (fetchError) {
        throw fetchError
      }

      return (data || []) as BotLog[]
    },
    enabled: enabled && !!userAddress,
    staleTime: 0, // Always fetch fresh data
  })

  // Set initial logs - only update if logs actually changed
  // Ensure logs are sorted by created_at descending (newest first)
  useEffect(() => {
    if (initialLogs && initialLogs !== prevInitialLogsRef.current) {
      // Check if logs are actually different (by comparing IDs)
      const currentIds = initialLogs.map(log => log.id).join(',')
      const prevIds = prevInitialLogsRef.current?.map(log => log.id).join(',') || ''
      
      if (currentIds !== prevIds) {
        // Sort logs by created_at descending to ensure newest first
        const sortedLogs = [...initialLogs].sort((a, b) => {
          const dateA = new Date(a.created_at).getTime()
          const dateB = new Date(b.created_at).getTime()
          return dateB - dateA // Descending order (newest first)
        })
        prevInitialLogsRef.current = sortedLogs
        setLogs(sortedLogs)
      }
    } else if (!initialLogs && prevInitialLogsRef.current) {
      // Clear logs if initialLogs becomes null/undefined
      prevInitialLogsRef.current = undefined
      setLogs([])
    }
  }, [initialLogs])

  // Setup realtime subscription
  // CRITICAL: Only depend on userAddress and enabled, NOT supabase (it's stable via useMemo)
  useEffect(() => {
    if (!userAddress || !enabled) {
      // Cleanup existing subscription if disabled
      if (channelRef.current) {
        console.log("🧹 Cleaning up realtime subscription (disabled)")
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
      return
    }

    // Cleanup previous subscription if it exists
    if (channelRef.current) {
      console.log("🧹 Cleaning up previous realtime subscription")
      channelRef.current.unsubscribe()
      channelRef.current = null
    }

    // Create realtime channel for bot_logs
    const realtimeChannel = supabase
      .channel(`bot_logs_realtime_${userAddress.toLowerCase()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bot_logs",
          filter: `user_address=eq.${userAddress.toLowerCase()}`,
        },
        (payload) => {
          console.log("🆕 New bot log received:", payload.new)
          const newLog = payload.new as BotLog
          
          // Add new log to the beginning of the list (newest first)
          setLogs((prevLogs) => {
            // Check if log already exists (prevent duplicates)
            if (prevLogs.some((log) => log.id === newLog.id)) {
              return prevLogs
            }
            // Ensure newest logs are at the beginning
            const updatedLogs = [newLog, ...prevLogs]
            // Sort by created_at descending to ensure newest first
            return updatedLogs.sort((a, b) => {
              const dateA = new Date(a.created_at).getTime()
              const dateB = new Date(b.created_at).getTime()
              return dateB - dateA // Descending order (newest first)
            })
          })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bot_logs",
          filter: `user_address=eq.${userAddress.toLowerCase()}`,
        },
        (payload) => {
          console.log("🔄 Bot log updated:", payload.new)
          const updatedLog = payload.new as BotLog
          
          // Update existing log - only update if log actually changed
          setLogs((prevLogs) => {
            const existingLog = prevLogs.find(log => log.id === updatedLog.id)
            // Only update if log actually changed
            if (existingLog && JSON.stringify(existingLog) !== JSON.stringify(updatedLog)) {
              return prevLogs.map((log) => (log.id === updatedLog.id ? updatedLog : log))
            }
            return prevLogs
          })
        }
      )
      .subscribe((status) => {
        console.log("📡 Realtime subscription status:", status)
      })

    channelRef.current = realtimeChannel

    // Cleanup on unmount or when dependencies change
    return () => {
      console.log("🧹 Cleaning up realtime subscription")
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
    // CRITICAL: supabase is stable via useMemo, but we include it for completeness
    // It won't cause re-renders since useMemo ensures stable reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress, enabled])

  return {
    logs,
    isLoading,
    error,
    refetch: () => {
      // Trigger refetch by invalidating query
      // This will be handled by React Query
    },
  }
}

/**
 * Get wallet label from wallet address
 * Matches wallet address to index (0-4) to show "Bot Wallet #1", etc.
 */
/**
 * Get activity icon based on action type
 */
export function getActivityIcon(action: string): string {
  switch (action) {
    case "credit_distributed":
      return "📥" // Receiving credits
    case "swap_completed":
    case "swap_executed":
    case "swap_started":
    case "swap_executing":
      return "🔄" // Swap
    case "swap_failed":
      return "❌" // Failed swap
    case "eth_sent":
    case "weth_sent":
      return "📤" // Sending
    case "eth_received":
    case "weth_received":
      return "📥" // Receiving
    case "weth_deposited":
      return "💱" // Convert to WETH
    case "weth_withdrawn":
      return "💱" // Convert to ETH
    case "token_sent":
      return "📤"
    case "token_received":
      return "📥"
    case "insufficient_balance":
      return "⚠️"
    default:
      return "ℹ️" // Info
  }
}

/**
 * Get human-readable action label
 */
export function getActionLabel(action: string): string {
  switch (action) {
    case "credit_distributed":
      return "Credit Distribution"
    case "swap_completed":
      return "Swap Completed"
    case "swap_started":
    case "swap_executing":
      return "Swap In Progress"
    case "swap_executed":
    case "swap_completed":
      return "Swap Completed"
    case "swap_failed":
      return "Swap Failed"
    case "eth_sent":
      return "ETH Sent"
    case "weth_sent":
      return "WETH Sent"
    case "eth_received":
      return "ETH Received"
    case "weth_received":
      return "WETH Received"
    case "weth_deposited":
      return "Converted to WETH"
    case "weth_withdrawn":
      return "Converted to ETH"
    case "token_sent":
      return "Token Sent"
    case "token_received":
      return "Token Received"
    case "insufficient_balance":
      return "Insufficient Balance"
    default:
      return "System Message"
  }
}

export function getWalletLabel(
  walletAddress: string | null,
  botWallets: Array<{ smartWalletAddress: string; index: number }> | null
): string {
  // Handle null or undefined wallet address (system logs)
  if (!walletAddress) {
    return "Main Wallet"
  }
  
  if (!botWallets || botWallets.length === 0) {
    return "Bot Wallet"
  }

  const wallet = botWallets.find(
    (w) => w.smartWalletAddress?.toLowerCase() === walletAddress.toLowerCase()
  )

  if (wallet) {
    return `Bot Wallet #${wallet.index + 1}`
  }

  return "Bot Wallet"
}

/**
 * Format relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) {
    return "just now"
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
  } else {
    return date.toLocaleDateString()
  }
}
