# Automated Bumping System - Complete Implementation Guide

## Overview

FarBump's automated bumping system implements a **hybrid client-server architecture** for continuous, gasless token swaps across 5 bot wallets. This guide explains the complete implementation, architecture, and how all components work together.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTOMATED BUMPING FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  STEP 1: HYBRID FUNDING (Client-Side)                           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ User clicks "Start Bumping"                             │    │
│  │ ↓                                                        │    │
│  │ Frontend calls /api/bot/mass-fund                       │    │
│  │ ↓                                                        │    │
│  │ Calculate distribution (Total ETH / 5)                  │    │
│  │ ↓                                                        │    │
│  │ Execute batch transfer via Privy Smart Wallet           │    │
│  │ smartWalletClient.sendTransaction({ calls: [...] })     │    │
│  │ ↓                                                        │    │
│  │ Log: [System] Funding 5 bots with total X ETH...       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
│  STEP 2: START SESSION (Server-Side)                            │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Create bot_sessions record                              │    │
│  │ - status: "running"                                     │    │
│  │ - token_address: Target token                           │    │
│  │ - amount_usd: $0.01 (minimum)                          │    │
│  │ - interval_seconds: User-defined                        │    │
│  │ - wallet_rotation_index: 0 (start with Bot #1)         │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
│  STEP 3: CONTINUOUS ROUND-ROBIN SWAP (Server-Side Loop)        │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Trigger /api/bot/continuous-swap (non-blocking)         │    │
│  │ ↓                                                        │    │
│  │ LOOP:                                                    │    │
│  │   1. Get current wallet_rotation_index (0-4)            │    │
│  │   2. Call /api/bot/execute-swap for current wallet      │    │
│  │   3. Check balance >= $0.01 USD                         │    │
│  │   4. Execute swap via Coinbase Paymaster (gasless)      │    │
│  │   5. Log: [Bot #X] Swapping $0.01 for Token...         │    │
│  │   6. Log: [System] Remaining balance in Bot #X...       │    │
│  │   7. Rotate index: (index + 1) % 5                      │    │
│  │   8. Wait interval_seconds                              │    │
│  │   9. Repeat until all wallets < $0.01 USD               │    │
│  │ ↓                                                        │    │
│  │ Log: [System] All bot balances below $0.01...           │    │
│  │ Stop session                                             │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Hybrid Funding & Looping

#### Client-Side (Dashboard - `app/page.tsx`)

**When "Start Bumping" is clicked:**

```typescript
// STEP 1: Mass Funding
const fundResponse = await fetch("/api/bot/mass-fund", {
  method: "POST",
  body: JSON.stringify({ userAddress: privySmartWalletAddress }),
})
const fundData = await fundResponse.json()

// Execute batch transfer using Privy Smart Wallet
const batchCalls = fundData.transfers.map(transfer => ({
  to: transfer.to,
  data: "0x",
  value: BigInt(transfer.value),
}))

const fundingTxHash = await smartWalletClient.sendTransaction({
  calls: batchCalls, // Batch transfer to 5 bot wallets
})

// Wait for confirmation
await publicClient.waitForTransactionReceipt({ hash: fundingTxHash })
```

**Key Features:**
- ✅ Uses Privy Smart Wallet with Paymaster (gasless for main wallet)
- ✅ Sends entire available ETH credit to 5 bot wallets
- ✅ Divides equally: `Total ETH / 5`
- ✅ Reserves 0.01 USD worth of ETH for gas safety
- ✅ Logs each transfer: `[System] Mengirim X ETH ($Y) ke Bot #Z... Berhasil`

#### Server-Side (API - `app/api/bot/continuous-swap/route.ts`)

**Continuous Loop Logic:**

```typescript
let currentRotationIndex = session.wallet_rotation_index || 0

while (true) {
  // Check if session is still running
  const { data: currentSession } = await supabase
    .from("bot_sessions")
    .select("status")
    .eq("id", session.id)
    .single()

  if (currentSession?.status !== "running") break

  // Execute swap for current wallet
  const swapResponse = await fetch("/api/bot/execute-swap", {
    method: "POST",
    body: JSON.stringify({
      userAddress,
      walletIndex: currentRotationIndex,
    }),
  })

  const swapResult = await swapResponse.json()

  if (swapResult.stopped) {
    // All wallets depleted
    break
  }

  if (swapResult.skipped) {
    // Wallet has insufficient balance, skip to next
    currentRotationIndex = (currentRotationIndex + 1) % 5
    continue
  }

  // Rotate to next wallet (round-robin)
  currentRotationIndex = (currentRotationIndex + 1) % 5

  // Wait for interval before next swap
  await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000))
}
```

**Key Features:**
- ✅ Runs perpetually until all wallets < $0.01 USD
- ✅ Round-robin rotation: 0 → 1 → 2 → 3 → 4 → 0
- ✅ Skips wallets with insufficient balance
- ✅ Stops when all 5 wallets are depleted
- ✅ Respects user-defined interval (Bump Speed)
- ✅ Handles consecutive failures (max 5)

### 2. Continuous Round-Robin Swap

#### Execute Swap API (`app/api/bot/execute-swap/route.ts`)

**Swap Execution Flow:**

```typescript
// 1. Fetch active session and wallet_rotation_index
const { data: activeSession } = await supabase
  .from("bot_sessions")
  .select("token_address, amount_usd, wallet_rotation_index, id")
  .eq("user_address", normalizedUserAddress)
  .eq("status", "running")
  .single()

// 2. Get bot wallet from database
const { data: botWallet } = await supabase
  .from("wallets_data")
  .select("smart_account_address, owner_private_key")
  .eq("user_address", normalizedUserAddress)
  .eq("wallet_index", walletIndex)
  .single()

// 3. Check balance >= $0.01 USD
const botWalletBalance = await publicClient.getBalance({
  address: botWallet.smart_account_address,
})

const MIN_AMOUNT_USD = 0.01
const minAmountWei = BigInt(Math.floor((MIN_AMOUNT_USD / ethPriceUsd) * 1e18))

if (botWalletBalance < minAmountWei) {
  // Skip this wallet
  return NextResponse.json({ skipped: true }, { status: 200 })
}

// 4. Decrypt private key (server-side only)
const ownerPrivateKey = decryptPrivateKey(botWallet.owner_private_key)

// 5. Create Smart Account
const account = await toSimpleSmartAccount({
  client: publicClient,
  signer: privateKeyToAccount(ownerPrivateKey),
  entryPoint: {
    address: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    version: "0.6",
  },
  factoryAddress: "0x9406Cc6185a346906296840746125a0E44976454", // SimpleAccountFactory
  index: BigInt(walletIndex),
})

// 6. Get 0x API v2 quote
const quote = await fetch(`https://api.0x.org/swap/v2/quote?${queryParams}`)

// 7. Create Bundler Client with Paymaster
const bundlerClient = createBundlerClient({
  account,
  transport: http(process.env.COINBASE_CDP_BUNDLER_URL),
  chain: base,
})

// 8. Execute swap with Paymaster sponsorship (gasless)
const userOpHash = await bundlerClient.sendUserOperation({
  account,
  calls: [swapCall],
  paymaster: true, // Enable Coinbase Paymaster
})

// 9. Wait for confirmation
const userOpReceipt = await bundlerClient.waitForUserOperationReceipt({
  hash: userOpHash,
})

// 10. Update wallet_rotation_index for round-robin
const nextRotationIndex = (currentRotationIndex + 1) % 5
await supabase
  .from("bot_sessions")
  .update({ wallet_rotation_index: nextRotationIndex })
  .eq("id", sessionId)
```

**Key Features:**
- ✅ Fetches token_address and amount_usd from database (prevents client manipulation)
- ✅ Checks balance before swap (skips if < $0.01 USD)
- ✅ Decrypts private key server-side only
- ✅ Uses Coinbase Paymaster for gasless execution
- ✅ Updates wallet_rotation_index after each swap
- ✅ Logs all activities to bot_logs

### 3. Micro-Transaction Support ($0.01)

#### High Precision USD to ETH Conversion

```typescript
const MIN_AMOUNT_USD = 0.01

// Fetch real-time ETH price from CoinGecko
const ethPriceUsd = await fetchEthPrice()

// Convert USD to ETH with high precision
const amountEth = MIN_AMOUNT_USD / ethPriceUsd

// Convert to Wei using BigInt (18 decimals)
// Use Math.floor for safe rounding to avoid precision errors
const minAmountWei = BigInt(Math.floor(amountEth * 1e18))
```

**Key Features:**
- ✅ Real-time ETH price fetching from CoinGecko
- ✅ 18 decimal precision for Wei conversion
- ✅ Safe rounding using `Math.floor()`
- ✅ Prevents "dust" errors in micro-transactions

#### 0x API v2 Configuration

```typescript
const queryParams = new URLSearchParams({
  chainId: "8453",
  sellToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", // Native ETH
  buyToken: tokenAddress,
  sellAmount: actualSellAmountWei.toString(),
  taker: botWalletAddress,
  slippagePercentage: "1", // 1% slippage (compatible with $0.01 trades)
  enablePermit2: "true",
  intentOnFill: "true",
  enableSlippageProtection: "false",
})
```

**Key Features:**
- ✅ 1% slippage tolerance (compatible with small trades)
- ✅ Permit2 enabled for efficient approvals
- ✅ Slippage protection disabled (better for bot trades)

### 4. Gasless Execution (Coinbase Paymaster)

#### Factory-Based Sponsorship

**SimpleAccountFactory Address:**
```
0x9406Cc6185a346906296840746125a0E44976454
```

**All bot wallets are created by this factory, ensuring automatic sponsorship.**

#### Paymaster Configuration

```typescript
// Create Bundler Client with Paymaster
const bundlerClient = createBundlerClient({
  account,
  client: publicClient,
  transport: http(process.env.COINBASE_CDP_BUNDLER_URL),
  chain: base,
})

// Execute with Paymaster sponsorship
await bundlerClient.sendUserOperation({
  account,
  calls: [swapCall],
  paymaster: true, // Enable Coinbase Paymaster
})
```

**Key Features:**
- ✅ Uses `COINBASE_CDP_BUNDLER_URL` environment variable
- ✅ Factory-based sponsorship (no address allowlist needed)
- ✅ Gasless for all bot wallet swaps
- ✅ Main wallet funding also gasless (via Privy Paymaster)

#### 2x preVerificationGas Multiplier

```typescript
// Pad preVerificationGas for reliability (2x multiplier)
if (account && typeof account === 'object' && 'userOperation' in account) {
  (account as any).userOperation = {
    estimateGas: async (userOperation: any) => {
      const estimate = await bundlerClient.estimateUserOperationGas({
        account,
        ...userOperation,
      })
      // Adjust preVerificationGas upward for reliability (2x)
      return {
        ...estimate,
        preVerificationGas: estimate.preVerificationGas * BigInt(2),
      }
    },
  }
}
```

**Key Features:**
- ✅ 2x multiplier ensures transactions land on-chain during congestion
- ✅ Prevents UserOperation failures due to insufficient gas
- ✅ Recommended by Coinbase CDP Paymaster tutorial

### 5. Live Activity & UI Sync

#### Log Message Formats

All operations are logged to `bot_logs` table with these formats:

**Funding:**
```
[System] Funding 5 bots with total 0.05 ETH ($150.00)... Success
```

**Individual Wallet Funding:**
```
[System] Mengirim 0.01 ETH ($30.00) ke Bot #1... Berhasil
```

**Swap Execution:**
```
[Bot #1] Swapping $0.01 for Target Token... [View on BaseScan]
```

**Remaining Balance:**
```
[System] Remaining balance in Bot #1: 0.004 ETH ($12.00)
```

**Insufficient Balance:**
```
[System] Saldo Bot #1 tidak cukup ($0.005 < $0.01). Bumping dihentikan.
```

**All Wallets Depleted:**
```
[System] All bot balances below $0.01. Bumping session completed.
```

#### UI Updates

**Button Logic:**

```typescript
// Show "Start Bumping" only when 5 wallets exist
const hasBotWallets = existingBotWallets?.length === 5

const getButtonText = () => {
  if (isActive) return "Stop Bumping"
  if (!hasCredit) return "No Fuel Detected"
  if (!hasBotWallets) return "Generate Bot Wallet"
  return "Start Bumping"
}
```

**Auto-Switch to Live Activity Tab:**

```typescript
// After funding completes, switch to Live Activity tab
setActiveTab("activity")
```

**Key Features:**
- ✅ Button shows "Start Bumping" (green) only when 5 wallets exist
- ✅ Auto-switches to Live Activity tab after Start Bumping
- ✅ Real-time log updates via Supabase Realtime
- ✅ Auto-scrolls to latest log entry

### 6. Robustness

#### Error Handling

**Consecutive Failure Limit:**

```typescript
const MAX_CONSECUTIVE_FAILURES = 5

if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
  // Log system error
  await supabase.from("bot_logs").insert({
    user_address: normalizedUserAddress,
    message: `[System] Continuous swap loop stopped due to ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`,
    status: "failed",
  })

  // Stop session
  await supabase
    .from("bot_sessions")
    .update({ status: "stopped" })
    .eq("id", session.id)

  break
}
```

#### Security

**Private Key Handling:**

```typescript
// ✅ Private keys are encrypted in database (AES-256-GCM)
// ✅ Decryption only happens server-side in API routes
// ✅ Private keys are NEVER sent to client
// ✅ All signing happens server-side

const ownerPrivateKey = decryptPrivateKey(botWallet.owner_private_key)
const ownerAccount = privateKeyToAccount(ownerPrivateKey)
```

**Database Security:**

```typescript
// ✅ All queries use user_address (wallet address) as identifier
// ✅ No Supabase Auth - wallet-based authentication only
// ✅ RLS policies enforce user_address matching
```

---

## Configuration Checklist

### Required Environment Variables

```bash
# Coinbase CDP Bundler URL (REQUIRED for bot wallet swaps)
COINBASE_CDP_BUNDLER_URL=https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY

# Base RPC URL
NEXT_PUBLIC_BASE_RPC_URL=https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY

# 0x API Key (for swap quotes)
ZEROX_API_KEY=your-0x-api-key

# CoinGecko API Key (for ETH price)
COINGECKO_API_KEY=your-coingecko-api-key
```

### Paymaster Configuration

**Option 1: Coinbase CDP Dashboard (Recommended)**

1. Go to: https://portal.cdp.coinbase.com/
2. Navigate to: Onchain Tools → Paymaster → Settings
3. Set Policy: **Factory Allowlist**
4. Add Factory: `0x9406Cc6185a346906296840746125a0E44976454`
5. Enable billing

**Option 2: Privy Dashboard (for Main Wallet)**

1. Go to: https://dashboard.privy.io
2. Settings → Wallets → Smart Wallets → Paymaster
3. Select: Coinbase CDP Paymaster
4. Enter your Paymaster URL
5. Save

---

## Testing Checklist

### End-to-End Flow

1. ✅ **Generate 5 Bot Wallets**
   - Click "Generate Bot Wallet"
   - Wait for confirmation
   - Verify 5 wallets created in database
   - Button should change to "Start Bumping"

2. ✅ **Mass Funding**
   - Click "Start Bumping"
   - Verify batch transfer to 5 wallets
   - Check Live Activity for funding logs
   - Confirm transaction on BaseScan

3. ✅ **Continuous Swapping**
   - Verify first swap executes immediately
   - Check round-robin rotation (Bot #1 → #2 → #3 → #4 → #5 → #1)
   - Monitor Live Activity for swap logs
   - Verify remaining balance logs after each swap

4. ✅ **Depletion & Stop**
   - Wait for all wallets to deplete (< $0.01 USD)
   - Verify session stops automatically
   - Check final log: "All bot balances below $0.01..."

5. ✅ **Manual Stop**
   - Click "Stop Bumping" during active session
   - Verify session stops immediately
   - Check logs for stop message

---

## Troubleshooting

### Issue: "COINBASE_CDP_BUNDLER_URL environment variable is not set"

**Solution:**
Add to `.env.local`:
```bash
COINBASE_CDP_BUNDLER_URL=https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY
```

### Issue: "Paymaster rejected UserOperation"

**Solution:**
1. Verify factory address `0x9406Cc6185a346906296840746125a0E44976454` is in allowlist
2. OR set policy to "Sponsor All Transactions"
3. Ensure billing is enabled in CDP Dashboard

### Issue: "All bot wallets have insufficient balance"

**Solution:**
1. Check main wallet credit balance (must be >= $0.05 for 5 wallets)
2. Verify funding transaction completed successfully
3. Check individual bot wallet balances on BaseScan

### Issue: "Continuous swap loop not starting"

**Solution:**
1. Check browser console for errors
2. Verify session status is "running" in database
3. Check API route logs for errors
4. Ensure `NEXT_PUBLIC_APP_URL` is set correctly

---

## Summary

✅ **All 6 requirements implemented:**

1. ✅ **Hybrid Funding & Looping** - Client-side funding, server-side loop
2. ✅ **Continuous Round-Robin Swap** - Perpetual loop until all wallets < $0.01
3. ✅ **Micro-Transaction Support** - 0.01 USD minimum with high precision
4. ✅ **Gasless Execution** - Coinbase Paymaster with factory-based sponsorship
5. ✅ **Live Activity & UI Sync** - Real-time logs and auto-tab switching
6. ✅ **Robustness** - 2x preVerificationGas, secure private key handling

**Global Feed tab removed from dashboard** ✅

---

## Next Steps

1. Add `COINBASE_CDP_BUNDLER_URL` to production `.env`
2. Configure Paymaster policy (factory-based)
3. Test end-to-end flow
4. Monitor costs and adjust as needed
5. Consider adding analytics dashboard for bot performance

---

## References

- [Coinbase CDP Paymaster Docs](https://docs.cdp.coinbase.com/paymaster/docs/welcome)
- [ERC-4337 Specification](https://eips.ethereum.org/EIPS/eip-4337)
- [Viem Account Abstraction](https://viem.sh/account-abstraction)
- [0x API v2 Documentation](https://docs.0x.org/docs/api/swap-v2)
- [Privy Smart Wallets](https://docs.privy.io/guide/react/wallets/smart-wallets)






