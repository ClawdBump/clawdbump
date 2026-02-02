# Clanker V4 Integration for $BUMP Token

## Overview

Token $BUMP telah di-deploy menggunakan Clanker SDK v4.0.0 dan terintegrasi dengan Uniswap V4. Dokumentasi ini menjelaskan setup dan konfigurasi yang digunakan untuk integrasi Clanker.

## Clanker SDK v4.0.0 Features Used

### 1. **Dynamic Fee Pools**
- Menggunakan dynamic fee system yang menyesuaikan berdasarkan kondisi pool
- Fee range: 0.01% - 1% tergantung volatilitas dan volume
- Lebih efisien untuk capital dibanding static fees

### 2. **UniV4SwapExtension Hook**
- Hook system untuk fee collection dan swap enhancement
- Menggunakan hook address untuk extended functionality
- Compatible dengan Clanker.world trading interface

### 3. **Rewards System**
- LP rewards didistribusikan ke creator dan platform
- Rewards dalam paired token (WETH) dan clanker token ($BUMP)
- Konfigurasi BPS untuk distribusi rewards

## Pool Configuration

### PoolKey Parameters
\`\`\`typescript
const poolKey = {
  currency0: "0x4200000000000000000000000000000000000006", // WETH
  currency1: "0x94CE728849431818EC9a0CF29BDb24FE413bBb07", // $BUMP
  fee: 8388608,        // Dynamic Fee (0x800000)
  tickSpacing: 200,    // Dynamic fee spacing
  hooks: "0xd60D6B218116cFd801E28F78d011a203D2b068Cc" // Clanker UniV4SwapExtension hook
}
\`\`\`

### Fee Configuration
\`\`\`typescript
const CLANKER_FEE_CONFIG = {
  type: "dynamic",
  preset: "DynamicBasic",
  // Dynamic fees: 0.01% to 1% based on pool conditions
}
\`\`\`

### Rewards Configuration
\`\`\`typescript
const CLANKER_REWARDS_CONFIG = {
  recipients: [
    {
      name: "Creator Rewards",
      token: "Paired", // WETH
      typicalBps: 8000, // 80%
    },
    {
      name: "Platform Rewards",
      token: "Both",   // WETH + $BUMP
      typicalBps: 2000, // 20%
    }
  ]
}
\`\`\`

## Swap Implementation

### Direct PoolManager Calls
Implementasi menggunakan direct `PoolManager.swap()` calls untuk kompatibilitas dengan Clanker pools:

\`\`\`typescript
const swapParams = {
  zeroForOne: false,        // selling $BUMP for WETH
  amountSpecified: -amountIn, // exact input
  sqrtPriceLimitX96: BigInt(0), // no price limit
}
\`\`\`

### Flash Accounting
- **SETTLE**: Bayar input tokens ke PoolManager
- **SWAP**: Execute swap dengan dynamic fees
- **TAKE**: Receive output tokens dari PoolManager

## Integration Points

### 1. **Convert $BUMP to Credit Feature**
- Menggunakan Clanker V4 pool untuk swap
- Dynamic fees menyesuaikan dengan market conditions
- Atomic transactions melalui Smart Wallet

### 2. **Clanker.world Compatibility**
- Token dapat ditampilkan di Clanker.world
- Fee collection melalui hook system
- Rewards distribution sesuai konfigurasi

### 3. **Uniswap V4 Compatibility**
- Full compatibility dengan Uniswap V4 protocol
- Menggunakan PoolManager untuk direct swaps
- Support untuk dynamic fee calculation

## Testing Considerations

### Pool Liquidity
- Pastikan pool memiliki sufficient liquidity
- Test dengan berbagai fee tiers
- Monitor dynamic fee adjustments

### Hook Functionality
- Verify hook address jika menggunakan custom hooks
- Test fee collection mechanisms
- Validate reward distributions

### Smart Wallet Integration
- Test dengan Privy Smart Wallets
- Verify Permit2 approvals
- Confirm atomic transaction execution

## References

- [Clanker SDK v4.0.0 Documentation](https://clanker.gitbook.io/clanker-documentation/sdk/v4.0.0)
- [Uniswap V4 Documentation](https://docs.uniswap.org/sdk/v4/overview)
- [Clanker.world](https://clanker.world)

## Configuration Constants

\`\`\`typescript
// Pool Configuration
export const BUMP_POOL_FEE = 8388608        // Dynamic Fee
export const BUMP_POOL_TICK_SPACING = 200   // Dynamic spacing
export const BUMP_POOL_HOOK_ADDRESS = "0x0000000000000000000000000000000000000000"

// Fee Configuration
export const CLANKER_FEE_CONFIG = {
  type: "dynamic",
  preset: "DynamicBasic"
}
\`\`\`

## Notes

- Token $BUMP di-deploy menggunakan Clanker SDK
- Pool menggunakan dynamic fee system
- Compatible dengan Clanker.world interface
- Full integration dengan Uniswap V4 protocol
- Smart Wallet compatible untuk gasless transactions</contents>
</xai:function_call">Dibuat file dokumentasi Clanker integration
