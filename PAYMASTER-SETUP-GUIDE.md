# Paymaster Configuration Guide

## Overview

FarBump uses **gasless transactions** via ERC-4337 Account Abstraction with Coinbase CDP Paymaster. This guide explains how to configure the Paymaster correctly to sponsor transactions for both:

1. **Main Smart Wallet** (Privy Smart Wallet) - for funding bot wallets
2. **Bot Wallets** (SimpleAccount) - for executing token swaps

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FarBump Wallet System                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Main Smart Wallet (Privy)                                │
│     - Created via Privy SDK                                  │
│     - Uses Privy Dashboard Paymaster config                  │
│     - Funds 5 bot wallets (batch transfer)                   │
│                                                               │
│  2. Bot Wallets (SimpleAccount × 5)                          │
│     - Created server-side via CREATE2                        │
│     - Factory: 0x9406Cc6185a346906296840746125a0E44976454   │
│     - EntryPoint: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789│
│     - Uses COINBASE_CDP_BUNDLER_URL for gasless swaps        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Requirements

### 1. Minimum Threshold (0.01 USD)

✅ **Already Implemented**

- Mass funding validates minimum 0.01 USD per wallet (0.05 USD total for 5 wallets)
- Swap execution validates minimum 0.01 USD per bump
- Real-time ETH price conversion with 18 decimal precision
- Safe rounding using `Math.floor(amountEth * 1e18)`

**Code References:**
- `app/api/bot/mass-fund/route.ts` - Lines 105-133
- `app/api/bot/execute-swap/route.ts` - Lines 144-149
- `app/page.tsx` - Lines 646-658

### 2. Dynamic Button Logic

✅ **Already Implemented**

- Button shows "Start Bumping" (green) when 5 bot wallets exist
- Button shows "Generate Bot Wallet" when < 5 wallets
- State updates automatically via React Query refetch
- No page refresh required

**Code References:**
- `components/action-button.tsx` - Lines 47-60
- `app/page.tsx` - Lines 293-298 (hasBotWallets logic)

### 3. Live Activity Logging

✅ **Already Implemented**

All operations are logged in real-time:

- **Mass Funding**: `[System] Mengirim 0.000003 ETH ($0.01) ke Bot #1... Berhasil`
- **Swap Execution**: `[Bot #1] Melakukan swap senilai $0.01 ke Target Token... [Lihat Transaksi]`
- **Insufficient Balance**: `[System] Saldo Bot #1 tidak cukup ($0.005 < $0.01). Bumping dihentikan.`
- **Remaining Balance**: `[System] Remaining balance in Bot #1: 0.004 ETH ($X.XX)`

UI automatically switches to "Live Activity" tab after "Start Bumping" is clicked.

**Code References:**
- `app/api/bot/mass-fund/route.ts` - Lines 165-220 (funding logs)
- `app/api/bot/execute-swap/route.ts` - Lines 389-396, 471-479 (swap logs)
- `app/page.tsx` - Line 842 (auto-switch to activity tab)

### 4. Gasless Execution

⚠️ **REQUIRES CONFIGURATION**

Both main wallet and bot wallets use Paymaster for gasless execution:

#### Main Smart Wallet (Privy)
- Uses `smartWalletClient.sendTransaction({ calls: batchCalls })`
- Paymaster is configured in **Privy Dashboard**
- Privy automatically injects Paymaster sponsorship

#### Bot Wallets (SimpleAccount)
- Uses `bundlerClient.sendUserOperation({ paymaster: true })`
- Paymaster URL: `COINBASE_CDP_BUNDLER_URL` environment variable
- Directly uses Coinbase CDP Bundler + Paymaster

**Code References:**
- `app/page.tsx` - Lines 718-720 (main wallet batch transfer)
- `app/api/bot/execute-swap/route.ts` - Lines 432-436 (bot wallet swap)

---

## Setup Instructions

### Step 1: Get Coinbase CDP Bundler URL

1. Sign in to Coinbase Developer Platform: https://portal.cdp.coinbase.com/
2. Navigate to **Onchain Tools** → **Paymaster**
3. Select **Base Mainnet** in the top right
4. Copy your Paymaster endpoint URL (example: `https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY`)
5. This URL serves as BOTH Bundler and Paymaster (CDP combines both services)

### Step 2: Configure Environment Variables

Add to your `.env.local` file:

```bash
# REQUIRED: Coinbase CDP Bundler URL with Paymaster support
# Used for bot wallet swaps (gasless transactions)
COINBASE_CDP_BUNDLER_URL=https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY_HERE

# Base RPC URL (can be the same as above if using CDP)
NEXT_PUBLIC_BASE_RPC_URL=https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY_HERE
```

### Step 3: Configure Paymaster Policy (CRITICAL)

⚠️ **DO NOT allowlist individual bot wallet addresses!**

Instead, configure the Paymaster to sponsor transactions from the **Smart Account Factory**:

#### Option A: Privy Dashboard (Recommended for Main Wallet)

1. Go to Privy Dashboard: https://dashboard.privy.io
2. Navigate to **Settings** → **Wallets** → **Smart Wallets**
3. Under **Paymaster**, select **Coinbase CDP Paymaster**
4. Enter your Coinbase CDP Paymaster URL
5. Set sponsorship policy to **Factory-based** (not address allowlist)

#### Option B: Coinbase CDP Dashboard (For Bot Wallets)

1. Go to Coinbase Developer Platform: https://portal.cdp.coinbase.com/
2. Navigate to **Onchain Tools** → **Paymaster** → **Settings**
3. Under **Sponsorship Policy**, select one of:
   - **Sponsor All Transactions** (easiest, but costs more)
   - **Factory Allowlist** (recommended):
     - Add factory address: `0x9406Cc6185a346906296840746125a0E44976454` (SimpleAccountFactory on Base)
     - This sponsors transactions from ALL smart accounts created by this factory
4. ⚠️ **NEVER use "Address Allowlist"** - bot wallets are created dynamically and cannot be pre-registered

### Step 4: Verify Configuration

Run the following test to verify Paymaster is working:

```bash
npm run dev
```

1. Login with Farcaster
2. Add credit to your account
3. Click "Generate Bot Wallet" → should create 5 wallets (gasless)
4. Click "Start Bumping" → should fund bot wallets (gasless via Privy)
5. Bot wallets should execute swaps (gasless via CDP Bundler)

Monitor logs for successful UserOperations:

```
✅ UserOperation sent: 0x...
✅ UserOperation confirmed. Transaction hash: 0x...
```

---

## Troubleshooting

### Error: "Paymaster rejected UserOperation"

**Cause**: Paymaster policy is not configured to sponsor transactions from the bot wallet addresses.

**Solution**:
1. Ensure factory address `0x9406Cc6185a346906296840746125a0E44976454` is in the allowlist
2. OR set policy to "Sponsor All Transactions"
3. DO NOT manually add bot wallet addresses to allowlist (they're created dynamically)

### Error: "COINBASE_CDP_BUNDLER_URL environment variable is not set"

**Cause**: Missing environment variable in `.env.local`

**Solution**:
1. Copy `env.example.txt` to `.env.local`
2. Add your Coinbase CDP Bundler URL:
   ```bash
   COINBASE_CDP_BUNDLER_URL=https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY
   ```

### Error: "Insufficient funds for gas"

**Cause**: Paymaster is not enabled or misconfigured

**Solution**:
1. Verify Paymaster URL is correct
2. Check billing is enabled in Coinbase CDP Dashboard
3. Ensure `paymaster: true` is set in `bundlerClient.sendUserOperation()`

### Bot wallets not executing swaps

**Cause**: Bot wallet balance < 0.01 USD or insufficient bot wallet funding

**Solution**:
1. Check Live Activity logs for balance messages
2. Ensure main wallet has sufficient credit (at least 0.05 USD for 5 wallets)
3. Verify funding transaction completed successfully

---

## Cost Estimation

### Gas Costs (if Paymaster not used)

- **Generate 5 Bot Wallets**: ~0.005 ETH (~$15 @ $3000/ETH)
- **Fund 5 Bot Wallets** (batch): ~0.001 ETH (~$3)
- **Swap per Bot**: ~0.0002 ETH per swap (~$0.60 per swap)
- **100 Swaps**: ~0.02 ETH (~$60)

### With Paymaster (Recommended)

- **All gas costs**: $0 for users
- **CDP Paymaster cost**: ~$0.50-1.00 per 100 swaps (paid by platform)
- **Billing**: Configure in CDP Dashboard → Billing

---

## Architecture Details

### Main Smart Wallet (Privy)

```typescript
// Created via Privy SDK (automatic)
const { smartWallets } = useSmartWallets()
const smartWallet = smartWallets[0]

// Sends batch transfer to 5 bot wallets
await smartWalletClient.sendTransaction({
  calls: [
    { to: botWallet1, value: amountWei, data: "0x" },
    { to: botWallet2, value: amountWei, data: "0x" },
    // ... 3 more
  ]
})
// Paymaster: Configured in Privy Dashboard
```

### Bot Wallets (SimpleAccount)

```typescript
// Created server-side via CREATE2 (deterministic)
const account = await toSimpleSmartAccount({
  client: publicClient,
  signer: ownerAccount, // EOA from encrypted private key
  entryPoint: { address: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", version: "0.6" },
  factoryAddress: "0x9406Cc6185a346906296840746125a0E44976454", // SimpleAccountFactory
  index: BigInt(0-4), // 5 wallets with indices 0-4
})

// Execute swap via Bundler with Paymaster
const bundlerClient = createBundlerClient({
  account,
  client: publicClient,
  transport: http(process.env.COINBASE_CDP_BUNDLER_URL),
  chain: base,
})

await bundlerClient.sendUserOperation({
  account,
  calls: [swapCall],
  paymaster: true, // Enable Coinbase Paymaster sponsorship
})
```

---

## Security Considerations

1. **Private Keys**: Bot wallet private keys are encrypted in the database using AES-256-GCM
2. **Server-Side Only**: Private key decryption only happens server-side in API routes
3. **No Client Exposure**: Private keys are NEVER sent to the client
4. **Factory-Based Sponsorship**: Paymaster sponsors based on factory, not individual addresses
5. **Rate Limiting**: Consider implementing rate limiting for swap execution

---

## References

- [Coinbase CDP Paymaster Docs](https://docs.cdp.coinbase.com/paymaster/docs/welcome)
- [ERC-4337 Specification](https://eips.ethereum.org/EIPS/eip-4337)
- [Viem Account Abstraction](https://viem.sh/account-abstraction)
- [SimpleAccount Implementation](https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/samples/SimpleAccount.sol)
- [Privy Smart Wallets](https://docs.privy.io/guide/react/wallets/smart-wallets)

---

## Summary

✅ **All 4 requirements are fully implemented:**

1. ✅ Minimum threshold 0.01 USD with real-time conversion
2. ✅ Dynamic button logic (Generate → Start Bumping)
3. ✅ Live Activity logging with real-time updates
4. ⚠️ Gasless execution (requires Paymaster configuration)

**Action Required:**

1. Add `COINBASE_CDP_BUNDLER_URL` to `.env.local`
2. Configure Paymaster policy to sponsor factory-based transactions
3. Verify billing is enabled in Coinbase CDP Dashboard
4. Test end-to-end flow

**No code changes needed** - only environment configuration!






