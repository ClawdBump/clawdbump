"use client"

import { useEffect, useState } from "react"
import { usePrivy } from "@privy-io/react-auth"

/**
 * Hook to automatically pair Telegram ID with Privy user after Telegram login
 * 
 * Based on Privy documentation: https://docs.privy.io/recipes/react/seamless-telegram
 * 
 * This hook:
 * 1. Detects when user logs in via Telegram through Privy (standard or seamless)
 * 2. Extracts Telegram ID from Privy user.telegram or user.linkedAccounts
 * 3. Calls /api/v1/auth/telegram/pair to store mapping in database
 * 4. Bot Telegram (ClawdBumpbot) can then check if user has logged in
 * 
 * Supports:
 * - Standard Telegram Login Widget (via Privy modal)
 * - Seamless Telegram login from Telegram bot or Mini App
 * 
 * Usage:
 * ```tsx
 * const { isPaired, isPairing, error } = useTelegramPair()
 * ```
 */
export function useTelegramPair() {
  const { ready, authenticated, user } = usePrivy()
  const [isPaired, setIsPaired] = useState(false)
  const [isPairing, setIsPairing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAttemptedPair, setHasAttemptedPair] = useState(false)

  useEffect(() => {
    // Only attempt pairing once when user is authenticated
    if (!ready || !authenticated || !user || hasAttemptedPair) {
      return
    }

    // Check for Telegram account using Privy's recommended approach
    // According to Privy docs: user.telegram or user.linkedAccounts
    let telegramAccount = user.telegram

    // Fallback to linkedAccounts if user.telegram is not available
    if (!telegramAccount) {
      telegramAccount = user.linkedAccounts?.find(
        (account: any) => account.type === "telegram"
      )
    }

    if (!telegramAccount) {
      // User didn't login via Telegram, skip pairing
      setHasAttemptedPair(true)
      return
    }

    // Extract Telegram data from account
    // According to Privy docs, TelegramAccount has:
    // - telegram_user_id (string) - ID of user's telegram account
    // - first_name (string)
    // - last_name (string, optional)
    // - username (string, optional)
    // - photo_url (string, optional)
    // 
    // Note: Privy may also use 'subject' field for backward compatibility
    const telegramId = (telegramAccount as any).telegram_user_id || 
                       (telegramAccount as any).subject || 
                       null
    
    if (!telegramId) {
      console.warn("⚠️ Telegram account found but no telegram_user_id or subject field")
      setHasAttemptedPair(true)
      return
    }

    const telegramUsername = (telegramAccount as any).username || null
    const firstName = (telegramAccount as any).first_name || null
    const lastName = (telegramAccount as any).last_name || null
    const photoUrl = (telegramAccount as any).photo_url || null

    // Get wallet address (Smart Wallet)
    // Prioritize Smart Wallet over Embedded Wallet
    const smartWallet = user.linkedAccounts?.find(
      (account: any) => account.type === "wallet" && account.walletClientType === "smart_wallet"
    )
    const walletAddress = smartWallet?.address || user.wallet?.address

    if (!walletAddress) {
      console.warn("⚠️ No wallet address found, skipping Telegram pairing")
      setHasAttemptedPair(true)
      return
    }

    // Pair Telegram ID with Privy user
    const pairTelegram = async () => {
      setIsPairing(true)
      setError(null)

      try {
        const response = await fetch("/api/v1/auth/telegram/pair", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            telegram_id: telegramId.toString(), // Ensure it's a string
            telegram_username: telegramUsername,
            wallet_address: walletAddress,
            privy_user_id: user.id,
            first_name: firstName,
            last_name: lastName,
            photo_url: photoUrl,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || "Failed to pair Telegram ID")
        }

        const data = await response.json()
        console.log("✅ Telegram ID paired successfully:", {
          telegram_id: telegramId,
          telegram_username: telegramUsername || "N/A",
          wallet_address: walletAddress,
        })
        setIsPaired(true)
        setHasAttemptedPair(true)
      } catch (err: any) {
        console.error("❌ Error pairing Telegram ID:", err)
        setError(err.message || "Failed to pair Telegram ID")
        // Don't set hasAttemptedPair to true on error, so we can retry
      } finally {
        setIsPairing(false)
      }
    }

    pairTelegram()
  }, [ready, authenticated, user, hasAttemptedPair])

  return {
    isPaired,
    isPairing,
    error,
  }
}
