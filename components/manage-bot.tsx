"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isAddress } from "viem"
import { toast } from "sonner"
import { Send, Loader2, RefreshCw, Wallet, ArrowRightLeft } from "lucide-react"

interface TokenInfo {
  address: string
  symbol: string
  name: string
  decimals: number
  balanceWei: string
  balanceFormatted: string
  walletBalances: { address: string; balance: string }[]
}

interface ManageBotProps {
  userAddress: string | null
  botWallets: { smartWalletAddress: string }[] | null
}

export function ManageBot({ userAddress, botWallets }: ManageBotProps) {
  const [selectedToken, setSelectedToken] = useState<string>("")
  const [recipientAddress, setRecipientAddress] = useState<string>("") 
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isWithdrawingWeth, setIsWithdrawingWeth] = useState(false)
  const [tokens, setTokens] = useState<TokenInfo[]>([])

  const fetchTokenBalances = async () => {
    if (!botWallets || botWallets.length === 0) return
    setIsLoadingTokens(true)
    try {
      const response = await fetch("/api/bot/token-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botWallets: botWallets.map(w => w.smartWalletAddress),
        }),
      })
      const data = await response.json()
      if (data.success && data.tokens) {
        setTokens(data.tokens)
      }
    } catch (error) {
      console.error("UI Fetch Error:", error)
      toast.error("Failed to load tokens")
    } finally {
      setIsLoadingTokens(false)
    }
  }

  useEffect(() => {
    fetchTokenBalances()
  }, [botWallets])

  const selectedTokenInfo = useMemo(() => {
    return tokens.find((t) => t.address.toLowerCase() === selectedToken.toLowerCase()) || null
  }, [tokens, selectedToken])

  const handleSend = async () => {
    if (!selectedTokenInfo || !recipientAddress) {
      toast.error("Select a token and recipient")
      return
    }
    if (!isAddress(recipientAddress)) {
      toast.error("Invalid address")
      return
    }
    setIsSending(true)
    try {
      const activeBotAddresses = selectedTokenInfo.walletBalances
        .filter(wb => BigInt(wb.balance) > 0n)
        .map(wb => wb.address)

      if (activeBotAddresses.length === 0) {
        toast.error("No balance to send")
        setIsSending(false)
        return
      }
      const res = await fetch("/api/bot/send-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botWalletAddresses: activeBotAddresses,
          tokenAddress: selectedTokenInfo.address,
          recipientAddress: recipientAddress,
          symbol: selectedTokenInfo.symbol,
        }),
      })
      const data = await res.json()
      if (data.success) {
        const successCount = data.details.filter((d: any) => d.status === "success").length
        toast.success(`Success`, { description: `Successfully sent from ${successCount} wallets.` })
        setSelectedToken(""); setRecipientAddress(""); fetchTokenBalances()
      } else {
        toast.error(data.error || "Transaction failed")
      }
    } catch (error) {
      toast.error("Transaction failed")
    } finally {
      setIsSending(false)
    }
  }

  const handleWithdrawWeth = async () => {
    if (!selectedTokenInfo || !recipientAddress) {
      toast.error("Select a token and recipient")
      return
    }
    if (!isAddress(recipientAddress)) {
      toast.error("Invalid address")
      return
    }
    setIsWithdrawingWeth(true)
    try {
      const activeBotAddresses = selectedTokenInfo.walletBalances
        .filter(wb => BigInt(wb.balance) > 0n)
        .map(wb => wb.address)

      if (activeBotAddresses.length === 0) {
        toast.error("No balance to withdraw")
        setIsWithdrawingWeth(false)
        return
      }
      const res = await fetch("/api/bot/withdraw-weth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botWalletAddresses: activeBotAddresses,
          tokenAddress: selectedTokenInfo.address,
          recipientAddress: recipientAddress,
        }),
      })
      const data = await res.json()
      if (data.success) {
        const successCount = data.details.filter((d: any) => d.status === "success").length
        toast.success(`Withdraw Success`, { description: `Swapped and sent WETH from ${successCount} wallets.` })
        setSelectedToken(""); setRecipientAddress(""); fetchTokenBalances()
      } else {
        toast.error(data.error || "Withdrawal failed")
      }
    } catch (error) {
      toast.error("Process failed")
    } finally {
      setIsWithdrawingWeth(false)
    }
  }

  return (
    <Card className="glass-card border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Manage Bot
        </h3>
        <button
          onClick={fetchTokenBalances}
          disabled={isLoadingTokens || isSending || isWithdrawingWeth}
          className="text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoadingTokens ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Select Token</Label>
          <Select value={selectedToken} onValueChange={setSelectedToken} disabled={isLoadingTokens || isSending || isWithdrawingWeth}>
            <SelectTrigger className="w-full font-mono text-xs bg-background/50">
              <SelectValue placeholder={isLoadingTokens ? "Scanning..." : "Select Token"} />
            </SelectTrigger>
            <SelectContent>
              {tokens.length === 0 ? (
                <SelectItem value="none" disabled>No Tokens Found</SelectItem>
              ) : (
                tokens.map((token) => (
                  <SelectItem key={token.address} value={token.address}>
                    {token.symbol} — {parseFloat(token.balanceFormatted).toFixed(4)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Recipient Address</Label>
          <Input
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="0x..."
            className="font-mono text-xs bg-background/50"
            disabled={isSending || isWithdrawingWeth}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Total Amount (Max)</Label>
          <Input
            readOnly
            value={selectedTokenInfo ? `${selectedTokenInfo.balanceFormatted} ${selectedTokenInfo.symbol}` : "0.00"}
            className="bg-muted/30 font-mono text-xs cursor-not-allowed"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleSend}
            disabled={isSending || isWithdrawingWeth || !selectedToken || !recipientAddress}
            className="w-full text-white font-bold transition-all active:scale-95"
            style={{ backgroundColor: "#10b981" }} 
          >
            {isSending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="mr-2 h-4 w-4" /> Send</>
            )}
          </Button>

          <Button
            onClick={handleWithdrawWeth}
            disabled={isSending || isWithdrawingWeth || !selectedToken || !recipientAddress}
            className="w-full text-white font-bold transition-all active:scale-95"
            style={{ backgroundColor: "#10b981" }} 
          >
            {isWithdrawingWeth ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
            ) : (
              <><ArrowRightLeft className="mr-2 h-4 w-4" /> Withdraw as WETH</>
            )}
          </Button>
        </div>
      </div>
    </Card>
  )
}
