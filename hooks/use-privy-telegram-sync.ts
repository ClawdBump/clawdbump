"use client"

import { useEffect, useRef } from "react"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { createSupabaseClient } from "@/lib/supabase"

/**
 * Hook to sync Telegram user data to Supabase when user logs in via Privy
 * 
 * When a user logs in through Telegram via Privy, this hook:
 * 1. Detects the Telegram account in the user's linked accounts
 * 2. Extracts Telegram user information (ID, username, first_name, last_name, photo_url)
 * 3. Gets the smart wallet address from Privy
 * 4. Upserts the data into the `telegram_user_mappings` table
 * 
 * Table schema:
 * - id (PK)
 * - telegram_id
 * - telegram_username
 * - first_name
 * - last_name
 * - photo_url
 * - wallet_address (smart wallet address)
 * - privy_user_id
 * - is_active (boolean)
 * - last_login_at (timestamp)
 * - created_at (timestamp)
 * - updated_at (timestamp)
 * - owner_address (bot wallet owner address - can be updated separately)
 */
export function usePriyTelegramSync() {
  const { ready, authenticated, user } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient } = useSmartWallets()
  const syncedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!ready || !authenticated || !user) {
      return
    }

    // Check if user has Telegram account linked
    const telegramAccount = user.linkedAccounts?.find(
      (account: any) => account.type === "telegram"
    )

    if (!telegramAccount) {
      console.log("[v0] No Telegram account linked for user:", user.id)
      return
    }

    // Prevent duplicate syncs for the same user
    if (syncedUserIdRef.current === user.id) {
      console.log("[v0] User already synced in this session:", user.id)
      return
    }

    // Get smart wallet address
    const smartWallet = wallets.find(
      (w: any) => w.type === "smart_wallet" || w.walletClientType === "smart_wallet"
    )
    const walletAddress = smartWalletClient?.account?.address || smartWallet?.address

    if (!walletAddress) {
      console.log("[v0] Smart wallet not yet initialized")
      return
    }

    // Sync Telegram user data to database
    const syncTelegramUser = async () => {
      try {
        const supabase = createSupabaseClient()

        // Extract Telegram user information
        const telegramData = {
          telegram_id: telegramAccount.telegramUserId || telegramAccount.id,
          telegram_username: telegramAccount.username || null,
          first_name: telegramAccount.firstName || null,
          last_name: telegramAccount.lastName || null,
          photo_url: telegramAccount.profilePictureUrl || null,
          wallet_address: walletAddress.toLowerCase(),
          privy_user_id: user.id,
          is_active: true,
          last_login_at: new Date().toISOString(),
        }

        console.log("[v0] Syncing Telegram user to database:", telegramData)

        // Upsert to telegram_user_mappings table
        const { data, error } = await supabase
          .from("telegram_user_mappings")
          .upsert(
            {
              ...telegramData,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "telegram_id",
            }
          )
          .select()

        if (error) {
          console.error("[v0] Error syncing Telegram user:", error)
          return
        }

        console.log("[v0] Successfully synced Telegram user:", data)
        syncedUserIdRef.current = user.id
      } catch (error) {
        console.error("[v0] Error in syncTelegramUser:", error)
      }
    }

    syncTelegramUser()
  }, [ready, authenticated, user, wallets, smartWalletClient])
}
