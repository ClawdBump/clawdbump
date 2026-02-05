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
import { useAccount, usePublicClient } from "wagmi"
import { isAddress } from "viem"
import { useCreditBalance } from "@/hooks/use-credit-balance"
import { useBotSession } from "@/hooks/use-bot-session"
import { useDistributeCredits } from "@/hooks/use-distribute-credits"
import { toast } from "sonner"

export default function BumpBotDashboard() {
  const { ready: privyReady, user, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient } = useSmartWallets()
  
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
  const [activeTab, setActiveTab] = useState("control")
  const [isMounted, setIsMounted] = useState(false)

  const { session, isLoading: isLoadingSession, startSession, stopSession } = useBotSession(privySmartWalletAddress)
  const { data: creditData, refetch: refetchCredit } = useCreditBalance(privySmartWalletAddress, { enabled: !!privySmartWalletAddress })
  const { distributeCredits } = useDistributeCredits()

  useEffect(() => { setIsMounted(true) }, [])

  // Sinkronisasi Smart Wallet Address [cite: 14, 15]
  useEffect(() => {
    const sw = wallets.find((w) => (w as any).type === 'smart_wallet' || w.walletClientType === 'smart_wallet')
    setPrivySmartWalletAddress(smartWalletClient?.account?.address || sw?.address || null)
  }, [wallets, smartWalletClient])

  // Sinkronisasi status isActive dengan Database [cite: 66, 67]
  useEffect(() => {
    if (!isLoadingSession) {
      const isRunning = session?.status === "running"
      setIsActive(isRunning)
      if (isRunning && session) {
        if (session.token_address) setTargetTokenAddress(session.token_address)
        if (session.amount_usd) setBuyAmountUsd(session.amount_usd)
        if (session.interval_seconds) setIntervalSeconds(session.interval_seconds)
      }
    }
  }, [session, isLoadingSession])

  // Fungsi Internal: Generate atau Get 5 Bot Wallets [cite: 31, 32]
  const ensureBotWallets = async (userAddress: string) => {
    const response = await fetch("/api/bot/get-or-create-wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddress: userAddress.toLowerCase() }),
    })
    const data = await response.json()
    if (!response.ok || !data.wallets || data.wallets.length !== 5) {
      throw new Error("Failed to prepare 5 bot wallets")
    }
    return data.wallets
  }

  // Logic Utama: Start Bumping [cite: 37, 52, 59]
  const handleToggle = useCallback(async () => {
    if (!isActive) {
      if (!isTokenVerified || !targetTokenAddress) return toast.error("Please verify token first") [cite: 37]
      const amountUsdValue = parseFloat(buyAmountUsd)
      if (isNaN(amountUsdValue) || amountUsdValue <= 0) return toast.error("Invalid amount") [cite: 38]

      try {
        setBumpLoadingState("Checking Wallets...")
        // 1. Pastikan 5 bot wallet sudah ada 
        const walletsList = await ensureBotWallets(privySmartWalletAddress!)
        setExistingBotWallets(walletsList)

        // 2. Cek Balance tiap bot & Distribusi jika perlu [cite: 43, 47, 52]
        setBumpLoadingState("Checking Balances...")
        const priceRes = await fetch("/api/eth-price")
        const priceData = await priceRes.json()
        const currentEthPrice = priceData.price || 3000
        const requiredWeiPerBot = BigInt(Math.floor((amountUsdValue / currentEthPrice) * 1e18))

        let needsDistribution = false
        for (const bot of walletsList) {
          const balRes = await fetch("/api/bot/wallet-weth-balance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userAddress: privySmartWalletAddress, botWalletAddress: bot.smartWalletAddress }),
          })
          const balData = await balRes.json()
          if (BigInt(balData.wethBalanceWei || "0") < requiredWeiPerBot) {
            needsDistribution = true
            break
          }
        }

        if (needsDistribution) {
          setBumpLoadingState("Distributing Credits...")
          const mainCreditWei = creditData?.balanceWei ? BigInt(creditData.balanceWei) : BigInt(0)
          if (mainCreditWei === BigInt(0)) throw new Error("Insufficient main credit for distribution") [cite: 58]

          await distributeCredits({
            userAddress: privySmartWalletAddress as `0x${string}`,
            botWallets: walletsList,
            creditBalanceWei: mainCreditWei,
          })
          await new Promise(r => setTimeout(r, 2000))
        }

        // 3. Start Session [cite: 59]
        setBumpLoadingState("Launching Bot...")
        await startSession({
          userAddress: privySmartWalletAddress!,
          tokenAddress: targetTokenAddress as `0x${string}`,
          amountUsd: buyAmountUsd,
          intervalSeconds: intervalSeconds,
        })
        
        // Trigger backend loop [cite: 60]
        fetch("/api/bot/continuous-swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: privySmartWalletAddress }),
        })

        toast.success("Bumping Started!")
        setActiveTab("activity")
      } catch (e: any) {
        toast.error(e.message || "Failed to start")
      } finally { setBumpLoadingState(null) }
    } else {
      // Stop Bumping [cite: 63, 64]
      try {
        setBumpLoadingState("Stopping...")
        await stopSession()
        setIsActive(false)
        toast.success("Bumping Stopped")
      } catch (e) {
        toast.error("Failed to stop")
      } finally { setBumpLoadingState(null) }
    }
  }, [isActive, isTokenVerified, targetTokenAddress, buyAmountUsd, intervalSeconds, privySmartWalletAddress, creditData, distributeCredits, startSession, stopSession])

  if (!isMounted) return null

  return (
    <div className="min-h-screen bg-background p-4 pb-safe">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16">
                <Image src="/clawdbump-logo.png" alt="Logo" fill className="object-contain" />
              </div>
              <div>
                <h1 className="font-mono text-base font-semibold">ClawdBump</h1>
                <p className="text-xs text-muted-foreground">Built to Trend</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
               <div className={`h-2 w-2 rounded-full ${isActive ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
               <span className="text-xs font-mono">{isActive ? "LIVE" : "IDLE"}</span>
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
            {/* Input Lock saat isActive = true  */}
            <TokenInput 
              initialAddress={targetTokenAddress}
              disabled={isActive || !!bumpLoadingState}
              onAddressChange={setTargetTokenAddress}
              onVerifiedChange={(v, m) => { setIsTokenVerified(v); setTokenMetadata(m); }}
            />
            <ConfigPanel 
              credits={credits} 
              smartWalletAddress={privySmartWalletAddress}
              buyAmountUsd={buyAmountUsd}
              onBuyAmountChange={setBuyAmountUsd}
              intervalSeconds={intervalSeconds}
              onIntervalChange={setIntervalSeconds}
              isActive={isActive || !!bumpLoadingState} 
            />
            <ActionButton 
              isActive={isActive} 
              onToggle={handleToggle}
              credits={credits}
              isVerified={isTokenVerified}
              loadingState={bumpLoadingState}
              hasBotWallets={true} // Selalu true karena handleToggle yang akan mengurus create
              overrideLabel={isActive ? "Stop Bumping" : "Start Bumping"}
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
