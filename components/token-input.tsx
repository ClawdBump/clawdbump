"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { isAddress, type Address } from "viem"
import { usePublicClient } from "wagmi"
import { base } from "wagmi/chains"

// ERC20 ABI for name, symbol, and decimals
const ERC20_METADATA_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const

interface TokenMetadata {
  name: string
  symbol: string
  decimals: number
}

interface TokenInputProps {
  initialAddress?: string | null // Initial address to load (from localStorage)
  disabled?: boolean // Lock input when bumping is active
  onAddressChange?: (address: string | null) => void
  onVerifiedChange?: (isVerified: boolean, metadata?: TokenMetadata) => void
}

export function TokenInput({ initialAddress, disabled = false, onAddressChange, onVerifiedChange }: TokenInputProps) {
  // Use initialAddress if provided, otherwise start empty
  const [address, setAddress] = useState(initialAddress || "")
  const [status, setStatus] = useState<"idle" | "loading" | "verified" | "error">("idle")
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const publicClient = usePublicClient({ chainId: base.id })
  
  // Update address when initialAddress changes (from parent)
  useEffect(() => {
    if (initialAddress !== undefined) {
      setAddress(initialAddress || "")
      if (!initialAddress) {
        setStatus("idle")
        setTokenMetadata(null)
        setErrorMessage("")
      }
    }
  }, [initialAddress])
  
  // Auto-verify persisted address on mount if initialAddress is provided
  useEffect(() => {
    if (initialAddress && isAddress(initialAddress) && publicClient && status === "idle") {
      // Auto-verify if address is already set (from localStorage)
      // Use a small delay to ensure publicClient is ready
      const timer = setTimeout(async () => {
        if (!publicClient || !initialAddress) return
        
        const tokenAddress = initialAddress as Address
        setStatus("loading")
        setErrorMessage("")
        setTokenMetadata(null)

        try {
          const [name, symbol, decimals] = await Promise.all([
            publicClient.readContract({
              address: tokenAddress,
              abi: ERC20_METADATA_ABI,
              functionName: "name",
              chainId: base.id,
            }) as Promise<string>,
            publicClient.readContract({
              address: tokenAddress,
              abi: ERC20_METADATA_ABI,
              functionName: "symbol",
              chainId: base.id,
            }) as Promise<string>,
            publicClient.readContract({
              address: tokenAddress,
              abi: ERC20_METADATA_ABI,
              functionName: "decimals",
              chainId: base.id,
            }) as Promise<number>,
          ])

          const metadata: TokenMetadata = {
            name: name || "Unknown Token",
            symbol: symbol || "UNKNOWN",
            decimals: decimals || 18,
          }

          setTokenMetadata(metadata)
          setStatus("verified")
        } catch (error: any) {
          console.error("Error auto-verifying token:", error)
          setStatus("error")
          setErrorMessage("Failed to verify token")
          setTokenMetadata(null)
        }
      }, 500)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  // Reset status when address is cleared
  useEffect(() => {
    if (!address && status !== "idle") {
      setStatus("idle")
      setTokenMetadata(null)
      setErrorMessage("")
      onAddressChange?.(null)
      onVerifiedChange?.(false)
    }
  }, [address, status, onAddressChange, onVerifiedChange])

  // Notify parent when address changes and is verified
  useEffect(() => {
    if (status === "verified" && address && isAddress(address) && tokenMetadata) {
      onAddressChange?.(address)
      onVerifiedChange?.(true, tokenMetadata)
    } else {
      onAddressChange?.(null)
      onVerifiedChange?.(false)
    }
  }, [address, status, tokenMetadata, onAddressChange, onVerifiedChange])

  const handleVerify = async () => {
    if (!publicClient) {
      setStatus("error")
      setErrorMessage("Wallet not connected")
      return
    }

    // Validate address format first
    if (!address || !isAddress(address)) {
      setStatus("error")
      setErrorMessage("Invalid contract address format")
      return
    }

    setStatus("loading")
    setErrorMessage("")
    setTokenMetadata(null)

    try {
      const tokenAddress = address as Address

      // Fetch token metadata from blockchain
      const [name, symbol, decimals] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_METADATA_ABI,
          functionName: "name",
          chainId: base.id,
        }) as Promise<string>,
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_METADATA_ABI,
          functionName: "symbol",
          chainId: base.id,
        }) as Promise<string>,
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_METADATA_ABI,
          functionName: "decimals",
          chainId: base.id,
        }) as Promise<number>,
      ])

      const metadata: TokenMetadata = {
        name: name || "Unknown Token",
        symbol: symbol || "UNKNOWN",
        decimals: decimals || 18,
      }

      setTokenMetadata(metadata)
      setStatus("verified")
    } catch (error: any) {
      console.error("Error verifying token:", error)
      setStatus("error")
      setErrorMessage(
        error?.message?.includes("does not exist") || error?.message?.includes("execution reverted")
          ? "Contract not found or not an ERC20 token"
          : "Failed to verify token. Please check the address."
      )
      setTokenMetadata(null)
    }
  }

  return (
    <Card className="border border-border bg-card p-4">
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">Target Token</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Paste Contract Address (0x...)"
              value={address}
              onChange={(e) => {
                if (!disabled) {
                  setAddress(e.target.value)
                }
              }}
              disabled={disabled}
              readOnly={disabled}
              className="font-mono text-sm pr-10 bg-secondary border-border text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {status === "verified" && (
              <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            )}
            {status === "error" && (
              <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
            )}
          </div>
          <Button
            onClick={handleVerify}
            disabled={!address || status === "loading" || disabled}
            className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </Button>
        </div>
        {(status === "verified" || disabled) && tokenMetadata && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-primary">
              <CheckCircle2 className="h-3 w-3" />
              <span>Verified on Base Network</span>
            </div>
            <div className="pl-5 text-xs text-foreground bg-secondary/50 rounded-md p-2 border border-border">
              <div className="font-semibold text-primary mb-1">
                {tokenMetadata.symbol} - {tokenMetadata.name}
              </div>
              <div className="text-muted-foreground">
                Decimals: {tokenMetadata.decimals}
              </div>
              <div className="text-muted-foreground font-mono text-[10px] mt-1 break-all">
                {address}
              </div>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <XCircle className="h-3 w-3" />
            <span>{errorMessage || "Invalid contract address"}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
