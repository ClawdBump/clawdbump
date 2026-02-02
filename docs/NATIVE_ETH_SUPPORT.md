# Native ETH Support Implementation

**Date:** February 3, 2026  
**Status:** 🟡 **PARTIALLY IMPLEMENTED** (Distribution ready, Swap pending)

---

## Overview

ClawdBump now supports **Native ETH AND WETH** for bot wallet distribution and swaps. This provides more flexibility and can save gas costs by avoiding unnecessary ETH ↔ WETH conversions.

### Benefits:
- ✅ **Flexibility**: Bot wallets can receive Native ETH or WETH
- ✅ **Gas Savings**: No need to convert ETH to WETH if using Native ETH for swaps
- ✅ **Faster Distribution**: Direct Native ETH transfers (no WETH contract interaction)
- ✅ **0x API Support**: 0x API supports both Native ETH (`0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`) and WETH for swaps

---

## Implementation Status

### ✅ Completed

#### 1. Database Schema (✅ DONE)
**File:** `scripts/add-native-eth-support.sql`

Added `native_eth_balance_wei` column to `bot_wallet_credits` table:

```sql
ALTER TABLE bot_wallet_credits
ADD COLUMN IF NOT EXISTS native_eth_balance_wei TEXT NOT NULL DEFAULT '0';
```

**To Apply:**
1. Open Supabase SQL Editor
2. Run `scripts/add-native-eth-support.sql`
3. Verify column exists:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'bot_wallet_credits';
   ```

---

#### 2. Distribution Hook (✅ DONE)
**File:** `hooks/use-distribute-credits.ts`

**New Parameter:**
```typescript
interface DistributeCreditsParams {
  userAddress: Address
  botWallets: BotWallet[]
  creditBalanceWei: bigint
  preferNativeEth?: boolean // NEW: If true, distribute Native ETH instead of WETH
}
```

**Usage:**
```typescript
// Distribute as WETH (legacy, default)
await distributeCredits({
  userAddress,
  botWallets,
  creditBalanceWei,
  preferNativeEth: false, // or omit (default false)
})

// Distribute as Native ETH (NEW)
await distributeCredits({
  userAddress,
  botWallets,
  creditBalanceWei,
  preferNativeEth: true, // NEW
})
```

**What It Does:**
- If `preferNativeEth = false` (default):
  - Convert Native ETH to WETH if needed
  - Transfer WETH to bot wallets (ERC20 transfer)
  - Record as `weth_balance_wei` in database
- If `preferNativeEth = true`:
  - Transfer Native ETH directly to bot wallets (value transfer)
  - Record as `native_eth_balance_wei` in database
  - No WETH conversion needed

---

#### 3. Record Distribution API (✅ DONE)
**File:** `app/api/bot/record-distribution/route.ts`

**New Request Body:**
```typescript
{
  userAddress: string
  distributions: Array<{
    botWalletAddress: string
    amountWei: string // Total amount
    nativeEthAmountWei?: string // NEW: Native ETH amount
    wethAmountWei?: string // WETH amount
  }>
  txHash: string
}
```

**Database Updates:**
```typescript
// For each bot wallet:
UPDATE bot_wallet_credits
SET 
  native_eth_balance_wei = native_eth_balance_wei + nativeEthAmountWei,
  weth_balance_wei = weth_balance_wei + wethAmountWei,
  updated_at = NOW()
WHERE user_address = user AND bot_wallet_address = bot

// Deduct from main wallet:
UPDATE user_credits
SET balance_wei = balance_wei - (total_native_eth + total_weth)
WHERE user_address = user
```

---

### 🟡 Pending (Requires Implementation)

#### 4. Execute Swap API (🟡 PENDING)
**File:** `app/api/bot/execute-swap/route.ts`

**Current Behavior:**
- Only checks WETH balance
- Only uses WETH for swaps (sellToken = WETH address)
- Only deducts from `weth_balance_wei`

**Required Changes:**

**Step 1: Check BOTH Native ETH and WETH Balance**
```typescript
// Current (lines ~390-402):
const wethBalanceWei = await publicClient.readContract({
  address: WETH_ADDRESS,
  abi: WETH_ABI,
  functionName: "balanceOf",
  args: [smartAccountAddress],
})

// NEW: Also check Native ETH
const nativeEthBalance = await publicClient.getBalance({
  address: smartAccountAddress as Address,
})

const totalAvailableBalance = nativeEthBalance + wethBalanceWei
console.log(`   Native ETH: ${formatEther(nativeEthBalance)} ETH`)
console.log(`   WETH: ${formatEther(wethBalanceWei)} WETH`)
console.log(`   Total: ${formatEther(totalAvailableBalance)} ETH`)
```

**Step 2: Decide Which Asset to Use for Swap**
```typescript
// Prefer Native ETH if available (faster, no approval needed)
let useNativeEth = false
let sellTokenAddress: string

if (nativeEthBalance >= amountWei) {
  useNativeEth = true
  sellTokenAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" // 0x API Native ETH address
  console.log(`   → Using Native ETH for swap (${formatEther(amountWei)} ETH)`)
} else if (wethBalanceWei >= amountWei) {
  useNativeEth = false
  sellTokenAddress = WETH_ADDRESS
  console.log(`   → Using WETH for swap (${formatEther(amountWei)} WETH)`)
} else {
  // Try to convert Native ETH to WETH if we have enough Native ETH
  if (nativeEthBalance >= amountWei) {
    console.log(`   → Converting ${formatEther(amountWei)} Native ETH to WETH...`)
    // ... existing ETH to WETH conversion logic ...
    useNativeEth = false
    sellTokenAddress = WETH_ADDRESS
  } else {
    throw new Error(`Insufficient balance: Need ${formatEther(amountWei)} ETH, have ${formatEther(totalAvailableBalance)} ETH`)
  }
}
```

**Step 3: Get Quote with Correct sellToken**
```typescript
// Current (lines ~800-830):
const quoteParams = new URLSearchParams({
  chainId: "8453",
  sellToken: WETH_ADDRESS, // CHANGE THIS
  buyToken: token_address,
  sellAmount: amountWei.toString(),
  taker: smartAccountAddress,
  // ... other params ...
})

// NEW:
const quoteParams = new URLSearchParams({
  chainId: "8453",
  sellToken: sellTokenAddress, // Use Native ETH or WETH
  buyToken: token_address,
  sellAmount: amountWei.toString(),
  taker: smartAccountAddress,
  // ... other params ...
})
```

**Step 4: Skip Approval if Using Native ETH**
```typescript
// Current (lines ~900-1000): Always checks/approves WETH

// NEW:
if (useNativeEth) {
  console.log(`   ✅ Using Native ETH - no approval needed`)
} else {
  // ... existing WETH approval logic ...
}
```

**Step 5: Execute Swap with Correct Value**
```typescript
// Current (lines ~1200-1250):
const txHash = await ownerAccount.invokeContract({
  contractAddress: quote.transaction.to,
  method: "swap",
  args: {
    data: quote.transaction.data,
  },
  abi: [],
})

// NEW:
const txHash = await ownerAccount.invokeContract({
  contractAddress: quote.transaction.to,
  method: "swap",
  args: {
    data: quote.transaction.data,
    value: useNativeEth ? amountWei.toString() : "0", // Send ETH value if Native ETH
  },
  abi: [],
})
```

**Step 6: Deduct from Correct Balance in Database**
```typescript
// Current (lines ~1448-1508): Only deducts from weth_balance_wei

// NEW:
const { data: creditRecord, error: fetchCreditError } = await supabase
  .from("bot_wallet_credits")
  .select("id, native_eth_balance_wei, weth_balance_wei")
  .eq("user_address", user_address.toLowerCase())
  .eq("bot_wallet_address", smartAccountAddress.toLowerCase())
  .single()

if (!fetchCreditError && creditRecord) {
  if (useNativeEth) {
    // Deduct from native_eth_balance_wei
    const currentBalance = BigInt(creditRecord.native_eth_balance_wei || "0")
    const newBalance = currentBalance >= amountWei ? currentBalance - amountWei : BigInt(0)
    
    await supabase
      .from("bot_wallet_credits")
      .update({ 
        native_eth_balance_wei: newBalance.toString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", creditRecord.id)
    
    console.log(`   ✅ Native ETH balance deducted: ${formatEther(amountWei)} ETH`)
    console.log(`   → Remaining Native ETH: ${formatEther(newBalance)} ETH`)
  } else {
    // Deduct from weth_balance_wei (existing logic)
    const currentBalance = BigInt(creditRecord.weth_balance_wei || "0")
    const newBalance = currentBalance >= amountWei ? currentBalance - amountWei : BigInt(0)
    
    await supabase
      .from("bot_wallet_credits")
      .update({ 
        weth_balance_wei: newBalance.toString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", creditRecord.id)
    
    console.log(`   ✅ WETH balance deducted: ${formatEther(amountWei)} WETH`)
    console.log(`   → Remaining WETH: ${formatEther(newBalance)} WETH`)
  }
}
```

---

#### 5. Bumping Worker (🟡 PENDING)
**File:** `server/bumping-worker.ts`

**Current Behavior:**
- Only checks `weth_balance_wei` from database
- Only checks WETH balance on-chain

**Required Changes:**

**Step 1: Update `getBotWalletWethBalance` to `getBotWalletBalance`**
```typescript
// Current (lines ~118-131):
async function getBotWalletWethBalance(userAddress: string, botWalletAddress: string): Promise<bigint> {
  const { data, error } = await supabase
    .from("bot_wallet_credits")
    .select("weth_balance_wei")
    .eq("user_address", userAddress.toLowerCase())
    .eq("bot_wallet_address", botWalletAddress.toLowerCase())
    .single()
  
  return BigInt(data?.weth_balance_wei || "0")
}

// NEW:
async function getBotWalletBalance(userAddress: string, botWalletAddress: string): Promise<{ nativeEth: bigint, weth: bigint, total: bigint }> {
  const { data, error } = await supabase
    .from("bot_wallet_credits")
    .select("native_eth_balance_wei, weth_balance_wei")
    .eq("user_address", userAddress.toLowerCase())
    .eq("bot_wallet_address", botWalletAddress.toLowerCase())
    .single()
  
  const nativeEth = BigInt(data?.native_eth_balance_wei || "0")
  const weth = BigInt(data?.weth_balance_wei || "0")
  const total = nativeEth + weth
  
  return { nativeEth, weth, total }
}
```

**Step 2: Update `checkAllWalletsEmpty`**
```typescript
// Current (lines ~181-210): Only checks weth_balance_wei

// NEW:
async function checkAllWalletsEmpty(userAddress: string): Promise<boolean> {
  const botWallets = await getBotWallets(userAddress)
  const ethPriceUsd = await getEthPriceUsd()
  const MIN_BALANCE_USD = 0.01
  const minBalanceWei = parseEther((MIN_BALANCE_USD / ethPriceUsd).toString())
  
  let walletsWithSufficientBalance = 0
  
  for (const wallet of botWallets) {
    const { total } = await getBotWalletBalance(userAddress, wallet.smart_account_address)
    
    if (total >= minBalanceWei) {
      walletsWithSufficientBalance++
    }
  }
  
  return walletsWithSufficientBalance === 0
}
```

**Step 3: Update `processUserSwap`**
```typescript
// Current (lines ~348-489): Uses getBotWalletWethBalance

// NEW:
const { total: botWalletBalance } = await getBotWalletBalance(
  session.user_address,
  currentWallet.smart_account_address
)

if (botWalletBalance < requiredAmountWei) {
  console.warn(`Bot wallet ${currentWalletIndex + 1} insufficient balance`)
  // ... check all wallets empty ...
}
```

---

#### 6. Credit Balance API (🟡 PENDING)
**File:** `app/api/credit-balance/route.ts`

**Current Behavior:**
- Only sums `weth_balance_wei` from bot wallets

**Required Changes:**
```typescript
// Current (lines ~40-50):
const { data: botCreditsData } = await supabase
  .from("bot_wallet_credits")
  .select("weth_balance_wei")
  .eq("user_address", normalizedUserAddress)

const botWalletCreditsWei = botCreditsData?.reduce((sum, record) => {
  return sum + BigInt(record.weth_balance_wei || "0")
}, BigInt(0)) || BigInt(0)

// NEW:
const { data: botCreditsData } = await supabase
  .from("bot_wallet_credits")
  .select("native_eth_balance_wei, weth_balance_wei")
  .eq("user_address", normalizedUserAddress)

const botWalletCreditsWei = botCreditsData?.reduce((sum, record) => {
  const nativeEth = BigInt(record.native_eth_balance_wei || "0")
  const weth = BigInt(record.weth_balance_wei || "0")
  return sum + nativeEth + weth
}, BigInt(0)) || BigInt(0)
```

---

## Usage Examples

### Example 1: Distribute Native ETH (Recommended)
```typescript
// In app/page.tsx (handleToggle function)
await distributeCredits({
  userAddress: privySmartWalletAddress as `0x${string}`,
  botWallets: existingBotWallets,
  creditBalanceWei: actualMainWalletCreditWei,
  preferNativeEth: true, // NEW: Use Native ETH
})
```

**Result:**
- 5 bot wallets receive Native ETH directly
- Database: `native_eth_balance_wei` updated for each bot wallet
- Faster distribution (no WETH conversion)
- Bot can use Native ETH for swaps (0x API supports it)

---

### Example 2: Distribute WETH (Legacy)
```typescript
await distributeCredits({
  userAddress: privySmartWalletAddress as `0x${string}`,
  botWallets: existingBotWallets,
  creditBalanceWei: actualMainWalletCreditWei,
  preferNativeEth: false, // or omit (default)
})
```

**Result:**
- Native ETH converted to WETH (if needed)
- 5 bot wallets receive WETH (ERC20 transfer)
- Database: `weth_balance_wei` updated for each bot wallet
- Bot uses WETH for swaps (existing behavior)

---

## Testing Checklist

### ✅ Distribution Tests

- [ ] **Test 1: Native ETH Distribution**
  - User has 0.1 ETH credit
  - Call `distributeCredits` with `preferNativeEth: true`
  - Verify: 5 bot wallets receive ~0.02 ETH each (Native ETH)
  - Verify: Database `native_eth_balance_wei` updated correctly
  - Verify: Main wallet `user_credits.balance_wei` deducted

- [ ] **Test 2: WETH Distribution (Legacy)**
  - User has 0.1 ETH credit
  - Call `distributeCredits` with `preferNativeEth: false`
  - Verify: Native ETH converted to WETH
  - Verify: 5 bot wallets receive ~0.02 WETH each
  - Verify: Database `weth_balance_wei` updated correctly

- [ ] **Test 3: Mixed Balance**
  - Bot wallet has 0.01 Native ETH + 0.01 WETH
  - Distribute 0.02 ETH more (Native ETH)
  - Verify: Bot wallet now has 0.03 Native ETH + 0.01 WETH
  - Verify: Total credit = 0.04 ETH

---

### 🟡 Swap Tests (Pending Implementation)

- [ ] **Test 4: Swap with Native ETH**
  - Bot wallet has 0.02 Native ETH + 0 WETH
  - Execute swap for 0.01 ETH
  - Verify: Swap uses Native ETH (sellToken = 0xeeee...eeee)
  - Verify: No WETH approval needed
  - Verify: Database `native_eth_balance_wei` deducted
  - Verify: Remaining balance = 0.01 Native ETH

- [ ] **Test 5: Swap with WETH**
  - Bot wallet has 0 Native ETH + 0.02 WETH
  - Execute swap for 0.01 ETH
  - Verify: Swap uses WETH (sellToken = WETH address)
  - Verify: WETH approved if needed
  - Verify: Database `weth_balance_wei` deducted
  - Verify: Remaining balance = 0.01 WETH

- [ ] **Test 6: Swap with Mixed Balance (Prefer Native ETH)**
  - Bot wallet has 0.01 Native ETH + 0.01 WETH
  - Execute swap for 0.01 ETH
  - Verify: Swap uses Native ETH first (preferred)
  - Verify: Database `native_eth_balance_wei` deducted
  - Verify: Remaining balance = 0 Native ETH + 0.01 WETH

- [ ] **Test 7: Auto-Convert if Insufficient Native ETH**
  - Bot wallet has 0.005 Native ETH + 0.02 WETH
  - Execute swap for 0.01 ETH
  - Verify: System uses WETH (Native ETH insufficient)
  - Verify: Database `weth_balance_wei` deducted
  - Verify: Remaining balance = 0.005 Native ETH + 0.01 WETH

---

## Migration Guide

### For Existing Users

1. **Run Database Migration:**
   ```sql
   -- In Supabase SQL Editor
   ALTER TABLE bot_wallet_credits
   ADD COLUMN IF NOT EXISTS native_eth_balance_wei TEXT NOT NULL DEFAULT '0';
   ```

2. **Existing Bot Wallets:**
   - All existing bot wallets have `weth_balance_wei` (WETH)
   - New column `native_eth_balance_wei` defaults to '0'
   - Total credit = `native_eth_balance_wei` + `weth_balance_wei`
   - No data loss, backward compatible ✅

3. **Future Distributions:**
   - User can choose: Native ETH or WETH
   - Recommendation: Use Native ETH (faster, cheaper)
   - System will support both simultaneously

---

## 0x API Native ETH Support

### Native ETH Address
```typescript
const NATIVE_ETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
```

### Quote Request with Native ETH
```typescript
const quoteParams = new URLSearchParams({
  chainId: "8453", // Base
  sellToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", // Native ETH
  buyToken: "0x...", // Target token
  sellAmount: "10000000000000000", // 0.01 ETH in wei
  taker: "0x...", // Bot wallet address
  slippageBps: "500", // 5%
})

const response = await fetch(`https://api.0x.org/swap/v2/quote?${quoteParams}`)
const quote = await response.json()
```

### Execute Swap with Native ETH
```typescript
// Send transaction with ETH value
await ownerAccount.invokeContract({
  contractAddress: quote.transaction.to,
  method: "swap",
  args: {
    data: quote.transaction.data,
    value: sellAmount, // Send Native ETH value
  },
  abi: [],
})
```

**Key Differences:**
- **Native ETH**: No approval needed, send value in transaction
- **WETH**: Approval needed, value = 0 (ERC20 transfer)

---

## Recommendations

### For New Implementations:
1. ✅ **Use Native ETH by default** (`preferNativeEth: true`)
   - Faster distribution (no WETH conversion)
   - Cheaper gas (no ERC20 approval)
   - Simpler flow (no allowance checks)

2. ✅ **Fallback to WETH if needed**
   - If 0x API doesn't support Native ETH for specific token
   - If user prefers WETH for any reason

3. ✅ **Support both in swap logic**
   - Check both Native ETH and WETH balance
   - Prefer Native ETH if available
   - Fallback to WETH if Native ETH insufficient

### For Existing Implementations:
1. ✅ **Backward compatible**
   - Existing WETH distributions still work
   - New Native ETH support is additive
   - No breaking changes

2. ✅ **Gradual migration**
   - Keep using WETH for existing bot wallets
   - Use Native ETH for new distributions
   - Both can coexist in same bot wallet

---

## Summary

### ✅ What's Done:
1. Database schema updated (`native_eth_balance_wei` column added)
2. Distribution hook supports Native ETH (`preferNativeEth` parameter)
3. Record distribution API tracks Native ETH and WETH separately
4. Backward compatible with existing WETH system

### 🟡 What's Pending:
1. Execute swap API: Support Native ETH swaps (0xeeee...eeee)
2. Bumping worker: Check Native ETH + WETH balance
3. Credit balance API: Sum Native ETH + WETH
4. Testing: Full flow with Native ETH

### 📋 Next Steps:
1. Apply database migration (`scripts/add-native-eth-support.sql`)
2. Implement execute-swap changes (see section 4 above)
3. Implement bumping-worker changes (see section 5 above)
4. Implement credit-balance changes (see section 6 above)
5. Test complete flow (see Testing Checklist)
6. Update frontend UI to show Native ETH + WETH breakdown (optional)

---

**Questions or Issues?**
- Check `docs/CREDIT_FLOW_AUDIT.md` for complete credit system documentation
- Check 0x API docs: https://0x.org/docs/api#tag/Swap/operation/swap::get-swap-v2-quote
- Native ETH address: `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`

