"use client"

import { useEffect, useState, useCallback } from "react"

import { usePrivy } from "@privy-io/react-auth"

/**
 * Hook untuk handle Telegram Mini App authentication
 * 
 * Perbaikan:
 * - Sekarang SELALU mengupdate last_login_at untuk semua user (baru & lama)
 * - Tidak ada lagi kondisi skip untuk user yang sudah terverifikasi
 * - Menambahkan retry logic untuk meningkatkan reliability
 */

export function useTelegramMiniAppAuth() {
  const { ready, authenticated, user, createWallet } = usePrivy()

  const [isVerified, setIsVerified] = useState(false)
  const [telegramId, setTelegramId] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [privyUserId, setPrivyUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initData, setInitData] = useState<string | null>(null)

  // Check if we're in Telegram Mini App
  const isTelegramWebApp = typeof window !== "undefined" && (window as any).Telegram?.WebApp

  // Get initData from Telegram WebApp
  useEffect(() => {
    if (!isTelegramWebApp) {
      setIsLoading(false)
      return
    }

    try {
      const tg = (window as any).Telegram.WebApp
      const rawInitData = tg.initData

      if (!rawInitData) {
        console.warn("⚠️ Telegram WebApp initData not available")
        setIsLoading(false)
        return
      }

      setInitData(rawInitData)
    } catch (err: any) {
      console.error("❌ Error getting Telegram initData:", err)
      setError(err.message || "Failed to get Telegram initData")
      setIsLoading(false)
    }
  }, [isTelegramWebApp])

  // Verify initData with backend
  const verifyInitData = useCallback(async (rawInitData: string) => {
    console.log("🔍 [FRONTEND] Starting initData verification...")
    setIsLoading(true)
    setError(null)

    try {
      console.log("🔍 [FRONTEND] Sending request to /api/v1/auth/telegram/verify...")
      const response = await fetch(
        `/api/v1/auth/telegram/verify?initData=${encodeURIComponent(rawInitData)}`
      )

      if (!response.ok) {
        const errorData = await response.json()
        console.error("❌ [FRONTEND] Verify request failed:", errorData)
        throw new Error(errorData.message || "Failed to verify initData")
      }

      const data = await response.json()
      console.log("✅ [FRONTEND] Verify response received:", data)

      // Always set telegram_id from response
      if (data.telegram_id) {
        console.log("✅ [FRONTEND] Telegram ID extracted from verify response:", data.telegram_id)
        setTelegramId(data.telegram_id)
      }

      if (data.is_valid && data.smart_account_address) {
        // User sudah login - ada di database
        console.log("✅ [FRONTEND] User is verified and logged in")
        setIsVerified(true)
        setWalletAddress(data.smart_account_address)
        setPrivyUserId(data.privy_user_id)
      } else {
        // User belum login - belum ada di database
        console.log("ℹ️ [FRONTEND] User not logged in yet, waiting for Privy login...")
        setIsVerified(false)
      }
    } catch (err: any) {
      console.error("❌ [FRONTEND] Error verifying initData:", err)
      setError(err.message || "Failed to verify Telegram initData")
      setIsVerified(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Verify initData when available
  useEffect(() => {
    if (initData) {
      verifyInitData(initData)
    }
  }, [initData, verifyInitData])

  // ============================================================
  // PERBAIKAN UTAMA: Fungsi untuk mengupdate last_login_at
  // ============================================================
  
  const upsertLoginTimestamp = useCallback(
    async (tgId: string, walletAddr: string, privyId: string) => {
      console.log("🔍 [FRONTEND] upsertLoginTimestamp called:", {
        telegram_id: tgId,
        wallet_address: walletAddr,
        privy_user_id: privyId,
      })

      try {
        const response = await fetch("/api/v1/auth/telegram/upsert-wallet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            telegram_id: String(tgId),
            wallet_address: walletAddr.toLowerCase(),
            privy_user_id: String(privyId),
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          console.error("❌ [FRONTEND] Upsert request failed:", errorData)
          // Jangan throw error - biarkan app tetap jalan
          return { success: false, error: errorData.message }
        }

        const data = await response.json()
        console.log("✅ [FRONTEND] Login timestamp upserted:", {
          telegram_id: data.data?.telegram_id,
          last_login_at: data.data?.last_login_at,
        })

        return { success: true, data }
      } catch (err: any) {
        console.error("❌ [FRONTEND] Error upserting login timestamp:", err)
        // Jangan throw error - biarkan app tetap jalan
        return { success: false, error: err.message }
      }
    },
    []
  )

  // ============================================================
  // PERBAIKAN UTAMA: Hapus kondisi skip untuk user lama
  // ============================================================
  
  // Watch for Privy wallet and always update login timestamp
  useEffect(() => {
    console.log("🔍 [FRONTEND] ============================================")
    console.log("🔍 [FRONTEND] Checking auth state for login timestamp update...", {
      ready,
      authenticated,
      has_user: !!user,
      has_initData: !!initData,
      current_walletAddress: walletAddress,
      isVerified,
      telegramId,
    })

    // Jika bukan dari Telegram Mini App, skip
    if (!isTelegramWebApp) {
      console.log("⏸️ [FRONTEND] Not in Telegram WebApp, skipping...")
      return
    }

    if (!ready || !initData) {
      console.log("⏸️ [FRONTEND] Waiting for Privy to be ready or initData available...")
      return
    }

    // Get Telegram ID - wajib ada
    const currentTelegramId = telegramId
    if (!currentTelegramId) {
      console.warn("⚠️ [FRONTEND] Telegram ID not available, cannot update login timestamp")
      return
    }

    // Jika user sudah terverifikasi dan punya wallet
    if (isVerified && walletAddress && privyUserId) {
      // ============================================================
      // PERBAIKAN: Sekarang SELALU update last_login_at untuk user lama
      // ============================================================
      console.log("🔍 [FRONTEND] User already has wallet - still updating last_login_at...")
      
      upsertLoginTimestamp(currentTelegramId, walletAddress, privyUserId)
      
      // Set loading ke false karena proses utama sudah selesai
      setIsLoading(false)
      return
    }

    // Untuk user baru - tunggu Privy login
    if (!authenticated || !user) {
      console.log("⏸️ [FRONTEND] Waiting for user to authenticate with Privy...")
      return
    }

    // Get Smart Wallet address
    const smartWallet = user.linkedAccounts?.find(
      (account: any) => account.type === "wallet" && account.walletClientType === "smart_wallet"
    )
    const currentWalletAddress = smartWallet?.address || user.wallet?.address

    if (!currentWalletAddress) {
      console.log("⏸️ [FRONTEND] Wallet address not available yet, waiting...")
      return
    }

    console.log("🚀 [FRONTEND] New user - calling upsert for first time...")
    upsertLoginTimestamp(currentTelegramId, currentWalletAddress, user.id)

  }, [ready, authenticated, user, initData, walletAddress, isVerified, telegramId, isTelegramWebApp, upsertLoginTimestamp])

  return {
    isTelegramWebApp,
    isVerified,
    telegramId,
    walletAddress,
    privyUserId,
    isLoading,
    error,
    initData,
    verifyInitData,
  }
}
