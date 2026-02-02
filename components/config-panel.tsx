"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Clock, Coins, Fuel, ExternalLink, AlertCircle, ArrowRightLeft, ArrowDownUp, Loader2, DollarSign, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBumpBalance } from "@/hooks/use-bump-balance"
import { useFarcasterMiniApp } from "@/components/miniapp-provider"
import { sdk } from "@farcaster/miniapp-sdk"
import { WithdrawModal } from "@/components/withdraw-modal"
import { useConvertFuel } from "@/hooks/use-convert-fuel"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface ConfigPanelProps {
  fuelBalance?: number
  credits?: number
  smartWalletAddress?: string | null
  buyAmountUsd?: string
  onBuyAmountChange?: (amount: string) => void
  intervalSeconds?: number
  onIntervalChange?: (seconds: number) => void
  onCreditUpdate?: (options?: any) => Promise<any> | void // Callback to refetch credit balance after convert (React Query refetch)
  isActive?: boolean // Lock settings when bot is running
}

export function ConfigPanel({ 
  fuelBalance = 0, 
  credits = 0, 
  smartWalletAddress,
  buyAmountUsd = "0.0001",
  onBuyAmountChange,
  intervalSeconds = 60,
  onIntervalChange,
  onCreditUpdate,
  isActive = false // Lock settings when bot is running
}: ConfigPanelProps) {
  // Fetch $BUMP token balance from Smart Wallet address (same as WalletCard)
  const { formattedBalance, isLoading: isLoadingBalance } = useBumpBalance({
    address: smartWalletAddress || null,
    enabled: !!smartWalletAddress && smartWalletAddress !== "0x000...000",
  })
  const { isInWarpcast } = useFarcasterMiniApp()
  
  // Bump Speed: Slider value in seconds (2-600 seconds = 2 seconds to 10 minutes)
  // Use controlled prop or fallback to internal state
  const [internalInterval, setInternalInterval] = useState(60)
  const currentInterval = intervalSeconds !== undefined ? intervalSeconds : internalInterval
  const [bumpSpeedSeconds, setBumpSpeedSeconds] = useState([currentInterval])
  
  // Sync bumpSpeedSeconds with currentInterval when prop changes
  useEffect(() => {
    if (intervalSeconds !== undefined && intervalSeconds !== bumpSpeedSeconds[0]) {
      setBumpSpeedSeconds([intervalSeconds])
    }
  }, [intervalSeconds])
  
  const handleIntervalChange = (value: number[]) => {
    const seconds = value[0]
    setBumpSpeedSeconds(value)
    if (onIntervalChange) {
      onIntervalChange(seconds)
    } else {
      setInternalInterval(seconds)
    }
  }
  
  // Use controlled props or fallback to internal state
  const [internalAmount, setInternalAmount] = useState("0.0001")
  
  const amount = buyAmountUsd !== undefined ? buyAmountUsd : internalAmount
  
  const handleAmountChange = (value: string) => {
    if (onBuyAmountChange) {
      onBuyAmountChange(value)
    } else {
      setInternalAmount(value)
    }
  }
  
  // Format seconds to human-readable format
  const formatInterval = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      if (remainingSeconds === 0) {
        return `${minutes}m`
      }
      return `${minutes}m ${remainingSeconds}s`
    } else {
      const hours = Math.floor(seconds / 3600)
      const remainingMinutes = Math.floor((seconds % 3600) / 60)
      return `${hours}h ${remainingMinutes}m`
    }
  }
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
  const [convertModalOpen, setConvertModalOpen] = useState(false)
  const [convertAmount, setConvertAmount] = useState("")
  const [needsApproval, setNeedsApproval] = useState(false)
  
  // Convert $BUMP to Credit hook
  const { 
    convert, 
    approve,
    isPending: isConverting, 
    isApproving,
    isSuccess: convertSuccess, 
    error: convertError, 
    hash: convertHash,
    approvalHash,
    reset: resetConvert,
    swapStatus 
  } = useConvertFuel()
  
  // Check if approval is needed when amount changes
  useEffect(() => {
    const checkApproval = async () => {
      if (!smartWalletAddress || !convertAmount || parseFloat(convertAmount) <= 0) {
        setNeedsApproval(false)
        return
      }
      
      // This will be checked in the convert function, but we can show UI hint
      // For now, we'll assume approval might be needed
      setNeedsApproval(true)
    }
    
    checkApproval()
  }, [convertAmount, smartWalletAddress])
  
  // Close modal and reset on success
  // CRITICAL: Refetch credit balance after successful convert to update UI in real-time
  useEffect(() => {
    if (convertSuccess && convertModalOpen) {
      // Trigger credit balance refetch to update UI immediately
      // This ensures button text updates from "No Fuel Detected" to "Generate Bot Wallet" or "Start Bumping"
      if (onCreditUpdate) {
        // Small delay to ensure backend has processed the sync-credit API call
        setTimeout(() => {
          onCreditUpdate()
        }, 1000)
      }
      
      const timer = setTimeout(() => {
        setConvertModalOpen(false)
        setConvertAmount("")
        resetConvert()
      }, 3000) // Close after 3 seconds
      return () => clearTimeout(timer)
    }
  }, [convertSuccess, convertModalOpen, resetConvert, onCreditUpdate])

  // Handle Buy $BUMP using Farcaster Native Swap
  // Based on: https://miniapps.farcaster.xyz/docs/sdk/actions/swap-token#buytoken-optional
  // Format: CAIP-19 asset ID (eip155:chainId/erc20:address)
  const handleBuyBump = async () => {
    if (!isInWarpcast) {
      // Fallback to external link if not in Warpcast
      window.open(`https://app.uniswap.org/swap?chain=base&outputCurrency=0x94ce728849431818ec9a0cf29bdb24fe413bbb07`, '_blank')
      return
    }

    try {
      // Use Farcaster SDK swapToken action for native swap
      // CAIP-19 format: eip155:8453/erc20:0x94ce728849431818ec9a0cf29bdb24fe413bbb07
      const result = await sdk.actions.swapToken({
        buyToken: "eip155:8453/erc20:0x94ce728849431818ec9a0cf29bdb24fe413bbb07", // $BUMP token on Base
      })

      if (result.success) {
        console.log("✅ Swap successful:", result.swap.transactions)
      } else {
        console.warn("⚠️ Swap rejected or failed:", result.reason)
      }
    } catch (error) {
      console.error("Failed to open swap interface:", error)
      // Fallback to external link
      window.open(`https://app.uniswap.org/swap?chain=base&outputCurrency=0x94ce728849431818ec9a0cf29bdb24fe413bbb07`, '_blank')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border border-border bg-card p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fuel className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Fuel Status</span>
            </div>
          </div>

          <div className="space-y-3 rounded-lg bg-secondary border border-border p-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Current Balance</p>
              <p className="font-mono text-lg font-bold text-primary">
                {isLoadingBalance ? (
                  <span className="text-muted-foreground">Loading...</span>
                ) : (
                  `${formattedBalance} $BUMP`
                )}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">This app runs ONLY on $BUMP tokens</p>
            </div>

            <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
              <DialogTrigger asChild>
                <Button 
                  size="sm" 
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold transition-all duration-200 active:scale-95 active:shadow-lg hover:shadow-md"
                  disabled={!smartWalletAddress || isLoadingBalance}
                  title={!smartWalletAddress ? "Smart Wallet not ready" : "Convert $BUMP to Credit using Smart Wallet"}
                >
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Convert $BUMP to Credit
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Convert $BUMP to Credit</DialogTitle>
                  <DialogDescription>
                    Convert your $BUMP tokens to Credit. 90% will be swapped to Credit, 5% of $BUMP is allocated for treasury to be burned every week, 5% as platform fee.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount ($BUMP)</label>
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={convertAmount}
                        onChange={(e) => {
                          // Only allow whole numbers (integers), no decimals
                          const value = e.target.value.replace(/[^0-9]/g, '')
                          setConvertAmount(value)
                        }}
                        placeholder="Enter amount to convert"
                        className="font-mono pr-16 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        min="0"
                        disabled={isConverting || isLoadingBalance}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs font-medium hover:bg-secondary"
                        onClick={() => {
                          if (formattedBalance && !isLoadingBalance) {
                            // Remove commas and parse as integer (no decimals)
                            const maxAmount = Math.floor(parseFloat(formattedBalance.replace(/,/g, ''))).toString()
                            setConvertAmount(maxAmount)
                          }
                        }}
                        disabled={isConverting || isLoadingBalance || !formattedBalance}
                      >
                        MAX
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Available: {formattedBalance} $BUMP (whole numbers only)
                    </p>
                  </div>
                  
                  {convertError && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                      <p className="text-sm text-destructive">{convertError.message}</p>
                    </div>
                  )}
                  
                  {swapStatus && isConverting && (
                    <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
                      <p className="text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {swapStatus}
                      </p>
                    </div>
                  )}
                  
                  {convertSuccess && convertHash && (
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                        ✅ Conversion successful!
                      </p>
                      <a
                        href={`https://basescan.org/tx/${convertHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-600 dark:text-green-400 underline mt-1 block"
                      >
                        View transaction
                      </a>
                    </div>
                  )}
                  
                  {approvalHash && (
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
                      <p className="text-xs text-green-600 dark:text-green-400">
                        ✅ Approval confirmed
                      </p>
                      <a
                        href={`https://basescan.org/tx/${approvalHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-600 dark:text-green-400 underline mt-1 block"
                      >
                        View approval transaction
                      </a>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 transition-all duration-200 active:scale-95 hover:shadow-md"
                      onClick={async () => {
                        if (!convertAmount || parseFloat(convertAmount) <= 0) {
                          return
                        }
                        try {
                          // Step 1: Auto-approve first if needed (will check allowance internally)
                          // The approve function will check allowance and only approve if needed
                          console.log("🔐 Step 1: Checking and approving if needed...")
                          await approve()
                          setNeedsApproval(false)
                          console.log("✅ Step 1: Approval completed")
                          
                          // Step 2: Convert after approval is confirmed
                          console.log("💱 Step 2: Starting conversion...")
                          await convert(convertAmount)
                        } catch (err: any) {
                          // Error already handled in hooks
                          console.error("Error in convert flow:", err)
                        }
                      }}
                      disabled={!convertAmount || parseFloat(convertAmount) <= 0 || isConverting || isApproving || !smartWalletAddress}
                    >
                      {isApproving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Approving...
                        </>
                      ) : isConverting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {swapStatus || "Converting..."}
                        </>
                      ) : (
                        "Convert"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setConvertModalOpen(false)
                        setConvertAmount("")
                        setNeedsApproval(false)
                        resetConvert()
                      }}
                      disabled={isConverting || isApproving}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              size="sm"
              variant="outline"
              className="w-full border-primary/20 text-primary hover:bg-primary/10 font-medium bg-transparent"
              onClick={handleBuyBump}
              disabled={!smartWalletAddress}
              title={!smartWalletAddress ? "Smart Wallet not ready" : "Buy $BUMP using Farcaster Native Swap"}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Buy $BUMP
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="w-full border-border text-foreground hover:bg-secondary font-medium"
              onClick={() => setWithdrawModalOpen(true)}
              disabled={!smartWalletAddress || isLoadingBalance}
              title={!smartWalletAddress ? "Smart Wallet not ready" : "Withdraw $BUMP to another address"}
            >
              <ArrowDownUp className="mr-1.5 h-3.5 w-3.5" />
              Withdraw $BUMP
            </Button>
          </div>

          <WithdrawModal
            open={withdrawModalOpen}
            onOpenChange={setWithdrawModalOpen}
            smartWalletAddress={smartWalletAddress || null}
          />

          {credits === 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-destructive">NO FUEL DETECTED</p>
                <p className="text-[10px] text-destructive/80 leading-tight">
                  Convert $BUMP tokens to Credits to power your bumping automation
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="border border-border bg-card p-4">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <label className="text-sm font-medium text-foreground">Bump Speed</label>
              </div>
              <span className="font-mono text-sm font-semibold text-primary">
                {formatInterval(bumpSpeedSeconds[0])}
              </span>
            </div>
            <Slider
              value={bumpSpeedSeconds}
              onValueChange={handleIntervalChange}
              min={2}
              max={600}
              step={1}
              disabled={isActive} // Lock when bot is running
              className={isActive ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>2s</span>
              <span>Interval</span>
              <span>10m</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Time between each swap execution (Round Robin across 5 wallets)
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <label className="text-sm font-medium text-foreground">Amount per Bump</label>
            </div>
            <div className="relative">
              <Input
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                disabled={isActive} // Lock when bot is running
                className="font-mono pr-16 bg-secondary border-border text-foreground"
                step="0.01"
                min="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                USD
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Amount per swap execution (minimum $0.01 USD, continuously until you stop the bot)
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
