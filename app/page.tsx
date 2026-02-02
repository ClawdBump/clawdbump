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
import { isAddress, formatEther } from "viem"
import { useCreditBalance } from "@/hooks/use-credit-balance"
import { useBotSession } from "@/hooks/use-bot-session"
import { useDistributeCredits } from "@/hooks/use-distribute-credits"
import { toast } from "sonner"

export default function BumpBotDashboard() {
  const { ready: privyReady, user, authenticated, login, createWallet } = usePrivy()
  const { wallets } = useWallets()
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount()
  
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { client: smartWalletClient } = useSmartWallets()
  
  const verifySmartWalletContract = useCallback(async (address: string): Promise<boolean> => {
    if (!publicClient || !isAddress(address)) {
      return false
    }
    
    try {
      const code = await publicClient.getBytecode({ address: address as `0x${string}` })
      const isContract = !!(code && code !== "0x" && code.length > 2)
      return isContract
    } catch (error) {
      console.error("Error verifying smart wallet contract:", error)
      return false
    }
  }, [publicClient])
  
  const [privySmartWalletAddress, setPrivySmartWalletAddress] = useState<string | null>(null)
  const [smartWallet, setSmartWallet] = useState<any>(null)
  const [isCreatingSmartWallet, setIsCreatingSmartWallet] = useState(false)
  
  const [targetTokenAddress, setTargetTokenAddress] = useState<string | null>(null)
  const [isTokenVerified, setIsTokenVerified] = useState(false)
  const [tokenMetadata, setTokenMetadata] = useState<{ name: string; symbol: string; decimals: number } | null>(null)
  
  const [isActive, setIsActive] = useState<boolean>(false)
  
  const hasRestoredStateRef = useRef(false)
  const hasRestoredFromSessionRef = useRef(false)
  
  const [buyAmountUsd, setBuyAmountUsd] = useState("0.01")
  const [intervalSeconds, setIntervalSeconds] = useState(60)
  
  useEffect(() => {
    if (typeof window !== "undefined" && privySmartWalletAddress) {
      if (isActive) {
        localStorage.setItem(`isBumping_${privySmartWalletAddress}`, "true")
      }
    }
  }, [isActive, privySmartWalletAddress])

  useEffect(() => {
    if (typeof window !== "undefined" && privySmartWalletAddress) {
      if (targetTokenAddress) {
        localStorage.setItem(`targetTokenAddress_${privySmartWalletAddress}`, targetTokenAddress)
      }
    }
  }, [targetTokenAddress, privySmartWalletAddress])
  
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!privySmartWalletAddress) return
    if (hasRestoredStateRef.current) return
    
    try {
      const storedIsBumping = window.localStorage.getItem(`isBumping_${privySmartWalletAddress}`)
      if (storedIsBumping === "true") {
        setIsActive(true)
      }
      
      const storedAddress = window.localStorage.getItem(`targetTokenAddress_${privySmartWalletAddress}`)
      if (storedAddress) {
        setTargetTokenAddress(storedAddress)
        
        const storedMetadata = window.localStorage.getItem(`targetTokenMetadata_${privySmartWalletAddress}`)
        if (storedMetadata) {
          try {
            const metadata = JSON.parse(storedMetadata)
            setTokenMetadata(metadata)
            setIsTokenVerified(true)
          } catch (e) {
            console.error("Error parsing stored metadata:", e)
          }
        }
      }
      
      const storedBuyAmount = window.localStorage.getItem(`buyAmountUsd_${privySmartWalletAddress}`)
      if (storedBuyAmount) {
        setBuyAmountUsd(storedBuyAmount)
      }
      
      const storedInterval = window.localStorage.getItem(`intervalSeconds_${privySmartWalletAddress}`)
      if (storedInterval) {
        const intervalValue = parseInt(storedInterval, 10)
        if (!isNaN(intervalValue) && intervalValue >= 2 && intervalValue <= 600) {
          setIntervalSeconds(intervalValue)
        }
      }
      
      hasRestoredStateRef.current = true
    } catch (error) {
      console.error("Error restoring state from localStorage:", error)
      hasRestoredStateRef.current = true
    }
  }, [privySmartWalletAddress])
  
  useEffect(() => {
    if (typeof window !== "undefined" && privySmartWalletAddress && tokenMetadata) {
      localStorage.setItem(`targetTokenMetadata_${privySmartWalletAddress}`, JSON.stringify(tokenMetadata))
    }
  }, [tokenMetadata, privySmartWalletAddress])
  
  useEffect(() => {
    if (typeof window !== "undefined" && privySmartWalletAddress) {
      localStorage.setItem(`buyAmountUsd_${privySmartWalletAddress}`, buyAmountUsd)
    }
  }, [buyAmountUsd, privySmartWalletAddress])
  
  useEffect(() => {
    if (typeof window !== "undefined" && privySmartWalletAddress) {
      localStorage.setItem(`intervalSeconds_${privySmartWalletAddress}`, intervalSeconds.toString())
    }
  }, [intervalSeconds, privySmartWalletAddress])
  
  const embeddedWallet = useMemo(() => {
    return privyReady 
      ? wallets.find((w) => w.walletClientType === 'privy')
      : null
  }, [privyReady, wallets])
  
  const smartWallets = useMemo(() => {
    return privyReady 
      ? wallets.filter((w) => (w as any).type === 'smart_wallet' || w.walletClientType === 'smart_wallet')
      : []
  }, [privyReady, wallets])
  
  const smartWalletClientAddress = useMemo(() => {
    return smartWalletClient?.account?.address as string | undefined
  }, [smartWalletClient?.account?.address])
  
  const embeddedWalletAddress = useMemo(() => {
    return embeddedWallet?.address
  }, [embeddedWallet?.address])
  
  // Smart Wallet Detection
  useEffect(() => {
    if (!privyReady) {
      setPrivySmartWalletAddress(null)
      setSmartWallet(null)
      return
    }
    
    const detectedSmartWallet = smartWallets[0] || null
    const clientAddress = smartWalletClientAddress
    const detectedAddress = clientAddress || detectedSmartWallet?.address || null
    
    if (detectedAddress) {
      verifySmartWalletContract(detectedAddress).then((isContract) => {
        if (isContract) {
          setSmartWallet(detectedSmartWallet)
          setPrivySmartWalletAddress(detectedAddress)
        } else {
          if (clientAddress) {
            setSmartWallet(detectedSmartWallet)
            setPrivySmartWalletAddress(detectedAddress)
          } else {
            setSmartWallet(null)
            setPrivySmartWalletAddress(null)
          }
        }
      }).catch(() => {
        if (clientAddress) {
          setSmartWallet(detectedSmartWallet)
          setPrivySmartWalletAddress(detectedAddress)
        } else {
          setSmartWallet(null)
          setPrivySmartWalletAddress(null)
        }
      })
    } else {
      setSmartWallet(null)
      setPrivySmartWalletAddress(null)
    }
  }, [privyReady, authenticated, wallets, smartWalletClientAddress, user?.id, embeddedWalletAddress, wagmiAddress, smartWallets.length, verifySmartWalletContract])
  
  const [isConnecting, setIsConnecting] = useState(false)
  const [fuelBalance] = useState(1250.5)
  const [activeTab, setActiveTab] = useState("control")
  const [bumpLoadingState, setBumpLoadingState] = useState<string | null>(null)
  const [botWallets, setBotWallets] = useState<Array<{ smartWalletAddress: string; index: number }> | null>(null)
  
  const { data: creditData, isLoading: isLoadingCredit, refetch: refetchCredit } = useCreditBalance(privySmartWalletAddress, {
    enabled: !!privySmartWalletAddress,
  })
  const credits = creditData?.balanceUsd || 0
  const hasCredit = creditData?.balanceWei ? BigInt(creditData.balanceWei) > BigInt(0) : false
  
  // Bot session hook
  const { 
    session, 
    isLoading: isLoadingSession, 
    startSession, 
    stopSession,
    refetch: refetchSession,
  } = useBotSession(privySmartWalletAddress)
  
  // Bot wallets state
  const [existingBotWallets, setExistingBotWallets] = useState<Array<{ smartWalletAddress: string; index: number }> | null>(null)
  const [isLoadingBotWallets, setIsLoadingBotWallets] = useState(false)
  const hasBotWallets = existingBotWallets && existingBotWallets.length === 5
  const [isMounted, setIsMounted] = useState(false)
  
  useEffect(() => {
    setIsMounted(true)
  }, [])
  
  // Fetch existing bot wallets
  useEffect(() => {
    const fetchExistingWallets = async () => {
      if (!privySmartWalletAddress || !hasCredit) return
      
      try {
        const normalizedUserAddress = privySmartWalletAddress.toLowerCase()
        const response = await fetch("/api/bot/get-or-create-wallets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: normalizedUserAddress, checkOnly: true }),
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.wallets && data.wallets.length === 5) {
            setExistingBotWallets(data.wallets)
          }
        }
      } catch (error) {
        console.error("Error fetching existing bot wallets:", error)
      }
    }
    
    fetchExistingWallets()
  }, [privySmartWalletAddress, hasCredit])
  
  // Distribute credits hook
  const { distributeCredits, isPending: isDistributing } = useDistributeCredits()
  
  // Get Telegram account from user
  const telegramAccount = user?.linkedAccounts?.find((account: any) => account.type === 'telegram')
  
  // Debug: Log the full telegramAccount object to see field names
  useEffect(() => {
    if (telegramAccount) {
      console.log("[v0] Telegram account object from Privy:", JSON.stringify(telegramAccount, null, 2))
    }
  }, [telegramAccount])

  // Extract telegram ID - Privy uses telegramUserId (camelCase)
  const telegramId = telegramAccount 
    ? ((telegramAccount as any).telegramUserId || 
       (telegramAccount as any).telegram_user_id || 
       (telegramAccount as any).id ||
       (telegramAccount as any).subject ||
       null)
    : null

  const telegramUsername = telegramAccount 
    ? ((telegramAccount as any).username 
        ? `@${(telegramAccount as any).username}` 
        : (telegramAccount as any).firstName || (telegramAccount as any).first_name || null)
    : null

  const telegramPhotoUrl = telegramAccount 
    ? ((telegramAccount as any).photoUrl || (telegramAccount as any).photo_url || null)
    : null

  const username = telegramUsername || null
  const userAvatar = telegramPhotoUrl || null

  // Track if we've synced Telegram user to database
  const hasSyncedTelegramRef = useRef(false)

  // Sync Telegram user data to database when user logs in with Telegram
  useEffect(() => {
    const syncTelegramToDatabase = async () => {
      // Skip if already synced, or missing required data
      if (hasSyncedTelegramRef.current) return
      if (!authenticated || !privySmartWalletAddress || !telegramId || !user?.id) return
      
      try {
        console.log("[v0] Syncing Telegram user to database...", {
          telegram_id: telegramId,
          smart_account_address: privySmartWalletAddress,
          privy_did: user.id,
        })

        const response = await fetch("/api/v1/auth/telegram/upsert-wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            telegram_id: String(telegramId),
            wallet_address: privySmartWalletAddress.toLowerCase(),
            privy_user_id: user.id,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          console.log("[v0] Telegram user synced to database successfully:", data)
          hasSyncedTelegramRef.current = true
        } else {
          const errorData = await response.json()
          console.error("[v0] Failed to sync Telegram user to database:", errorData)
        }
      } catch (error) {
        console.error("[v0] Error syncing Telegram user to database:", error)
      }
    }

    syncTelegramToDatabase()
  }, [authenticated, privySmartWalletAddress, telegramId, user?.id])

  const isWalletReady = !!privySmartWalletAddress
  const isConnected = authenticated && isWalletReady
  const isInitializing = authenticated && !isWalletReady

  const handleConnect = useCallback(async () => {
    setIsConnecting(true)
    try {
      login()
    } catch (error: any) {
      console.error("Connect failed:", error)
      setIsConnecting(false)
    }
  }, [login])

  const handleActivateSmartAccount = useCallback(async () => {
    if (!authenticated || !privyReady) {
      return
    }

    if (!smartWalletClient) {
      return
    }

    if (!embeddedWallet) {
      return
    }

    setIsCreatingSmartWallet(true)
    try {
      const smartWalletAddress = smartWalletClient.account.address
      const isContract = await verifySmartWalletContract(smartWalletAddress)
      
      if (isContract) {
        console.log("Smart Wallet contract is already deployed")
      } else {
        console.log("Smart Wallet contract not deployed yet (lazy deployment)")
      }
    } catch (error) {
      console.error("Failed to activate Smart Account:", error)
    } finally {
      setIsCreatingSmartWallet(false)
    }
  }, [authenticated, privyReady, smartWalletClient, embeddedWallet, verifySmartWalletContract])

  // Handle login completion
  useEffect(() => {
    if (authenticated && privySmartWalletAddress) {
      setIsConnecting(false)
    } else if (authenticated && !privySmartWalletAddress && privyReady && !isCreatingSmartWallet) {
      if (embeddedWallet && smartWalletClient) {
        setIsConnecting(false)
      }
    }
  }, [authenticated, privySmartWalletAddress, privyReady, isCreatingSmartWallet, embeddedWalletAddress, smartWalletClientAddress])
  
  const handleGenerateBotWallets = useCallback(async () => {
    if (!privySmartWalletAddress || !isAddress(privySmartWalletAddress)) {
      toast.error("Smart wallet not ready")
      return
    }
    
    if (!hasCredit) {
      toast.error("No credit detected. Please deposit ETH or WETH to your Smart Wallet.")
      return
    }
    
    try {
      setIsLoadingBotWallets(true)
      setBumpLoadingState("Generating Bot Wallets...")
      
      const normalizedUserAddress = privySmartWalletAddress.toLowerCase()
      
      const walletsResponse = await fetch("/api/bot/get-or-create-wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: normalizedUserAddress }),
      })
      
      if (!walletsResponse.ok) {
        const errorData = await walletsResponse.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to generate bot wallets")
      }
      
      const walletsData = await walletsResponse.json()
      const wallets = walletsData?.wallets as Array<{ smartWalletAddress: string; index: number }> | undefined
      
      if (!wallets || wallets.length !== 5) {
        throw new Error(`Expected 5 bot wallets, but got ${wallets?.length || 0}`)
      }
      
      const validWallets = wallets.filter(w => w?.smartWalletAddress && typeof w.smartWalletAddress === 'string')
      if (validWallets.length !== 5) {
        throw new Error(`Invalid wallet data: expected 5 valid wallets, got ${validWallets.length}`)
      }
      
      if (isMounted) {
        setExistingBotWallets(validWallets)
        setBotWallets(validWallets)
      }
      
      if (refetchSession) {
        setTimeout(() => { refetchSession() }, 1000)
      }
      
      setBumpLoadingState(null)
      setIsLoadingBotWallets(false)
      
      if (walletsData.created) {
        toast.success("5 bot wallets created successfully! You can now start bumping.")
      } else {
        toast.success("Bot wallets ready!")
      }
    } catch (error: any) {
      console.error("Failed to generate bot wallets:", error)
      setBumpLoadingState(null)
      setIsLoadingBotWallets(false)
      toast.error(error.message || "Failed to generate bot wallets")
    }
  }, [privySmartWalletAddress, hasCredit, isMounted, refetchSession])
  
  const handleToggle = useCallback(async () => {
    if (!isActive) {
      if (!isTokenVerified || !targetTokenAddress) {
        toast.error("Please verify target token address first")
        return
      }
      
      const MIN_AMOUNT_USD = 0.01
      const amountUsdValue = parseFloat(buyAmountUsd)
      
      if (!buyAmountUsd || isNaN(amountUsdValue) || amountUsdValue <= 0) {
        toast.error("Please enter a valid buy amount")
        return
      }
      
      if (amountUsdValue < MIN_AMOUNT_USD) {
        toast.error(`Minimum amount per bump is $${MIN_AMOUNT_USD.toFixed(2)} USD`)
        return
      }
      
      if (!privySmartWalletAddress || !isAddress(privySmartWalletAddress)) {
        toast.error("Smart wallet not ready")
        return
      }
      
      try {
        if (intervalSeconds < 2 || intervalSeconds > 600) {
          toast.error("Interval must be between 2 seconds and 10 minutes")
          return
        }
        
        if (credits < amountUsdValue) {
          toast.error(`Insufficient credit. Required: $${amountUsdValue.toFixed(2)}, Available: $${credits.toFixed(2)}`)
          return
        }
        
        if (!existingBotWallets || existingBotWallets.length !== 5) {
          throw new Error("Bot wallets not found. Please generate bot wallets first.")
        }
        
        setBumpLoadingState("Checking bot wallet balances...")
        
        const priceResponse = await fetch("/api/eth-price")
        const priceData = await priceResponse.json()
        if (!priceData.success || !priceData.price) {
          throw new Error("Failed to fetch ETH price")
        }
        const ethPriceUsd = priceData.price
        
        const requiredAmountEth = amountUsdValue / ethPriceUsd
        const requiredAmountWei = BigInt(Math.floor(requiredAmountEth * 1e18))
        
        let totalBotWethBalanceWei = BigInt(0)
        let sufficientWallets = 0
        
        for (const botWallet of existingBotWallets) {
          try {
            const walletBalanceResponse = await fetch("/api/bot/wallet-weth-balance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                userAddress: privySmartWalletAddress,
                botWalletAddress: botWallet.smartWalletAddress,
              }),
            })
            
            let wethBalance = BigInt(0)
            if (walletBalanceResponse.ok) {
              const walletBalanceData = await walletBalanceResponse.json()
              wethBalance = BigInt(walletBalanceData.wethBalanceWei || "0")
            }
            
            totalBotWethBalanceWei += wethBalance
            
            if (wethBalance >= requiredAmountWei) {
              sufficientWallets++
            }
          } catch (err) {
            console.error(`Error checking balance for bot wallet ${botWallet.smartWalletAddress}:`, err)
          }
        }
        
        if (sufficientWallets < 5) {
          setBumpLoadingState("Distributing credits to bot wallets...")
          
          let actualMainWalletCreditWei = BigInt(0)
          
          try {
            const balanceResponse = await fetch("/api/credit-balance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userAddress: privySmartWalletAddress }),
            })
            
            if (balanceResponse.ok) {
              const balanceData = await balanceResponse.json()
              actualMainWalletCreditWei = BigInt(balanceData.balanceWei || "0")
            } else {
              actualMainWalletCreditWei = creditData?.balanceWei ? BigInt(creditData.balanceWei) : BigInt(0)
            }
          } catch {
            actualMainWalletCreditWei = creditData?.balanceWei ? BigInt(creditData.balanceWei) : BigInt(0)
          }
          
          if (actualMainWalletCreditWei <= BigInt(0)) {
            throw new Error("No credit available in main wallet. Please deposit ETH or WETH first.")
          }
          
          await distributeCredits({
            userAddress: privySmartWalletAddress as `0x${string}`,
            botWallets: existingBotWallets,
            creditBalanceWei: actualMainWalletCreditWei,
          })
          
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
        
        setBumpLoadingState("Starting Session...")
        
        await startSession({
          userAddress: privySmartWalletAddress,
          tokenAddress: targetTokenAddress as `0x${string}`,
          amountUsd: amountUsdValue.toString(),
          intervalSeconds: intervalSeconds,
        })
        
        setBumpLoadingState("Starting Continuous Swap Loop...")
        
        fetch("/api/bot/continuous-swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: privySmartWalletAddress }),
        }).catch(err => {
          console.error("Error triggering continuous swap loop:", err)
        })
        
        setBumpLoadingState(null)
        setIsActive(true)
        if (typeof window !== "undefined" && privySmartWalletAddress) {
          localStorage.setItem(`isBumping_${privySmartWalletAddress}`, "true")
        }
        
        setActiveTab("activity")
        toast.success("Bot started successfully! Check Live Activity for updates.")
      } catch (error: any) {
        console.error("Failed to start bot:", error)
        setBumpLoadingState(null)
        toast.error(error.message || "Failed to start bot")
      }
    } else {
      try {
        setBumpLoadingState("Stopping...")
        await stopSession()
        
        if (typeof window !== "undefined" && privySmartWalletAddress) {
          localStorage.removeItem(`isBumping_${privySmartWalletAddress}`)
          localStorage.removeItem(`targetTokenAddress_${privySmartWalletAddress}`)
          localStorage.removeItem(`targetTokenMetadata_${privySmartWalletAddress}`)
        }
        setIsActive(false)
        setTargetTokenAddress(null)
        setIsTokenVerified(false)
        setTokenMetadata(null)
        
        setBumpLoadingState(null)
        toast.success("Bot session stopped")
      } catch (error: any) {
        console.error("Failed to stop bot session:", error)
        setBumpLoadingState(null)
        toast.error(error?.message || "Failed to stop bot session")
      }
    }
  }, [isActive, isTokenVerified, targetTokenAddress, buyAmountUsd, privySmartWalletAddress, intervalSeconds, credits, startSession, stopSession, existingBotWallets, hasCredit, isMounted, creditData, distributeCredits])
  
  const prevSessionStatusRef = useRef<string | undefined>(undefined)
  
  useEffect(() => {
    const currentStatus = session?.status
    
    if (prevSessionStatusRef.current !== currentStatus) {
      prevSessionStatusRef.current = currentStatus
      
      if (!session) {
        setIsActive(false)
      } else {
        const isRunning = session.status === "running"
        setIsActive(isRunning)
        if (isRunning && typeof window !== "undefined" && privySmartWalletAddress) {
          localStorage.setItem(`isBumping_${privySmartWalletAddress}`, "true")
        }
      }
    }
  }, [session?.status, privySmartWalletAddress])
  
  useEffect(() => {
    if (!session) {
      hasRestoredFromSessionRef.current = false
      return
    }
    
    if (session.status !== "running") {
      hasRestoredFromSessionRef.current = false
      return
    }
    
    if (!privySmartWalletAddress) return
    if (hasRestoredFromSessionRef.current) return
    
    if (session.amount_usd) {
      const sessionAmount = session.amount_usd
      setBuyAmountUsd((currentAmount) => {
        if (sessionAmount !== currentAmount) {
          if (typeof window !== "undefined" && privySmartWalletAddress) {
            localStorage.setItem(`buyAmountUsd_${privySmartWalletAddress}`, sessionAmount)
          }
          return sessionAmount
        }
        return currentAmount
      })
    }
    
    if (session.interval_seconds) {
      const sessionInterval = session.interval_seconds
      setIntervalSeconds((currentInterval) => {
        if (sessionInterval !== currentInterval) {
          if (typeof window !== "undefined" && privySmartWalletAddress) {
            localStorage.setItem(`intervalSeconds_${privySmartWalletAddress}`, sessionInterval.toString())
          }
          return sessionInterval
        }
        return currentInterval
      })
    }
    
    hasRestoredFromSessionRef.current = true
  }, [session?.status, session?.amount_usd, session?.interval_seconds, privySmartWalletAddress])

  return (
    <div className="min-h-screen bg-background p-4 pb-safe">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
<div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20 flex items-center justify-center rounded-lg overflow-hidden">
<Image src="/clawdbump-logo.png" alt="ClawdBump Logo" fill className="object-contain" />
</div>
              <div>
                <h1 className="font-mono text-base font-semibold tracking-tight text-foreground sm:text-lg">ClawdBump</h1>
                <p className="text-xs text-muted-foreground">Built to Trend</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="hidden text-xs font-medium text-foreground sm:inline">
                  {isActive ? "LIVE" : "IDLE"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(isConnected || isInitializing || isCreatingSmartWallet) && (
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    isConnected 
                      ? "bg-green-500" 
                      : "bg-primary animate-pulse"
                  }`} />
                )}
                {isConnected ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/50 backdrop-blur-sm px-2 py-1.5 h-8 max-w-[200px]">
                    <div className="relative h-5 w-5 overflow-hidden rounded-full border border-primary/20 shrink-0 bg-secondary flex items-center justify-center">
                      {userAvatar ? (
                        <Image 
                          src={userAvatar} 
                          alt="User Avatar" 
                          fill 
                          className="object-cover rounded-full"
                          unoptimized
                        />
                      ) : (
                        <User className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <span className="font-mono text-xs font-medium text-foreground truncate">{username || "Connected"}</span>
                  </div>
                ) : isInitializing ? (
                  authenticated && smartWallets.length === 0 ? (
                    <Button
                      size="sm"
                      onClick={handleActivateSmartAccount}
                      disabled={isCreatingSmartWallet || !privyReady}
                      className="h-8 px-2.5 py-1.5 bg-card/50 backdrop-blur-sm border border-border text-foreground hover:bg-card/70 font-medium text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        {isCreatingSmartWallet ? (
                          <span className="text-xs whitespace-nowrap">Loading...</span>
                        ) : (
                          <>
                            <User className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-xs whitespace-nowrap">Activate</span>
                          </>
                        )}
                      </div>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled
                      className="h-8 px-2.5 py-1.5 bg-card/50 backdrop-blur-sm border border-border text-foreground font-medium text-xs"
                    >
                      <span className="text-xs whitespace-nowrap">Loading...</span>
                    </Button>
                  )
                ) : (
                  authenticated && telegramAccount ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/50 backdrop-blur-sm px-2 py-1.5 h-8 max-w-[200px] opacity-75">
                      <div className="relative h-5 w-5 overflow-hidden rounded-full border border-primary/20 shrink-0 bg-secondary flex items-center justify-center">
                        {telegramPhotoUrl ? (
                          <Image 
                            src={telegramPhotoUrl} 
                            alt="Telegram Avatar" 
                            fill 
                            className="object-cover rounded-full"
                            unoptimized
                          />
                        ) : (
                          <User className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <span className="font-mono text-xs font-medium text-foreground truncate">
                        {telegramUsername || "Telegram User"}
                      </span>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleConnect}
                      disabled={isConnecting || !privyReady}
                      className="h-8 px-2.5 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-xs shadow-lg shadow-primary/50"
                    >
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="whitespace-nowrap">Connect</span>
                      </div>
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3 p-1 bg-card border border-border">
            <TabsTrigger
              value="control"
              className="text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Control Panel
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Live Activity
            </TabsTrigger>
            <TabsTrigger
              value="manage"
              className="text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Manage Bot
            </TabsTrigger>
          </TabsList>

          <TabsContent value="control" className="mt-4 space-y-4">
            <PriceChart tokenAddress={targetTokenAddress} />
            <WalletCard 
              fuelBalance={fuelBalance} 
              credits={credits} 
              walletAddress={privySmartWalletAddress}
              isSmartAccountActive={!!privySmartWalletAddress}
            />
            <TokenInput 
              initialAddress={targetTokenAddress}
              disabled={isActive}
              onAddressChange={(address) => {
                if (!isActive) {
                  setTargetTokenAddress(address)
                  if (!address) {
                    setIsTokenVerified(false)
                    setTokenMetadata(null)
                  }
                }
              }}
              onVerifiedChange={(isVerified, metadata) => {
                setIsTokenVerified(isVerified)
                if (metadata) {
                  setTokenMetadata(metadata)
                  if (typeof window !== "undefined" && privySmartWalletAddress) {
                    localStorage.setItem(`targetTokenMetadata_${privySmartWalletAddress}`, JSON.stringify(metadata))
                  }
                } else {
                  setTokenMetadata(null)
                }
              }}
            />
            <ConfigPanel 
              fuelBalance={fuelBalance} 
              credits={credits} 
              smartWalletAddress={privySmartWalletAddress}
              buyAmountUsd={buyAmountUsd}
              onBuyAmountChange={setBuyAmountUsd}
              intervalSeconds={intervalSeconds}
              onIntervalChange={setIntervalSeconds}
              onCreditUpdate={refetchCredit}
              isActive={isActive}
            />
            <ActionButton 
              isActive={isActive} 
              onToggle={handleToggle}
              onGenerateWallets={handleGenerateBotWallets}
              credits={credits}
              balanceWei={creditData?.balanceWei}
              isVerified={isTokenVerified}
              buyAmountUsd={buyAmountUsd}
              loadingState={bumpLoadingState}
              isLoadingWallets={isLoadingBotWallets}
              hasBotWallets={hasBotWallets}
            />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <BotLiveActivity 
              userAddress={privySmartWalletAddress} 
              enabled={!!privySmartWalletAddress}
              existingBotWallets={existingBotWallets}
            />
          </TabsContent>

          <TabsContent value="manage" className="mt-4">
            <ManageBot userAddress={privySmartWalletAddress} botWallets={existingBotWallets} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
