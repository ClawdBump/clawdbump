"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"

interface SyncResult {
  botWalletAddress: string
  previousNativeEth: string
  previousWeth: string
  newNativeEth: string
  newWeth: string
  synced: boolean
  error?: string
}

interface SyncResponse {
  success: boolean
  synced: number
  total: number
  results: SyncResult[]
  message: string
}

/**
 * Hook to sync all bot wallet credits with on-chain balance
 * 
 * Usage:
 * const { syncBalances, isSyncing, error } = useSyncBotBalances()
 * 
 * await syncBalances(userAddress)
 */
export function useSyncBotBalances() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const syncBalances = useCallback(async (userAddress: string | null) => {
    if (!userAddress) {
      const err = new Error("User address is required")
      setError(err)
      toast.error("User address is required")
      return null
    }

    setIsSyncing(true)
    setError(null)

    try {
      console.log("🔄 Syncing bot wallet balances...")

      const response = await fetch("/api/bot/sync-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      })

      const data = (await response.json()) as SyncResponse

      if (!response.ok) {
        throw new Error(data.message || "Failed to sync balances")
      }

      if (data.success) {
        const syncedCount = data.synced
        const totalCount = data.total

        if (syncedCount === totalCount && totalCount > 0) {
          toast.success(`All ${totalCount} bot wallet(s) synced successfully!`, {
            description: "Balances updated to match on-chain",
          })
        } else if (syncedCount > 0) {
          toast.success(`${syncedCount} out of ${totalCount} wallet(s) synced`, {
            description: "Some wallets may have errors",
          })
        } else {
          toast.info("No bot wallets found to sync")
        }

        // Log results
        if (data.results && data.results.length > 0) {
          console.log("📊 Sync Results:")
          data.results.forEach((result, index) => {
            if (result.synced) {
              console.log(
                `   ✅ Wallet ${index + 1}: ${result.botWalletAddress.substring(0, 10)}... synced`
              )
            } else {
              console.error(
                `   ❌ Wallet ${index + 1}: ${result.botWalletAddress.substring(0, 10)}... failed: ${result.error}`
              )
            }
          })
        }

        return data
      } else {
        throw new Error(data.message || "Sync failed")
      }
    } catch (err: any) {
      console.error("❌ Error syncing bot balances:", err)
      const error = err instanceof Error ? err : new Error(err.message || "Unknown error")
      setError(error)
      toast.error("Failed to sync bot wallet balances", {
        description: error.message,
      })
      return null
    } finally {
      setIsSyncing(false)
    }
  }, [])

  return {
    syncBalances,
    isSyncing,
    error,
  }
}

