# Uniswap V4 Swap Implementation via Universal Router

## Overview

This document explains how the "Convert $BUMP to Credit" feature integrates with Uniswap V4 using the Universal Router on Base Mainnet.

## Architecture

### V4 Swap Pattern

Unlike V3, Uniswap V4 uses a **Singleton PoolManager** architecture with **Flash Accounting**. All swaps must go through the **Universal Router** using specific command sequences.

### Key Components

1. **Universal Router**: `0x6fF5693b99212Da76ad316178A184AB56D299b43`
   - Single entry point for all Uniswap operations
   - Executes commands atomically in one transaction
   - Uses `execute(bytes commands, bytes[] inputs)` function

2. **Permit2**: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
   - Token approval contract
   - Enables efficient token spending without multiple approvals
   - Separates approval from execution

3. **V4 Pool ($BUMP/WETH)**:
   - Currency0: `0x4200000000000000000000000000000000000006` (WETH)
   - Currency1: `0x94CE728849431818EC9a0CF29BDb24FE413bBb07` ($BUMP)
   - Fee: `8388608` (Dynamic Fee - 0x800000)
   - Tick Spacing: `200`
   - Hooks: `0xd60D6B218116cFd801E28F78d011a203D2b068Cc`

## Command Sequence

The conversion process uses 5 Universal Router commands in a single atomic transaction:

### 1. PERMIT2_TRANSFER_FROM (0x07)
- **Purpose**: Transfer 5% $BUMP from user to Treasury
- **Input**: `abi.encode(token, recipient, amount)`
- **Token**: $BUMP address
- **Recipient**: Treasury address
- **Amount**: 5% of total $BUMP

### 2. V4_SWAP (0x10)
- **Purpose**: Swap 95% $BUMP to WETH via V4 pool
- **Input**: `abi.encode(currencyIn, currencyOut, amountIn, amountOutMinimum, recipient, PathKey)`
- **CurrencyIn**: $BUMP address
- **CurrencyOut**: WETH address
- **AmountIn**: 95% of total $BUMP
- **AmountOutMinimum**: 0 (for testing, minimal slippage)
- **Recipient**: User's Smart Wallet
- **PathKey**: Route information for V4

### 3. UNWRAP_WETH (0x0c)
- **Purpose**: Unwrap all WETH to Native ETH
- **Input**: `abi.encode(recipient, amountMin)`
- **Recipient**: User's address
- **AmountMin**: 0 (sweep all)

### 4. PAY_PORTION (0x06)
- **Purpose**: Send 5% of initial total (in ETH) to Treasury
- **Input**: `abi.encode(token, recipient, bips)`
- **Token**: `address(0)` (Native ETH)
- **Recipient**: Treasury address
- **Bips**: ~526 bips (calculated as 5% of total / 95% of total)

### 5. SWEEP (0x04)
- **Purpose**: Send remaining 90% ETH to user
- **Input**: `abi.encode(token, recipient, amountMin)`
- **Token**: `address(0)` (Native ETH)
- **Recipient**: User's Smart Wallet
- **AmountMin**: 0 (sweep all remaining)

## PathKey Structure for V4

The `PathKey` structure defines the swap route for V4:

\`\`\`typescript
struct PathKey {
  address[] intermediateCurrency;  // Empty for single-hop swap
  uint24[] fee;                    // [8388608] - Dynamic Fee
  int24[] tickSpacing;             // [200]
  address[] hooks;                 // [0xd60D6B218116cFd801E28F78d011a203D2b068Cc]
  bytes[] hookData;                // ["0x"] - Empty hook data
}
\`\`\`

For a **single-hop swap** (direct $BUMP → WETH):
- `intermediateCurrency` is an **empty array** (no intermediate tokens)
- Other arrays have **1 element each** defining the pool parameters

## Transaction Flow

### User Approval Phase (One-time)
1. User approves $BUMP to Permit2 (ERC20 approve)
   - This is done via the "Approve $BUMP" button in UI
   - Only needed once or when allowance is insufficient

### Conversion Phase
1. **Batch Transaction via Smart Wallet**:
   \`\`\`
   Call 1: Permit2.approve(BUMP_TOKEN, UNIVERSAL_ROUTER, MAX_UINT160, MAX_UINT48)
           └─ Authorizes Universal Router to spend $BUMP via Permit2
   
   Call 2: UniversalRouter.execute(commands, inputs)
           └─ Executes all 5 commands atomically:
              ├─ PERMIT2_TRANSFER_FROM: 5% $BUMP → Treasury
              ├─ V4_SWAP: 95% $BUMP → WETH (via PathKey)
              ├─ UNWRAP_WETH: WETH → Native ETH
              ├─ PAY_PORTION: 5% ETH → Treasury
              └─ SWEEP: 90% ETH → User
   \`\`\`

2. **Backend Verification** (`/api/sync-credit`):
   - Verify transaction receipt on-chain
   - Parse logs to confirm:
     - 5% $BUMP was sent to Treasury
     - 90% ETH was credited to user
   - Update Supabase database:
     - Increment `user_credits.balance_wei`
     - Log transaction in `conversion_logs`

## Gas Optimization

- All operations bundled into **1 Smart Wallet UserOperation**
- Sponsored by Coinbase CDP Paymaster (gasless for user)
- Manual gas limit: `1,500,000` units (to prevent simulation failures)

## Error Handling

### Common Errors

1. **TRANSFER_FAILED**
   - Cause: Insufficient Permit2 allowance
   - Fix: Ensure Permit2.approve() is called before execute()

2. **ExecutionRevertedError**
   - Cause: Invalid PathKey or pool doesn't exist
   - Fix: Verify pool parameters match actual V4 pool on Base

3. **Paymaster billing error**
   - Cause: No billing attached to CDP account for mainnet
   - Fix: Configure billing in Coinbase Developer Portal

## SDK Dependencies

- `@uniswap/v4-sdk`: V4 protocol types and utilities
- `@uniswap/sdk-core`: Core SDK for token/currency types
- `viem`: Ethereum interaction and encoding
- `@privy-io/react-auth`: Smart Wallet integration

## Testing Checklist

- [ ] Verify pool exists on Base Mainnet for $BUMP/WETH with dynamic fee
- [ ] Test ERC20 approval to Permit2
- [ ] Test Permit2 approval to Universal Router
- [ ] Execute full conversion with small amount
- [ ] Verify 5% $BUMP sent to Treasury
- [ ] Verify 90% ETH credited in database
- [ ] Check transaction hash and logs
- [ ] Test with MAX button (full balance)

## References

- [Uniswap V4 SDK Documentation](https://docs.uniswap.org/sdk/v4/overview)
- [Universal Router Commands](https://docs.uniswap.org/contracts/universal-router/overview)
- [Permit2 Documentation](https://docs.uniswap.org/contracts/permit2/overview)
- [Coinbase CDP Paymaster](https://docs.cdp.coinbase.com/paymaster/docs/quickstart)

## Notes

- The current implementation uses `amountOutMinimum = 0` for testing purposes. In production, implement proper slippage calculation based on real-time pool price.
- PathKey encoding follows V4 specification for single-hop swaps with custom hooks and dynamic fees.
- All operations are atomic - either all succeed or all revert.









