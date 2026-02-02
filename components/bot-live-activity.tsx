"use client"

import { useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Activity, ExternalLink, Loader2, Wallet } from "lucide-react"
import { useBotLogs, getWalletLabel, formatRelativeTime } from "@/hooks/use-bot-logs"
import { useBotWallets } from "@/hooks/use-bot-wallets"
import { useCreditBalance } from "@/hooks/use-credit-balance"
import { formatEther } from "viem"
import { useBotSession } from "@/hooks/use-bot-session"

interface BotLiveActivityProps {
  userAddress: string | null
  enabled?: boolean
  existingBotWallets?: Array<{ smartWalletAddress: string; index: number }> | null // Pass wallet data from parent to show correct count
}

/**
 * Bot Live Activity Component
 * 
 * Displays real-time bot logs from Supabase with:
 * - Realtime updates via Supabase subscriptions
 * - Wallet labels (Bot Wallet #1, #2, etc.)
 * - Status badges (Success, Failed, Pending)
 * - Transaction links to BaseScan
 * - Relative timestamps
 * - Smooth animations for new logs
 * - Aggregated wallet status overview
 */
export function BotLiveActivity({ userAddress, enabled = true, existingBotWallets = null }: BotLiveActivityProps) {
  // Get bot session for active status FIRST (before using it in other hooks)
  // Always call hook to maintain hook order (React Rules of Hooks)
  const { session } = useBotSession(userAddress)

  // Determine if bot is actually running
  const isBotRunning = enabled && !!userAddress && !!session && session.status === "running"

  // Get bot wallets for wallet labels
  // CRITICAL: useBotWallets hook has enabled: false by default
  // API will only be called manually via refetch() - not automatically
  // Always call hook to maintain hook order (React Rules of Hooks)
  const { 
    data: botWallets, 
    isLoading: isLoadingWallets,
    error: walletsError,
    refetch: refetchBotWallets 
  } = useBotWallets({
    userAddress,
    enabled: false, // IMPORTANT: Set enabled: false to prevent auto-fetch
    // Use refetch() manually when needed instead
  })
  
  // Log errors but don't crash the component
  // Use empty array as fallback to prevent undefined errors
  // Type assertion needed because React Query types are complex
  type BotWallet = { smartWalletAddress: string; index: number }
  
  // PENTING: Gunakan existingBotWallets dari parent jika tersedia (untuk tampilan Active Bots yang akurat)
  // Fallback ke botWallets dari hook jika existingBotWallets tidak tersedia
  const safeBotWallets: BotWallet[] = existingBotWallets && Array.isArray(existingBotWallets) && existingBotWallets.length > 0
    ? existingBotWallets
    : (botWallets as BotWallet[] | undefined) || []
  
  if (walletsError) {
    console.error("⚠️ Error loading bot wallets:", walletsError)
  }
  
  // CRITICAL: Get bot logs FIRST before using in useEffect
  // This prevents "Cannot access before initialization" errors
  // Always call hook to maintain hook order (React Rules of Hooks)
  const { logs, isLoading: isLoadingLogs } = useBotLogs({
    userAddress,
    enabled: enabled && !!userAddress,
    limit: 20, // Initial load: last 20 logs
  })
  
  // Auto-scroll to top when new logs arrive (log terbaru di atas)
  // CRITICAL: Declare refs AFTER logs is declared to prevent initialization errors
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const logsStartRef = useRef<HTMLDivElement>(null)
  const prevLogsLengthRef = useRef<number>(0)
  
  useEffect(() => {
    // Only auto-scroll if logs length increased (new log added)
    if (logs.length > prevLogsLengthRef.current && logs.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        // Try to scroll the viewport of ScrollArea to top (log terbaru)
        const viewport = scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
        if (viewport) {
          viewport.scrollTo({
            top: 0, // Scroll to top (log terbaru)
            behavior: "smooth"
          })
        } else {
          // Fallback to scrollIntoView
          logsStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      }, 100)
    }
    prevLogsLengthRef.current = logs.length
  }, [logs.length])

  // Get credit balance for aggregated status
  // Always call hook to maintain hook order (React Rules of Hooks)
  const { data: creditData } = useCreditBalance(userAddress, {
    enabled: enabled && !!userAddress,
  })

  // Calculate aggregated credit from bot wallets
  // Note: This would require fetching balances from blockchain
  // For now, we'll use the user's credit balance as proxy
  const aggregatedCredit = creditData?.balanceEth || "0"

  // Count active wallets (all 5 wallets are ready if bot wallets exist)
  // Pastikan perbarui tampilan Active Bots bukan lagi 0/5 Wallets Ready ketika user telah memiliki 5 smart wallet bot di database
  const activeWalletsCount = safeBotWallets.length >= 5 ? 5 : safeBotWallets.length
  const totalWallets = 5

  // Always render if userAddress exists (even if not enabled, show placeholder)
  // This ensures Live Activity is always visible in the dashboard
  if (!userAddress) {
    return null
  }

  return (
    <Card className="glass-card border-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Live Activity</h2>
        </div>
        {isBotRunning && (
          <Badge variant="default" className="animate-pulse">
            Active
          </Badge>
        )}
      </div>

      {/* Aggregated Wallet Status Overview */}
      <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-secondary/20 p-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Active Bots</span>
          </div>
          <p className="text-sm font-semibold text-foreground">
            {activeWalletsCount}/{totalWallets} Wallets Ready
          </p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs text-muted-foreground">Total Credit</span>
          </div>
          <p className="text-sm font-semibold text-foreground">
            {parseFloat(aggregatedCredit).toFixed(6)} ETH
          </p>
        </div>
      </div>

      {/* Live Activity Feed */}
      <ScrollArea className="h-64 rounded-lg border border-border bg-secondary/20" ref={scrollAreaRef}>
        {isLoadingLogs || isLoadingWallets ? (
          <div className="flex h-full items-center justify-center p-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">Loading logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-center text-sm text-muted-foreground">
              {isBotRunning
                ? "Waiting for bot transactions..."
                : "No activity yet. Start bumping to see live transactions."}
            </p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {/* Invisible element at the start for auto-scroll target (log terbaru di atas) */}
            <div ref={logsStartRef} />
            {logs.map((log, index) => {
              const walletLabel = getWalletLabel(log.wallet_address, safeBotWallets)
              // Handle empty or zero amount_wei
              const amountEth = log.amount_wei && BigInt(log.amount_wei) > BigInt(0)
                ? formatEther(BigInt(log.amount_wei))
                : "0"
              
              // Format action text - use message from log (already formatted by backend)
              // Backend formats: [Bot #1] Melakukan swap senilai $0.01 ke Target Token... [Lihat Transaksi]
              // Or: [System] Mengirim 0.000003 ETH ($0.01) ke Bot #1... Berhasil
              // Or: [System] Saldo Bot #1 tidak cukup ($ < 0.01). Bumping dihentikan.
              const actionText = log.message || (amountEth !== "0" ? `Buying token for ${parseFloat(amountEth).toFixed(6)} ETH` : "System message")

              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-md bg-card/50 p-2 sm:p-3 transition-all duration-200 hover:bg-card/80 animate-in fade-in slide-in-from-top-2"
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                >
                  <div className="flex flex-1 items-center gap-3 min-w-0">
                    {/* Status Badge */}
                    <Badge
                      variant={
                        log.status === "success"
                          ? "default" // Green (default variant)
                          : log.status === "failed"
                            ? "destructive" // Red
                            : "secondary" // Yellow/Orange (pending)
                      }
                      className="shrink-0"
                    >
                      {log.status === "success"
                        ? "Success"
                        : log.status === "failed"
                          ? "Failed"
                          : "Processing"}
                    </Badge>

                    {/* Activity Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[10px] sm:text-xs font-medium text-foreground truncate">
                          {walletLabel}
                        </p>
                        {log.tx_hash && (
                          <a
                            href={`https://basescan.org/tx/${log.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                            title="View on BaseScan"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 break-words">
                        {actionText}
                      </p>
                      {log.message && (
                        <p className="mt-1 text-[10px] sm:text-xs text-muted-foreground italic line-clamp-2 break-words">
                          {log.message}
                        </p>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="shrink-0 text-[10px] sm:text-xs text-muted-foreground ml-2">
                      {formatRelativeTime(log.created_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </Card>
  )
}

