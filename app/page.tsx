"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { WalletCard } from "@/components/wallet-card"
import { TokenInput } from "@/components/token-input"
import { ConfigPanel } from "@/components/config-panel"
import { ActionButton } from "@/components/action-button"
import { BotLiveActivity } from "@/components/bot-live-activity"
import { PriceChart } from "@/components/price-chart"
import { ManageBot } from "@/components/manage-bot"
import { User } from "lucide-react"
import Image from "next/image"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { useAccount, usePublicClient, useWalletClient } from "wagmi"
import { isAddress } from "viem"
import { useCreditBalance } from "@/hooks/use-credit-balance"
import { useBotSession } from "@/hooks/use-bot-session"
import { useDistributeCredits } from "@/hooks/use-distribute-credits"
import { toast } from "sonner"

export default function BumpBotDashboard() {
  // --- Auth & Wallet Hooks ---
  const { ready: privyReady, user, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const { address: wagmiAddress } = useAccount()
  const publicClient = usePublicClient()
  const { client: smartWalletClient } = useSmartWallets()
  
  // --- App States ---
  const [privySmartWalletAddress, setPrivySmartWalletAddress] = useState<string | null>(null)
  const [targetTokenAddress, setTargetTokenAddress] = useState<string | null>(null)
  const [isTokenVerified, setIsTokenVerified] = useState(false)
  const [tokenMetadata, setTokenMetadata] = useState<any>(null)
  const [isActive, setIsActive] = useState<boolean>(false)
  const [buyAmountUsd, setBuyAmountUsd] = useState("0.01")
  const [intervalSeconds, setIntervalSeconds] = useState(60)
  const [bumpLoadingState, setBumpLoadingState] = useState<string | null>(null)
  const [ethPriceUsd, setEthPriceUsd] = useState<number>(3000)
  const [existingBotWallets, setExistingBotWallets] = useState<any[] | null>(null)
  const [isLoadingBotWallets, setIsLoadingBotWallets] = useState(false)
  const [activeTab, setActiveTab] = useState("control")
  const [isMounted, setIsMounted] = useState(false)

  const hasRestoredStateRef = useRef(false)

  // --- Bot Session Hook (Single Source of Truth) ---
  const { 
    session, 
    isLoading: isLoadingSession, 
    startSession, 
    stopSession,
    refetch: refetchSession,
  } = useBotSession(privySmartWalletAddress)

  useEffect(() => { setIsMounted(true) }, [])

  // 1. SINKRONISASI STATUS: Ikuti database, abaikan localStorage untuk 'isActive'
  useEffect(() => {
    if (!isLoadingSession) {
      const isRunning = session?.status === "running"
      setIsActive(isRunning)
      
      // Jika bot sedang jalan, kunci input agar sesuai dengan session di database
      if (isRunning && session) {
        if (session.token_address) setTargetTokenAddress(session.token_address)
        if (session.amount_usd) setBuyAmountUsd(session.amount_usd)
        if (session.interval_seconds) setIntervalSeconds(session.interval_seconds)
      }
    }
  }, [session, isLoadingSession])

  // 2. RESTORE: Hanya untuk kenyamanan input (Amount, Interval, Token)
  useEffect(() => {
    if (typeof window === "undefined" || !privySmartWalletAddress || hasRestoredStateRef.current) return
    
    try {
      const storedAddress = localStorage.getItem(`targetTokenAddress_${privySmartWalletAddress}`)
      if (storedAddress) setTargetTokenAddress(storedAddress)
      
      const storedBuyAmount = localStorage.getItem(`buyAmountUsd_${privySmartWalletAddress}`)
      if (storedBuyAmount) setBuyAmountUsd(storedBuyAmount)
      
      const storedInterval = localStorage.getItem(`intervalSeconds_${privySmartWalletAddress}`)
      if (storedInterval) setIntervalSeconds(parseInt(storedInterval, 10))
      
      hasRestoredStateRef.current = true
    } catch (e) { console.error("Restore error:", e) }
  }, [privySmartWalletAddress])

  // 3. SAVE: Simpan input teks saja
  useEffect(() => {
    if (!privySmartWalletAddress) return
    localStorage.setItem(`buyAmountUsd_${privySmartWalletAddress}`, buyAmountUsd)
    localStorage.setItem(`intervalSeconds_${privySmartWalletAddress}`, intervalSeconds.toString())
    if (targetTokenAddress) {
      localStorage.setItem(`targetTokenAddress_${privySmartWalletAddress}`, targetTokenAddress)
    }
  }, [buyAmountUsd, intervalSeconds, targetTokenAddress, privySmartWalletAddress])

  // --- Wallet Detection Logic ---
  const { data: creditData, refetch: refetchCredit } = useCreditBalance(privySmartWalletAddress, {
    enabled: !!privySmartWalletAddress,
  })
  const credits = creditData?.balanceUsd || 0
  const { distributeCredits } = useDistributeCredits()
  
  useEffect(() => {
    const smartWallet = wallets.find((w) => (w as any).type === 'smart_wallet' || w.walletClientType === 'smart_wallet')
    const detectedAddress = smartWalletClient?.account?.address || smartWallet?.address || null
    setPrivySmartWalletAddress(detectedAddress)
  }, [wallets, smartWalletClient])

  // --- Main Action Handler ---
  const handleToggle = useCallback(async () => {
    if (!isActive) {
      if (!isTokenVerified || !targetTokenAddress) return toast.error("Please verify token first")
      
      try {
        setBumpLoadingState("Starting...")
        await startSession({
          userAddress: privySmartWalletAddress!,
          tokenAddress: targetTokenAddress as `0x${string}`,
          amountUsd: buyAmountUsd,
          intervalSeconds: intervalSeconds,
        })
        
        fetch("/api/bot/continuous-swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: privySmartWalletAddress }),
        })

        toast.success("Bot started!")
        setActiveTab("activity")
      } catch (error: any) {
        toast.error(error.message || "Failed to start")
      } finally { setBumpLoadingState(null) }
    } else {
      try {
        setBumpLoadingState("Stopping...")
        await stopSession()
        toast.success("Bot stopped")
      } catch (error: any) {
        toast.error("Failed to stop session. Please try again.")
      } finally { setBumpLoadingState(null) }
    }
  }, [isActive, isTokenVerified, targetTokenAddress, buyAmountUsd, intervalSeconds, startSession, stopSession, privySmartWalletAddress])

  // --- Telegram Metadata ---
  const telegramAccount = user?.linkedAccounts?.find((account: any) => account.type === 'telegram')
  const username = (telegramAccount as any)?.username ? `@${(telegramAccount as any).username}` : (telegramAccount as any)?.first_name || "User"
  const userAvatar = (telegramAccount as any)?.photo_url || null

  const isConnected = authenticated && !!privySmartWalletAddress

  if (!isMounted) return null

  return (
    <div className="min-h-screen bg-background p-4 pb-safe">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16 rounded-lg overflow-hidden">
                <Image src="/clawdbump-logo.png" alt="Logo" fill className="object-contain" />
              </div>
              <div>
                <h1 className="font-mono text-base font-semibold text-foreground">ClawdBump</h1>
                <p className="text-xs text-muted-foreground">Built to Trend</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
               <div className={`h-2 w-2 rounded-full ${isActive ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
               <span className="text-xs font-mono">{isActive ? "LIVE" : "IDLE"}</span>
               {isConnected && (
                 <div className="flex items-center gap-2 border border-border bg-card/50 px-2 py-1 rounded-lg">
                    {userAvatar && <img src={userAvatar} className="h-5 w-5 rounded-full" />}
                    <span className="text-xs truncate max-w-[80px]">{username}</span>
                 </div>
               )}
            </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3 bg-card border border-border">
            <TabsTrigger value="control">Control Panel</TabsTrigger>
            <TabsTrigger value="activity">Live Activity</TabsTrigger>
            <TabsTrigger value="manage">Manage Bot</TabsTrigger>
          </TabsList>

          <TabsContent value="control" className="space-y-4 mt-4">
            <PriceChart tokenAddress={targetTokenAddress} />
            <WalletCard 
              credits={credits} 
              walletAddress={privySmartWalletAddress}
              isSmartAccountActive={!!privySmartWalletAddress}
              ethPriceUsd={ethPriceUsd}
            />
            <TokenInput 
              initialAddress={targetTokenAddress}
              disabled={isActive}
              onAddressChange={setTargetTokenAddress}
              onVerifiedChange={(isVerified, metadata) => {
                setIsTokenVerified(isVerified)
                setTokenMetadata(metadata)
              }}
            />
            <ConfigPanel 
              credits={credits} 
              smartWalletAddress={privySmartWalletAddress}
              buyAmountUsd={buyAmountUsd}
              onBuyAmountChange={setBuyAmountUsd}
              intervalSeconds={intervalSeconds}
              onIntervalChange={setIntervalSeconds}
              isActive={isActive}
            />
            <ActionButton 
              isActive={isActive} 
              onToggle={handleToggle}
              credits={credits}
              isVerified={isTokenVerified}
              loadingState={bumpLoadingState || (isLoadingSession ? "Syncing..." : null)}
            />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <BotLiveActivity userAddress={privySmartWalletAddress} enabled={!!privySmartWalletAddress} />
          </TabsContent>

          <TabsContent value="manage" className="mt-4">
            <ManageBot userAddress={privySmartWalletAddress} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
        }
