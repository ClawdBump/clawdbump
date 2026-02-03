# Bot Wallet Sync API

## Overview
API endpoint and UI component to sync all bot wallet credits in the database with their actual on-chain balance. This ensures the `bot_wallet_credits` table always reflects the true balance (Native ETH + WETH) for each bot wallet.

## Problem

### Before ❌
- Database `bot_wallet_credits` could be out-of-sync with on-chain balance
- Manual sync required for each wallet individually
- No way to bulk sync all bot wallets
- Discrepancies could accumulate over time

### After ✅
- Single API call syncs all bot wallets for a user
- Automatic sync of both Native ETH and WETH balances
- UI button for easy access
- Detailed sync results and logging

## API Endpoint

### POST `/api/bot/sync-balances`

**Request Body**:
```json
{
  "userAddress": "0x1234..."
}
```

**Response**:
```json
{
  "success": true,
  "synced": 5,
  "total": 5,
  "message": "Synced 5 out of 5 bot wallet(s)",
  "results": [
    {
      "botWalletAddress": "0xabcd...",
      "previousNativeEth": "1000000000000000",
      "previousWeth": "2000000000000000",
      "newNativeEth": "500000000000000",
      "newWeth": "2500000000000000",
      "synced": true
    },
    // ... more results
  ]
}
```

## Implementation

### 1. API Endpoint

**File**: `app/api/bot/sync-balances/route.ts`

**Flow**:
1. Fetch all `bot_wallet_credits` records for user
2. For each bot wallet:
   - Fetch on-chain Native ETH balance
   - Fetch on-chain WETH balance
   - Update database with on-chain values
   - Log sync activity
3. Return sync results

**Key Features**:
- Syncs both `native_eth_balance_wei` and `weth_balance_wei`
- Creates log entries in `bot_logs` for each sync
- Handles errors gracefully (continues with other wallets)
- Returns detailed results per wallet

### 2. React Hook

**File**: `hooks/use-sync-bot-balances.ts`

**Usage**:
```typescript
const { syncBalances, isSyncing, error } = useSyncBotBalances()

// Sync all bot wallets
await syncBalances(userAddress)
```

**Features**:
- Loading state (`isSyncing`)
- Error handling
- Toast notifications
- Automatic credit refetch after sync

### 3. UI Component

**File**: `components/config-panel.tsx`

**Location**: Fuel Status section, below Deposit button

**Button**:
```
[Sync Bot Balances]
Sync all bot wallet credits with on-chain balance
```

**Features**:
- Disabled when wallet not connected
- Shows loading state while syncing
- Toast notification on completion
- Auto-refreshes credit display after sync

## Usage

### From UI

1. Navigate to **Fuel Status** section
2. Click **"Sync Bot Balances"** button
3. Wait for sync to complete
4. See toast notification with results
5. Credits display updates automatically

### From Code

```typescript
import { useSyncBotBalances } from "@/hooks/use-sync-bot-balances"

function MyComponent({ userAddress }: { userAddress: string }) {
  const { syncBalances, isSyncing } = useSyncBotBalances()
  
  const handleSync = async () => {
    const result = await syncBalances(userAddress)
    if (result) {
      console.log(`Synced ${result.synced} wallets`)
    }
  }
  
  return (
    <button onClick={handleSync} disabled={isSyncing}>
      {isSyncing ? "Syncing..." : "Sync Balances"}
    </button>
  )
}
```

### Direct API Call

```typescript
const response = await fetch("/api/bot/sync-balances", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userAddress: "0x1234..." }),
})

const data = await response.json()
console.log(`Synced ${data.synced} out of ${data.total} wallets`)
```

## Sync Process

### Step-by-Step

1. **Fetch Bot Wallets**
   ```sql
   SELECT id, bot_wallet_address, native_eth_balance_wei, weth_balance_wei
   FROM bot_wallet_credits
   WHERE user_address = '0x1234...'
   ```

2. **For Each Wallet**:
   - Fetch Native ETH: `publicClient.getBalance({ address })`
   - Fetch WETH: `publicClient.readContract({ ...balanceOf })`
   - Update Database:
     ```sql
     UPDATE bot_wallet_credits
     SET 
       native_eth_balance_wei = '...',
       weth_balance_wei = '...',
       updated_at = NOW()
     WHERE id = '...'
     ```
   - Log Activity:
     ```sql
     INSERT INTO bot_logs (
       user_address,
       bot_wallet_address,
       action,
       message,
       status,
       amount_wei
     ) VALUES (...)
     ```

3. **Return Results**: Summary of all syncs

## Log Entries

### Balance Synced Log
```
📊 Balance Synced [✓]
   Bot Wallet #1
   Bot wallet balance synced: 0.0005 Native ETH + 0.002 WETH = 0.0025 ETH total
   2 minutes ago
```

**Action**: `balance_synced`  
**Status**: `success`  
**Message**: Includes Native ETH + WETH breakdown

## Error Handling

### API Errors

**No Bot Wallets**:
```json
{
  "success": true,
  "synced": 0,
  "message": "No bot wallet credits found",
  "results": []
}
```

**Partial Sync**:
```json
{
  "success": true,
  "synced": 3,
  "total": 5,
  "results": [
    { "synced": true, ... },
    { "synced": false, "error": "Failed to fetch balance", ... },
    // ...
  ]
}
```

**Individual Wallet Errors**:
- Continue with other wallets
- Log error in result
- Don't fail entire sync

## Benefits

### ✅ Accuracy
- Database always matches on-chain balance
- No manual calculation needed
- Source of truth (blockchain)

### ✅ Efficiency
- Single API call syncs all wallets
- Batch operation
- Fast execution

### ✅ Transparency
- Detailed results per wallet
- Log entries for audit trail
- Clear success/failure status

### ✅ User-Friendly
- Simple UI button
- Automatic credit refresh
- Toast notifications

## Use Cases

### 1. Initial Setup
After creating bot wallets, sync to initialize balances:
```typescript
// After generating bot wallets
await syncBalances(userAddress)
```

### 2. Periodic Maintenance
Sync periodically to ensure accuracy:
```typescript
// Daily/weekly sync
setInterval(() => {
  syncBalances(userAddress)
}, 24 * 60 * 60 * 1000) // 24 hours
```

### 3. After Manual Transactions
If user manually sends ETH/WETH to bot wallets:
```typescript
// After manual transaction
await syncBalances(userAddress)
```

### 4. Debugging
When investigating balance discrepancies:
```typescript
// Check and fix balances
const result = await syncBalances(userAddress)
console.log("Sync results:", result.results)
```

## Testing

### Test Scenario 1: Full Sync
1. User has 5 bot wallets
2. Click "Sync Bot Balances"
3. **Expected**: All 5 wallets synced
4. **Verify**: Database = On-chain for all wallets

### Test Scenario 2: Partial Sync
1. One bot wallet has invalid address
2. Click "Sync Bot Balances"
3. **Expected**: 4 wallets synced, 1 failed
4. **Verify**: Error message in results

### Test Scenario 3: No Wallets
1. User has no bot wallets
2. Click "Sync Bot Balances"
3. **Expected**: "No bot wallets found" message
4. **Verify**: No errors, graceful handling

### Test Scenario 4: UI Feedback
1. Click "Sync Bot Balances"
2. **Expected**: Button shows "Syncing..."
3. **Expected**: Toast notification on completion
4. **Expected**: Credits display updates

## Related Documentation

- [Bot Wallet Balance Sync](./BOT_WALLET_BALANCE_SYNC.md) - Auto-sync after swap
- [Credit System](./CREDIT_SYSTEM.md) - Credit system overview
- [Activity Logs Improvement](./ACTIVITY_LOGS_IMPROVEMENT.md) - Log system
- [Blockchain Balance Sync](./BLOCKCHAIN_BALANCE_SYNC.md) - Main wallet sync

## Files Changed

- `app/api/bot/sync-balances/route.ts` (NEW)
- `hooks/use-sync-bot-balances.ts` (NEW)
- `components/config-panel.tsx` (MODIFIED)
- `docs/BOT_WALLET_SYNC_API.md` (NEW)

## Status

✅ **COMPLETED & PUSHED TO GITHUB**

All changes have been tested and deployed.

