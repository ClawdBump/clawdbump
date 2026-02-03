# Bot Wallet Balance Sync After Swap

## Overview
Fixed the issue where bot wallet credits were not properly synchronized with on-chain balance after swaps. Now, after each successful swap, the database is automatically synced with the actual on-chain balance (Native ETH + WETH).

## Problem

### Before ❌
- After swap, database balance was manually deducted
- Only WETH balance was updated (not Native ETH)
- Database could become out-of-sync with on-chain balance
- Gas fees and Native ETH conversions not reflected
- Balance discrepancies between database and blockchain

### After ✅
- After swap, database is synced with actual on-chain balance
- Both Native ETH and WETH balances are updated
- Database always reflects true on-chain balance
- Gas fees and conversions automatically accounted for
- Complete accuracy between database and blockchain

## Implementation

### 1. Sync On-Chain Balance After Swap

**File**: `app/api/bot/execute-swap/route.ts`

**Before** (Manual Deduction):
```typescript
// Deduct swap amount from bot wallet credit
const newBalance = currentBalance - amountWei

await supabase
  .from("bot_wallet_credits")
  .update({ 
    weth_balance_wei: newBalance.toString(),
  })
```

**After** (On-Chain Sync):
```typescript
// Fetch current on-chain balance (Native ETH + WETH)
let onChainNativeEth = BigInt(0)
let onChainWeth = BigInt(0)

onChainNativeEth = await publicClient.getBalance({
  address: smartAccountAddress,
})

onChainWeth = await publicClient.readContract({
  address: WETH_ADDRESS,
  abi: WETH_ABI,
  functionName: "balanceOf",
  args: [smartAccountAddress],
}) as bigint

// Update database with on-chain balance
await supabase
  .from("bot_wallet_credits")
  .update({ 
    native_eth_balance_wei: onChainNativeEth.toString(),
    weth_balance_wei: onChainWeth.toString(),
    updated_at: new Date().toISOString(),
  })
```

### 2. Why Sync Instead of Deduct?

#### Problems with Manual Deduction:
1. **Gas Fees**: Not accounted for in manual deduction
2. **Native ETH Conversion**: If swap uses Native ETH (converted to WETH), deduction doesn't reflect this
3. **Precision Loss**: Manual calculation can have rounding errors
4. **Race Conditions**: Multiple swaps could cause incorrect deductions

#### Benefits of On-Chain Sync:
1. **Source of Truth**: On-chain balance is always accurate
2. **Automatic Accounting**: Gas fees, conversions, all included
3. **No Calculation Errors**: Direct read from blockchain
4. **Race Condition Safe**: Always reflects actual state

### 3. Balance Log Entry

After sync, a log entry is created:

```typescript
await supabase.from("bot_logs").insert({
  user_address: user_address.toLowerCase(),
  bot_wallet_address: smartAccountAddress.toLowerCase(),
  token_address: token_address,
  amount_wei: totalRemainingBalance.toString(),
  action: "balance_synced",
  message: `[System] Bot #${walletIndex + 1} balance synced: ${formatEther(remainingNativeEth)} Native ETH + ${formatEther(remainingWeth)} WETH = ${formatEther(totalRemainingBalance)} ETH total ($${remainingBalanceUsd.toFixed(2)})`,
  status: "success",
  created_at: new Date().toISOString(),
})
```

### 4. Fixed bot_logs Status Values

**Problem**: Some log entries used invalid status values (`"info"`, `"warning"`)

**Solution**: Changed to valid values:
- `"success"` - For successful operations
- `"failed"` - For failed operations
- `"pending"` - For operations in progress

**Database Schema**:
```sql
status TEXT NOT NULL, -- 'success', 'error', 'pending'
```

## Flow Diagram

### Before (Manual Deduction)
```
Swap Executed
    ↓
Calculate: newBalance = currentBalance - swapAmount
    ↓
Update Database: weth_balance_wei = newBalance
    ↓
❌ Problem: Doesn't account for gas fees, Native ETH conversions
```

### After (On-Chain Sync)
```
Swap Executed
    ↓
Wait for Transaction Confirmation
    ↓
Fetch On-Chain Balance:
  - Native ETH: getBalance()
  - WETH: readContract(balanceOf)
    ↓
Update Database:
  - native_eth_balance_wei = onChainNativeEth
  - weth_balance_wei = onChainWeth
    ↓
✅ Result: Database = On-Chain (always accurate)
```

## Benefits

### ✅ Accuracy
- Database always matches on-chain balance
- No discrepancies or drift over time
- Gas fees automatically accounted for

### ✅ Completeness
- Both Native ETH and WETH tracked
- All balance changes reflected
- Complete audit trail

### ✅ Reliability
- No manual calculation errors
- Race condition safe
- Source of truth (blockchain)

### ✅ Transparency
- Balance sync logged in bot_logs
- Users can see exact balance after each swap
- Clear audit trail

## Testing

### Test Scenario 1: WETH Swap
1. Bot wallet has 0.01 WETH
2. Execute swap for 0.001 WETH
3. **Expected**: Database shows 0.009 WETH (minus gas fees)
4. **Verify**: On-chain balance = Database balance

### Test Scenario 2: Native ETH Conversion
1. Bot wallet has 0.01 Native ETH
2. Swap converts Native ETH to WETH
3. **Expected**: Database shows updated Native ETH + WETH
4. **Verify**: Both balances match on-chain

### Test Scenario 3: Multiple Swaps
1. Execute 5 swaps in sequence
2. **Expected**: Database balance decreases correctly after each swap
3. **Verify**: Final balance matches on-chain exactly

### Test Scenario 4: Gas Fees
1. Execute swap
2. **Expected**: Database balance includes gas fee deduction
3. **Verify**: Balance = On-chain (gas fees accounted)

## Log Entries

### Balance Sync Log
```
📊 Balance Synced [✓]
   Bot Wallet #1
   Bot #1 balance synced: 0.0005 Native ETH + 0.002 WETH = 0.0025 ETH total ($7.50)
   2 minutes ago
```

### Swap Log (Updated)
```
🔄 Swap Completed [✓] [BaseScan↗]
   Bot Wallet #1
   Swap executed: $0.01 to Target Token
   2 minutes ago
```

## Database Schema

### bot_wallet_credits Table
```sql
CREATE TABLE bot_wallet_credits (
  id UUID PRIMARY KEY,
  user_address TEXT NOT NULL,
  bot_wallet_address TEXT NOT NULL,
  native_eth_balance_wei TEXT NOT NULL DEFAULT '0', -- NEW: Native ETH
  weth_balance_wei TEXT NOT NULL DEFAULT '0',      -- WETH
  tx_hash TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,                          -- Updated after each sync
  UNIQUE(user_address, bot_wallet_address)
);
```

### bot_logs Table
```sql
CREATE TABLE bot_logs (
  id UUID PRIMARY KEY,
  user_address TEXT NOT NULL,
  bot_wallet_address TEXT,
  action TEXT NOT NULL,  -- 'balance_synced', 'swap_completed', etc.
  status TEXT NOT NULL,  -- 'success', 'error', 'pending' (FIXED)
  message TEXT,
  tx_hash TEXT,
  amount_wei TEXT,
  created_at TIMESTAMPTZ
);
```

## Related Documentation

- [Credit System](./CREDIT_SYSTEM.md)
- [Blockchain Balance Sync](./BLOCKCHAIN_BALANCE_SYNC.md)
- [Activity Logs Improvement](./ACTIVITY_LOGS_IMPROVEMENT.md)
- [Native ETH Support](./NATIVE_ETH_SUPPORT.md)

## Files Changed

- `app/api/bot/execute-swap/route.ts` - Sync balance after swap
- `docs/BOT_WALLET_BALANCE_SYNC.md` - This documentation

## Status

✅ **COMPLETED & PUSHED TO GITHUB**

All changes have been tested and deployed.

