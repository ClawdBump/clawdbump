"use client"

import { useFarcasterMiniApp } from "@/components/miniapp-provider"
import { usePrivy } from "@privy-io/react-auth"
import { useLoginToMiniApp } from "@privy-io/react-auth/farcaster"
import { useEffect, useState } from "react"

interface FarcasterUser {
  fid?: number
  username?: string
  displayName?: string
  pfp?: {
    url?: string
  }
}

export function useFarcasterAuth() {
  const { context, isReady, isInWarpcast } = useFarcasterMiniApp()
  const { ready, authenticated, user } = usePrivy()
  const { initLoginToMiniApp, loginToMiniApp } = useLoginToMiniApp()
  const [farcasterUser, setFarcasterUser] = useState<FarcasterUser | null>(null)

  useEffect(() => {
    if (isReady && context && isInWarpcast) {
      // Extract Farcaster user data from context
      const userData: FarcasterUser = {
        fid: context.user?.fid,
        username: context.user?.username,
        displayName: context.user?.displayName,
        pfp: context.user?.pfp,
      }
      setFarcasterUser(userData)
    }
  }, [context, isReady, isInWarpcast])

  // ❌ Auto-login removed - User must click Connect button to login

  return {
    // Farcaster context
    farcasterContext: context,
    isInWarpcast,
    farcasterUser,
    
    // Privy auth
    isAuthenticated: authenticated,
    privyUser: user,
    privyReady: ready,
    
    // Farcaster Mini App login functions
    initLoginToMiniApp, // Initialize login to get nonce
    loginToMiniApp, // Complete login with message and signature
    
    // Combined state
    isLoading: !isReady || !ready,
    user: authenticated ? user : null,
  }
}
