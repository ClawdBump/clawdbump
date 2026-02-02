"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { type Address } from "viem"

interface BotSession {
  id: number
  user_address: string
  token_address: string
  buy_amount_per_bump_wei: string
  total_sessions: number
  current_session: number
  wallet_rotation_index: number
  status: "running" | "paused" | "stopped" | "completed"
  started_at: string | null
  stopped_at: string | null
  created_at: string
  updated_at: string
}

interface StartSessionParams {
  userAddress: string
  tokenAddress: Address
  amountUsd: string // USD amount per bump (will be converted to ETH/Wei on backend using real-time price)
  intervalSeconds: number // Interval in seconds (2-600) - Bot runs continuously until stopped
}

/**
 * Hook to manage bot session
 */
export function useBotSession(userAddress: string | null) {
  const queryClient = useQueryClient()

  // Get current session
  const { data: session, isLoading, error } = useQuery<BotSession | null>({
    queryKey: ["bot-session", userAddress],
    queryFn: async () => {
      if (!userAddress) {
        return null
      }

      const response = await fetch(`/api/bot/session?userAddress=${userAddress}`)

      if (!response.ok) {
        if (response.status === 404) {
          return null // No active session
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to get bot session")
      }

      const data = await response.json()
      return data.session as BotSession | null
    },
    enabled: !!userAddress,
    refetchInterval: 5000, // Refetch every 5 seconds to get updated status
  })

  // Start session mutation
  const startSession = useMutation({
    mutationFn: async (params: StartSessionParams) => {
      const response = await fetch("/api/bot/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to start bot session")
      }

      return response.json()
    },
    onSuccess: () => {
      // Invalidate and refetch session after a short delay
      // This prevents race conditions with state updates
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["bot-session", userAddress] })
      }, 500)
    },
  })

  // Stop session mutation
  const stopSession = useMutation({
    mutationFn: async () => {
      if (!userAddress) {
        throw new Error("User address is required")
      }

      const response = await fetch(`/api/bot/session?userAddress=${userAddress}`, {
        method: "DELETE",
      })

      // Handle 404 gracefully - if no active session found, consider it already stopped
      if (response.status === 404) {
        console.log("ℹ️ No active session found - session may already be stopped")
        return {
          success: true,
          message: "Session already stopped or not found",
          session: null,
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to stop bot session")
      }

      return response.json()
    },
    onSuccess: () => {
      // Invalidate and refetch session after a short delay
      // This prevents race conditions with state updates
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["bot-session", userAddress] })
      }, 500)
    },
  })

  // Expose refetch function to manually refresh session data
  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["bot-session", userAddress] })
  }

  return {
    session,
    isLoading,
    error,
    startSession: startSession.mutateAsync,
    stopSession: stopSession.mutateAsync,
    isStarting: startSession.isPending,
    isStopping: stopSession.isPending,
    refetch, // Expose refetch function
  }
}

