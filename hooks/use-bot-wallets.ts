"use client"

import { useQuery } from "@tanstack/react-query"
import { type Address } from "viem"

interface BotWallet {
  smartWalletAddress: Address
  index: number
}

interface UseBotWalletsOptions {
  userAddress: string | null
  enabled?: boolean
}

/**
 * Hook to get or create bot wallets for user
 */
export function useBotWallets({ userAddress, enabled = true }: UseBotWalletsOptions) {
  return useQuery<BotWallet[]>({
    queryKey: ["bot-wallets", userAddress],
    queryFn: async () => {
      if (!userAddress) {
        throw new Error("User address is required")
      }

      // Pastikan userAddress sudah di-lowercase
      const normalizedUserAddress = userAddress.toLowerCase()

      try {
        const response = await fetch("/api/bot/get-or-create-wallets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userAddress: normalizedUserAddress }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = errorData.error || `Failed to get bot wallets (${response.status})`
          console.error("❌ Error fetching bot wallets:", errorMessage, errorData)
          throw new Error(errorMessage)
        }

        const data = await response.json()
        return data.wallets as BotWallet[]
      } catch (error: any) {
        console.error("❌ Error in useBotWallets queryFn:", error)
        // Re-throw to let React Query handle it
        throw error
      }
    },
    // Set properti berikut di dalam useQuery untuk mencegah auto-fetch
    enabled: false, // IMPORTANT: Set enabled: false agar API tidak dipanggil otomatis
    refetchOnWindowFocus: false, // IMPORTANT: Tidak refetch saat window focus (menghilangkan error di konsol saat tab berpindah)
    retry: false, // IMPORTANT: Tidak retry otomatis
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes (wallets are permanent)
    // Return empty array on error to prevent crashes
    onError: (error) => {
      console.error("❌ useBotWallets error:", error)
      // Don't throw - let React Query handle it gracefully
    },
    // Return empty array as fallback to prevent undefined errors
    placeholderData: [],
  })
}

