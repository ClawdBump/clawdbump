# Blockchain Balance Sync - Real-time Credits

## Overview
Implemented real-time blockchain balance fetching to ensure Credits display is always accurate and synchronized with actual on-chain balance (Native ETH + WETH).

## Problems Solved

### 1. **Credits Not Syncing During Swaps**
**Problem**: When user clicks "Start Bumping" and swaps begin, the Credits display doesn't update to reflect the actual balance changes.

**Solution**: 
- Created `useBlockchainBalance` hook that fetches balance directly from blockchain
- Auto-refreshes every 10 seconds
- No dependency on database sync delays
- Shows real-time Native ETH + WETH balance

### 2. **Multiple Confirmation Prompts**
**Problem**: User has to click confirm multiple times when distributing credits to bot wallets (1 confirmation per wallet = 5 confirmations).

**Current Status**: 
- The `useDistributeCredits` hook already uses batch transactions when possible
- Smart Wallet SDK should handle this with 1 confirmation for multiple transfers
- If still seeing multiple confirmations, it may be a Privy SDK limitation

**Recommendation**: 
- Monitor if users still experience multiple confirmations
- If yes, consider implementing a single multi-call transaction using Multicall3 contract

## Implementation Details

### New Hook: `useBlockchainBalance`

```typescript
// hooks/use-blockchain-balance.ts

export function useBlockchainBalance(
  address: string | null | undefined,
  options: {
    enabled?: boolean
    refetchInterval?: number // Auto-refetch (default: 10s)
    ethPriceUsd?: number // For USD conversion
  }
)
```

**Features**:
- Fetches Native ETH balance via `publicClient.getBalance()`
- Fetches WETH balance via `readContract()` on WETH contract
- Auto-refreshes at specified interval (default: 10 seconds)
- Calculates total balance and USD value
- Returns formatted values for display

**Returns**:
```typescript
{
  balance: {
    nativeEth: bigint
    weth: bigint
    total: bigint
    nativeEthFormatted: string
    wethFormatted: string
    totalFormatted: string
    totalUsd: number
  } | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}
```

### New Hook: `useTotalBlockchainBalance`

```typescript
// hooks/use-blockchain-balance.ts

export function useTotalBlockchainBalance(options: {
  mainWalletAddress: string | null
  botWalletAddresses?: string[]
  enabled?: boolean
  refetchInterval?: number
  ethPriceUsd?: number
})
```

**Features**:
- Fetches balance for main wallet + all 5 bot wallets
- Provides breakdown per wallet
- Calculates grand total across all wallets
- Useful for showing complete credit picture

**Returns**:
```typescript
{
  mainBalance: BlockchainBalance | null
  botBalances: BlockchainBalance[]
  totalBalance: BlockchainBalance | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}
```

### Updated Component: `WalletCard`

**Changes**:
1. Replaced `useCreditBalance` (database) with `useBlockchainBalance` (on-chain)
2. Auto-refresh every 10 seconds
3. Shows breakdown: Native ETH + WETH
4. Manual refresh button triggers immediate fetch
5. Displays "Auto-updates every 10 seconds • On-chain balance" message

**Props**:
```typescript
interface WalletCardProps {
  fuelBalance?: number
  credits?: number
  walletAddress?: string | null
  isSmartAccountActive?: boolean
  ethPriceUsd?: number // NEW: For accurate USD conversion
}
```

### Updated Page: `app/page.tsx`

**Changes**:
1. Added `ethPriceUsd` state
2. Updates `ethPriceUsd` when fetching price for distribution
3. Passes `ethPriceUsd` to `WalletCard` component

## Benefits

### ✅ Real-time Accuracy
- Credits display reflects actual on-chain balance
- No lag from database sync delays
- Auto-updates every 10 seconds

### ✅ Transparency
- Shows Native ETH + WETH breakdown
- Users can see exactly what they have
- Manual refresh for instant updates

### ✅ Reliability
- Direct blockchain queries
- No database inconsistencies
- Works even if database sync fails

### ✅ Better UX
- Auto-refresh means users don't need to manually refresh
- Spinner shows when data is loading
- Toast notifications on manual refresh

## Usage Example

```typescript
// In any component
import { useBlockchainBalance } from "@/hooks/use-blockchain-balance"

function MyComponent({ walletAddress }: { walletAddress: string }) {
  const { balance, isLoading, refetch } = useBlockchainBalance(
    walletAddress,
    {
      enabled: true,
      refetchInterval: 10000, // 10 seconds
      ethPriceUsd: 3000,
    }
  )

  if (isLoading) return <div>Loading...</div>

  return (
    <div>
      <p>Native ETH: {balance?.nativeEthFormatted}</p>
      <p>WETH: {balance?.wethFormatted}</p>
      <p>Total: ${balance?.totalUsd.toFixed(2)}</p>
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

## Testing

### Test Scenarios

1. **Auto-refresh**:
   - Connect wallet
   - Wait 10 seconds
   - Verify balance updates automatically

2. **Manual refresh**:
   - Click refresh icon
   - Verify spinner shows
   - Verify toast notification appears
   - Verify balance updates

3. **During swaps**:
   - Start bumping
   - Watch Credits display
   - Verify it decreases as swaps execute
   - Verify updates within 10 seconds of swap

4. **Breakdown display**:
   - Verify Native ETH + WETH shown separately
   - Verify total matches sum
   - Verify USD value is accurate

## Future Improvements

### 1. WebSocket for Real-time Updates
Instead of polling every 10 seconds, use WebSocket to get instant updates when balance changes.

### 2. Optimistic Updates
Update UI immediately when user initiates a swap, then confirm with blockchain data.

### 3. Transaction History
Show recent transactions that affected balance (deposits, distributions, swaps).

### 4. Multi-wallet Summary
Use `useTotalBlockchainBalance` to show total across main + bot wallets in a summary view.

## Files Changed

- `hooks/use-blockchain-balance.ts` (NEW)
- `components/wallet-card.tsx` (MODIFIED)
- `app/page.tsx` (MODIFIED)
- `docs/BLOCKCHAIN_BALANCE_SYNC.md` (NEW)

## Related Documentation

- [Credit System](./CREDIT_SYSTEM.md)
- [Deposit Feature](./DEPOSIT_FEATURE.md)
- [Native ETH Support](./NATIVE_ETH_SUPPORT.md)

