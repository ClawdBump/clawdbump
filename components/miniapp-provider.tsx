"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { sdk } from "@farcaster/miniapp-sdk"

interface FarcasterMiniAppContextType {
  context: any
  isReady: boolean
  isInWarpcast: boolean
}

const FarcasterMiniAppContext = createContext<FarcasterMiniAppContextType>({
  context: null,
  isReady: false,
  isInWarpcast: false,
})

export function useFarcasterMiniApp() {
  return useContext(FarcasterMiniAppContext)
}

interface MiniAppProviderProps {
  children: ReactNode
}

export function MiniAppProvider({ children }: MiniAppProviderProps) {
  const [context, setContext] = useState<any>(null)
  const [isReady, setIsReady] = useState(false)
  const [isInWarpcast, setIsInWarpcast] = useState(false)

  useEffect(() => {
    // Check if running in Warpcast and initialize SDK
    const initializeSDK = async () => {
      if (typeof window === "undefined") return

      try {
        // Try to get context - if this succeeds, we're in Warpcast
        // sdk.context is a Promise, await it directly
        const ctx = await (sdk.context as unknown as Promise<any>)
        
        console.log("✅ Farcaster Mini App: Context loaded", ctx)
        
        // We're in Warpcast
        setIsInWarpcast(true)
        setContext(ctx)
        setIsReady(true)
        
        // Note: sdk.actions.ready() is called in page.tsx after component mounts
        // This ensures the splash screen is hidden at the right time
      } catch (error) {
        // Not in Warpcast or SDK not available
        // Still allow app to run outside Warpcast
        console.log("⚠️ Farcaster Mini App: Not running in Warpcast or SDK not available:", error)
        setIsInWarpcast(false)
        setIsReady(true)
      }
    }

    // Initialize after component mounts
    initializeSDK()
  }, [])

  return (
    <FarcasterMiniAppContext.Provider
      value={{
        context,
        isReady,
        isInWarpcast,
      }}
    >
      {children}
    </FarcasterMiniAppContext.Provider>
  )
}
