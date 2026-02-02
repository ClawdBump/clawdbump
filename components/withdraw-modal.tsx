"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWithdrawBump } from "@/hooks/use-withdraw-bump"
import { useBumpBalance } from "@/hooks/use-bump-balance"
import { isAddress } from "viem"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

interface WithdrawModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  smartWalletAddress: string | null
}

export function WithdrawModal({ open, onOpenChange, smartWalletAddress }: WithdrawModalProps) {
  const [destinationAddress, setDestinationAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [addressError, setAddressError] = useState("")
  const [amountError, setAmountError] = useState("")

  // Get current balance for validation
  const { formattedBalance, balance: rawBalance } = useBumpBalance({
    address: smartWalletAddress || null,
    enabled: !!smartWalletAddress && smartWalletAddress !== "0x000...000",
  })

  // Withdraw hook
  const { withdraw, isPending, isSuccess, error, reset } = useWithdrawBump()

  // Reset form and errors when modal opens/closes
  useEffect(() => {
    if (!open) {
      setDestinationAddress("")
      setAmount("")
      setAddressError("")
      setAmountError("")
      reset()
    }
  }, [open, reset])

  // Show success toast when transaction is confirmed
  useEffect(() => {
    if (isSuccess) {
      toast.success("$BUMP withdrawn successfully!", {
        description: `Transaction confirmed. ${amount} $BUMP sent to ${destinationAddress.slice(0, 6)}...${destinationAddress.slice(-4)}`,
      })
      onOpenChange(false)
    }
  }, [isSuccess, amount, destinationAddress, onOpenChange])

  // Show error toast
  useEffect(() => {
    if (error) {
      toast.error("Withdrawal failed", {
        description: error.message || "Transaction failed. Please try again.",
      })
    }
  }, [error])

  const validateForm = () => {
    let isValid = true
    setAddressError("")
    setAmountError("")

    // Validate address
    if (!destinationAddress.trim()) {
      setAddressError("Destination address is required")
      isValid = false
    } else if (!isAddress(destinationAddress.trim())) {
      setAddressError("Invalid Ethereum address")
      isValid = false
    }

    // Validate amount
    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setAmountError("Amount must be greater than 0")
      isValid = false
    } else if (rawBalance && amountNum > parseFloat(formattedBalance.replace(/,/g, ""))) {
      setAmountError(`Insufficient balance. Available: ${formattedBalance} $BUMP`)
      isValid = false
    }

    return isValid
  }

  const handleWithdraw = async () => {
    if (!validateForm()) {
      return
    }

    try {
      await withdraw(destinationAddress.trim(), amount)
    } catch (err: any) {
      toast.error("Withdrawal failed", {
        description: err.message || "Failed to initiate withdrawal",
      })
    }
  }

  const handleMaxAmount = () => {
    if (formattedBalance) {
      setAmount(formattedBalance.replace(/,/g, ""))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Withdraw $BUMP</DialogTitle>
          <DialogDescription>
            Send $BUMP tokens from your Smart Wallet to another address on Base Network.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="destination" className="text-sm font-medium text-foreground">
              Destination Address
            </label>
            <Input
              id="destination"
              placeholder="0x..."
              value={destinationAddress}
              onChange={(e) => {
                setDestinationAddress(e.target.value)
                setAddressError("")
              }}
              className={`font-mono ${addressError ? "border-destructive" : ""}`}
              disabled={isPending}
            />
            {addressError && (
              <p className="text-xs text-destructive">{addressError}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="amount" className="text-sm font-medium text-foreground">
                Amount ($BUMP)
              </label>
              <span className="text-xs text-muted-foreground">
                Available: {formattedBalance} $BUMP
              </span>
            </div>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setAmountError("")
                }}
                className={`font-mono pr-16 ${amountError ? "border-destructive" : ""}`}
                step="0.000001"
                min="0"
                disabled={isPending}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMaxAmount}
                disabled={isPending || !formattedBalance}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs"
              >
                MAX
              </Button>
            </div>
            {amountError && (
              <p className="text-xs text-destructive">{amountError}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleWithdraw}
            disabled={isPending || !destinationAddress || !amount}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Withdraw"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}









