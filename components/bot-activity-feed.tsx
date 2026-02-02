"use client"

import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Activity, ExternalLink, Loader2 } from "lucide-react"
import { useBotLogs } from "@/hooks/use-bot-logs"
import { formatEther } from "viem"
import { motion, AnimatePresence } from "framer-motion"

interface BotWallet {
  smartWalletAddress: string
  index: number
}

interface BotActivityFeedProps {
  userAddress: string | null
  botWallets?: BotWallet[]
  enabled?: boolean
}

/**
 * Bot Activity Feed Component
 * 
 * Displays real-time bot logs from Supabase
 * Features:
 * - Realtime updates via Supabase subscriptions
 * - Wallet labels (Bot Wallet #1, #2, etc.)
 * - Status badges (Success, Failed, Pending)
 * - Transaction links to BaseScan
 * - Relative timestamps
 * - Smooth animations for new logs
 */
export function BotActivityFeed({
  userAddress,
  botWallets = [],
  enabled = true,
}: BotActivityFeedProps) {
  const { logs, isLoading, getWalletLabel, formatAmount, formatRelativeTime } = useBotLogs({
    userAddress,
    botWallets,
    enabled,
  })

  return (
    <Card className="glass-card border-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Live Activity</h2>
      </div>

      <ScrollArea className="h-64 rounded-lg border border-border bg-secondary/20">
        {isLoading ? (
          <div className="flex h-full items-center justify-center p-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">Loading logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-center text-sm text-muted-foreground">
              {enabled
                ? "Waiting for bot transactions..."
                : "No activity yet. Start bumping to see live transactions."}
            </p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            <AnimatePresence mode="popLayout">
              {logs.map((log) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-between rounded-md bg-card/50 p-3 transition-colors hover:bg-card/80"
                >
                  <div className="flex flex-1 items-center gap-3">
                    {/* Status Badge */}
                    <Badge
                      variant={
                        log.status === "success"
                          ? "default"
                          : log.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                      className="shrink-0"
                    >
                      {log.status === "success"
                        ? "Success"
                        : log.status === "failed"
                          ? "Failed"
                          : "Pending"}
                    </Badge>

                    {/* Activity Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-foreground">
                          {getWalletLabel(log.wallet_address)}
                        </p>
                        {log.tx_hash && (
                          <a
                            href={`https://basescan.org/tx/${log.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Swapped {formatAmount(log.amount_wei)} ETH for token
                      </p>
                      {log.message && (
                        <p className="mt-1 text-xs text-muted-foreground italic">
                          {log.message}
                        </p>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(log.created_at)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
    </Card>
  )
}

