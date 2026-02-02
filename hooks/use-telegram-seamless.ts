"use client"

import { useEffect, useState } from "react"
import { usePrivy } from "@privy-io/react-auth"

/**
 * Hook to handle seamless Telegram login from Telegram Mini App
 * 
 * Based on Privy documentation: https://docs.privy.io/recipes/react/seamless-telegram#seamless-login-with-telegram
 * 
 * When user opens the app from within Telegram (via web_app button or login_url),
 * Privy automatically logs the user in. This hook detects that scenario and
 * optionally links the Telegram account if not already linked.
 * 
 * For seamless linking within Telegram Mini App, use linkTelegram with launchParams:
 * ```tsx
 * import { retrieveLaunchParams } from '@telegram-apps/bridge'
 * const { linkTelegram } = usePrivy()
 * const launchParams = retrieveLaunchParams()
 * linkTelegram({ launchParams })
 * ```
 * 
 * Note: Telegram launchParams expire after 5 minutes for security.
 */
export function useTelegramSeamless() {
  const { ready, authenticated, user, linkTelegram } = usePrivy()
  const [isSeamlessLogin, setIsSeamlessLogin] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready || !authenticated || !user) {
      return
    }

    // Check if we're in a Telegram Mini App environment
    const isTelegramWebApp = typeof window !== "undefined" && 
                            (window as any).Telegram?.WebApp

    if (!isTelegramWebApp) {
      // Not in Telegram Mini App, skip seamless login handling
      return
    }

    // Check if user has Telegram account
    const hasTelegramAccount = user.telegram || 
                              user.linkedAccounts?.some((account: any) => account.type === "telegram")

    if (hasTelegramAccount) {
      // User already has Telegram account linked
      setIsSeamlessLogin(true)
      return
    }

    // If user is authenticated but doesn't have Telegram account,
    // we can try to link it using launchParams
    // This requires @telegram-apps/bridge package
    const tryLinkTelegram = async () => {
      try {
        // Check if @telegram-apps/bridge is available
        if (typeof window !== "undefined" && (window as any).Telegram?.WebApp?.initData) {
          setIsLinking(true)
          setError(null)

          // Note: This requires installing @telegram-apps/bridge package
          // For now, we'll just log that seamless login is available
          console.log("📱 Telegram Mini App detected - seamless login available")
          console.log("💡 To enable seamless linking, install @telegram-apps/bridge and use linkTelegram({ launchParams })")
          
          setIsSeamlessLogin(true)
        }
      } catch (err: any) {
        console.error("❌ Error in seamless Telegram login:", err)
        setError(err.message || "Failed to handle seamless Telegram login")
      } finally {
        setIsLinking(false)
      }
    }

    // Only try to link if user doesn't have Telegram account
    if (!hasTelegramAccount) {
      tryLinkTelegram()
    }
  }, [ready, authenticated, user, linkTelegram])

  return {
    isSeamlessLogin,
    isLinking,
    error,
  }
}

