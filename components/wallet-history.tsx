"use client"

import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ArrowUpRight, ArrowDownLeft, ExternalLink } from "lucide-react"

const mockHistory = [
  { id: 1, type: "deposit", amount: "1.5000", time: "2 hours ago", hash: "0xa4f3...82bc" },
  { id: 2, type: "withdraw", amount: "0.2500", time: "5 hours ago", hash: "0x7d21...3fa9" },
  { id: 3, type: "deposit", amount: "2.0000", time: "1 day ago", hash: "0x9b8c...4e1d" },
  { id: 4, type: "withdraw", amount: "0.5000", time: "2 days ago", hash: "0x3c5f...7a2b" },
  { id: 5, type: "deposit", amount: "1.0000", time: "3 days ago", hash: "0x6e9a...1c8d" },
]

export function WalletHistory() {
  return (
    <Card className="glass-card border-border p-4">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Transaction History</h3>
      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {mockHistory.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    tx.type === "deposit" ? "bg-accent/20" : "bg-destructive/20"
                  }`}
                >
                  {tx.type === "deposit" ? (
                    <ArrowDownLeft className="h-4 w-4 text-accent" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium capitalize text-foreground">{tx.type}</p>
                  <p className="text-xs text-muted-foreground">{tx.time}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold text-foreground">{tx.amount} ETH</p>
                  <p className="font-mono text-xs text-muted-foreground">{tx.hash}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  )
}
