# 0x Swap API v2 Integration

## Overview

This document explains how to use 0x Swap API **v2** for token swaps on Base network with Smart Wallet support.

**API Version**: v2 (latest)

## Features

- **Aggregated Liquidity**: 0x aggregates liquidity from multiple DEXs (Uniswap, Curve, etc.)
- **Permit2 Support**: Efficient token approvals using Permit2
- **Smart Wallet Compatible**: Works seamlessly with Privy Smart Wallets
- **Gasless Transactions**: Can be combined with Paymaster for gasless swaps

## Setup

### 1. Get 0x API Key

1. Go to [0x Dashboard](https://dashboard.0x.org)
2. Create an account or login
3. Navigate to API Keys section
4. Create a new API key
5. Copy the API key

### 2. Add to Environment Variables

Add to `.env.local`:

\`\`\`env
# IMPORTANT: Use ZEROX_API_KEY (not NEXT_PUBLIC_ZEROX_API_KEY) for security
# API key is server-side only and never exposed to client
ZEROX_API_KEY=bec0c136-9487-4a50-9ceb-995e8d6a1419
\`\`\`

### 3. Restart Development Server

\`\`\`bash
npm run dev
\`\`\`

## Usage

### Basic Swap

\`\`\`typescript
import { use0xSwap } from "@/hooks/use-0x-swap"

function MyComponent() {
  const { swap, isPending, isSuccess, error, hash } = use0xSwap()

  const handleSwap = async () => {
    await swap(
      "0x94ce728849431818ec9a0cf29bdb24fe413bbb07", // $BUMP
      "0x4200000000000000000000000000000000000006", // WETH
      "100", // Amount in token units
      18, // sellToken decimals
      18, // buyToken decimals
      0.5 // slippage percentage
    )
  }

  return (
    <button onClick={handleSwap} disabled={isPending}>
      {isPending ? "Swapping..." : "Swap $BUMP to WETH"}
    </button>
  )
}
\`\`\`

### Swap $BUMP to WETH (Convenience Method)

\`\`\`typescript
import { use0xSwap } from "@/hooks/use-0x-swap"

function MyComponent() {
  const { swapBumpToWeth, isPending, isSuccess, error } = use0xSwap()

  const handleSwap = async () => {
    await swapBumpToWeth("100", 0.5) // 100 $BUMP, 0.5% slippage
  }

  return (
    <button onClick={handleSwap} disabled={isPending}>
      Swap
    </button>
  )
}
\`\`\`

### Get Quote Only

\`\`\`typescript
import { use0xSwap } from "@/hooks/use-0x-swap"

function MyComponent() {
  const { getQuote } = use0xSwap()

  const handleGetQuote = async () => {
    const quote = await getQuote({
      sellToken: "0x94ce728849431818ec9a0cf29bdb24fe413bbb07",
      buyToken: "0x4200000000000000000000000000000000000006",
      sellAmount: "100000000000000000000", // 100 tokens in wei
      takerAddress: "0x...",
      slippagePercentage: 0.5,
    })

    console.log("Price:", quote.price)
    console.log("Buy Amount:", quote.buyAmount)
    console.log("Estimated Price Impact:", quote.estimatedPriceImpact)
  }
}
\`\`\`

## API Endpoints (v2)

### Base Network

- **Base URL**: `https://base.api.0x.org`
- **Quote Endpoint (v2)**: `/swap/v2/quote`
- **Price Endpoint (v2)**: `/swap/v2/price`

### v2 API Features

- **Better Price Execution**: Optimized trade execution
- **Enhanced Error Handling**: `issues` object provides detailed error information
- **Improved Security**: Enhanced security features
- **Permit2 Support**: Built-in Permit2 support with `enablePermit2=true` parameter

## Response Structure (v2)

\`\`\`typescript
{
  chainId: 8453,
  price: "0.001234",
  estimatedPriceImpact: "0.05",
  buyAmount: "123400000000000000",
  sellAmount: "100000000000000000000",
  buyToken: "0x4200000000000000000000000000000000000006",
  sellToken: "0x94ce728849431818ec9a0cf29bdb24fe413bbb07",
  allowanceTarget: "0x...",
  transaction: {
    to: "0x...", // Settler contract address
    data: "0x...", // Transaction data
    value: "0", // ETH value (usually 0 for token swaps)
  },
  permit2: {
    token: "0x...",
    spender: "0x...",
    amount: "100000000000000000000",
    expiration: "1234567890",
    nonce: "0",
    sig: {
      r: "0x...",
      s: "0x...",
      v: 27,
    }
  },
  // v2 API includes issues array for better error handling
  issues?: [
    {
      type: "INSUFFICIENT_ALLOWANCE",
      reason: "Token allowance is insufficient",
      severity: "error" | "warning" | "info"
    }
  ]
}
\`\`\`

## Permit2 Integration

0x Swap API uses Permit2 for efficient token approvals:

1. **Permit2 Address**: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
2. **Automatic Handling**: 0x API includes Permit2 signature in response
3. **Settler Contract**: The `transaction.to` address is the Settler contract that handles Permit2 verification and swap execution

## Smart Wallet Integration

The hook is designed to work with Privy Smart Wallets:

1. **Automatic Gas Sponsorship**: If Paymaster is configured in Privy Dashboard, swaps will be gasless
2. **Batch Support**: Can be combined with other operations in a single UserOperation
3. **Error Handling**: Includes retry logic and timeout handling

## Advantages over Direct DEX Integration

1. **Better Prices**: Aggregates liquidity from multiple sources
2. **Simpler Integration**: Single API call vs complex DEX interactions
3. **Permit2 Built-in**: No need to manually handle Permit2 approvals
4. **Cross-DEX Routing**: Automatically finds best route across DEXs

## Error Handling (v2)

v2 API provides enhanced error handling with `issues` array:

### Common Errors

- **"0x API v2 error: Insufficient liquidity"**: Not enough liquidity for the swap amount
- **"0x API v2 error: Slippage tolerance exceeded"**: Price moved too much, increase slippage
- **"0x API v2 error: Insufficient allowance"**: Token allowance is insufficient (check Permit2 approval)
- **"0x API v2 error: Insufficient balance"**: User doesn't have enough tokens
- **"0x API key not configured"**: Add `ZEROX_API_KEY` (server-side only, not NEXT_PUBLIC) to `.env.local` or Vercel environment variables

### Issues Array

v2 API returns an `issues` array with detailed error information:

\`\`\`typescript
{
  issues: [
    {
      type: "INSUFFICIENT_ALLOWANCE",
      reason: "Token allowance is insufficient",
      severity: "error"
    }
  ]
}
\`\`\`

The hook automatically checks for errors in the `issues` array and throws appropriate errors.

## Rate Limits

0x API has rate limits based on your plan:
- Free tier: Limited requests per minute
- Paid plans: Higher rate limits

Check your usage at [0x Dashboard](https://dashboard.0x.org)

## References

- [0x Swap API v2 Documentation](https://0x.org/docs/api/swap-v2)
- [Upgrading to 0x API v2](https://0x.org/docs/upgrading/upgrading_to_swap_v2)
- [0x Dashboard](https://dashboard.0x.org)
- [Permit2 Documentation](https://docs.uniswap.org/contracts/permit2/overview)
