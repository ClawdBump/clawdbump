# Backend Distribute Credits Implementation

## Overview

This document explains the implementation of backend credit distribution without user approval.

## Challenge

The main wallet is a **Privy Smart Account** (ERC-4337), which requires user signature for transactions. However, Privy manages the private key centrally and does not provide direct access to it.

## Solution Options

### Option 1: Store Owner Address (EOA) in Database (Recommended)

**How it works:**
1. When user logs in via Privy, we get their Smart Account address
2. Privy creates an embedded wallet (EOA) that owns the Smart Account
3. We store the embedded wallet address (owner) in the database
4. We use CDP SDK to execute transactions from the Smart Account using the owner address

**Implementation:**
```typescript
// Get owner address from database
const { data: userData } = await supabase
  .from("telegram_user_mappings")
  .select("owner_address") // Store this when user logs in
  .eq("wallet_address", userAddress)
  .single()

// Use CDP SDK to execute transaction
const ownerAccount = await cdp.evm.getAccount({
  address: userData.owner_address,
})

const smartAccount = await cdp.evm.getSmartAccount({
  owner: ownerAccount,
  address: userAddress, // Main wallet address
})

// Execute transaction (no user approval needed)
await smartAccount.sendUserOperation({
  network: "base",
  calls: [{ to, data, value }],
  isSponsored: true,
})
```

**Pros:**
- No user approval needed
- Uses existing CDP SDK infrastructure
- Secure (owner address is just an address, not a private key)

**Cons:**
- Requires storing owner address in database
- Need to fetch owner address when user first logs in

### Option 2: Use Privy Node SDK (Current Implementation)

**How it works:**
1. Use Privy Node SDK to get user's embedded wallet
2. Use Privy's API to sign transactions
3. Execute transactions automatically

**Note:** Privy Node SDK may not support direct transaction signing without user approval. This approach may require additional Privy API calls or may not be fully automated.

### Option 3: One-Time Approval (Fallback)

**How it works:**
1. User approves once when clicking "Start Bumping"
2. After approval, all swaps run automatically in backend
3. Distribution happens once at start

**Pros:**
- Simple and reliable
- Works with current Privy setup

**Cons:**
- Requires one-time user approval
- Not fully automated

## Current Implementation Status

**File:** `app/api/bot/distribute-credits-backend/route.ts`

**Status:** ⚠️ **Partial Implementation**

The current implementation attempts to use Privy Node SDK, but:
- Privy Node SDK may not support `sendTransaction` method directly
- May require additional Privy API configuration
- May need to use Option 1 (store owner address) instead

## Implementation Status

✅ **Backend API Created:** `app/api/bot/distribute-credits-backend/route.ts`
- Uses CDP SDK with stored owner address
- Executes transactions without user approval
- Supports both Native ETH and WETH distribution

⚠️ **Pending: Store Owner Address**
- Need to update login flow to fetch and store owner address
- Need to run database migration script

## Next Steps

1. **Run Database Migration:**
   ```bash
   # Run in Supabase SQL Editor
   psql -f scripts/add-owner-address-column.sql
   ```
   Or manually run:
   ```sql
   ALTER TABLE telegram_user_mappings
   ADD COLUMN IF NOT EXISTS owner_address TEXT;
   ```

2. **Update Login Flow:**
   - In `hooks/use-telegram-miniapp-auth.ts`, fetch embedded wallet address (owner) from Privy
   - Store it in `telegram_user_mappings.owner_address` when user logs in
   - The owner address is the EOA that owns the Privy Smart Account

3. **Test Backend Distribution:**
   - Call `/api/bot/distribute-credits-backend` with `userAddress`
   - Verify transaction is executed without user approval
   - Check transaction on BaseScan

## Environment Variables

Add to `.env.local`:
```bash
# Privy App Secret (for Privy Node SDK)
PRIVY_APP_SECRET=your-privy-app-secret
```

Get this from: https://dashboard.privy.io (Settings -> API Keys)

## Testing

1. **Test Owner Address Storage:**
   - Login via Privy
   - Verify `owner_address` is stored in database
   - Check that it's a valid EOA address

2. **Test Backend Distribution:**
   - Call `/api/bot/distribute-credits-backend`
   - Verify transaction is executed without user approval
   - Check transaction on BaseScan

3. **Test Error Handling:**
   - Test with missing owner address
   - Test with invalid user address
   - Test with insufficient balance

## Security Considerations

1. **Owner Address Storage:**
   - Owner address is just an address (public), not a private key
   - Safe to store in database
   - Cannot be used to steal funds (requires private key)

2. **Transaction Limits:**
   - Consider adding daily/weekly limits
   - Monitor for suspicious activity
   - Log all transactions in `bot_logs`

3. **Access Control:**
   - Verify user owns the wallet before distribution
   - Check user is authenticated
   - Validate request parameters

## Related Files

- `app/api/bot/distribute-credits-backend/route.ts` - Backend distribution API
- `hooks/use-distribute-credits.ts` - Frontend distribution hook
- `app/api/bot/record-distribution/route.ts` - Record distribution in database
- `hooks/use-telegram-miniapp-auth.ts` - User login flow

## References

- [Privy Documentation](https://docs.privy.io/)
- [CDP SDK Documentation](https://docs.cdp.coinbase.com/)
- [ERC-4337 Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)

