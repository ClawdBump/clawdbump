"use client"

import { useLoginWithTelegram } from "@privy-io/react-auth"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

/**
 * Telegram Login Button Component
 * 
 * Uses Privy's useLoginWithTelegram hook for Telegram authentication.
 * This is the correct way to implement Telegram login with Privy.
 * 
 * Based on: https://docs.privy.io/authentication/user-authentication/login-methods/telegram
 * 
 * Requirements:
 * 1. Bot token and bot handle must be configured in Privy Dashboard
 * 2. Domain must be configured in BotFather using /setdomain
 * 3. Telegram login method must be enabled in Privy Dashboard
 * 
 * Usage:
 * ```tsx
 * <TelegramLoginButton />
 * ```
 */
export function TelegramLoginButton() {
  const { login, state } = useLoginWithTelegram({
    onComplete: (params) => {
      console.log("✅ Telegram login successful:", {
        user: params.user,
        isNewUser: params.isNewUser,
        loginMethod: params.loginMethod,
      })
      // Auto-pairing will happen via useTelegramPair hook
    },
    onError: (error) => {
      console.error("❌ Telegram login failed:", error)
    },
  })

  const isLoading = state.status === "loading"
  const isError = state.status === "error"

  return (
    <Button
      onClick={login}
      disabled={isLoading}
      variant="outline"
      className="w-full"
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Connecting to Telegram...
        </>
      ) : isError ? (
        "Login Failed - Try Again"
      ) : (
        "Login with Telegram"
      )}
    </Button>
  )
}

