// Token and Contract Addresses on Base Mainnet
export const BUMP_TOKEN_ADDRESS = "0x94ce728849431818ec9a0cf29bdb24fe413bbb07" as const
export const TREASURY_ADDRESS = "0x831204121Dbf75Fd11256a96831E6acD669B4bf6" as const
export const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const

// Uniswap V4 PoolManager on Base Mainnet
// PoolManager address: https://docs.verifiedpools.com/security/deployments
export const UNISWAP_V4_POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b" as const

// Uniswap Universal Router on Base Mainnet
export const UNISWAP_UNIVERSAL_ROUTER = "0x6fF5693b99212Da76ad316178A184AB56D299b43" as const

// Permit2 on Base Mainnet
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const

// 0x Protocol Settler Contract on Base Mainnet
// Used for executing swaps via 0x Swap API v2
export const ZEROX_SETTLER_CONTRACT = "0x785648669b8e90a75a6a8de682258957f9028462" as const

// Clanker V4 $BUMP/WETH Pool Configuration
// Based on Clanker SDK v4.0.0 documentation
// $BUMP token deployed via Clanker platform using Uniswap V4
// Uses dynamic fee pools with UniV4SwapExtension hooks for fee collection
// Compatible with Clanker.world trading interface
//
// PoolKey Configuration:
// currency0: WETH (0x4200000000000000000000000000000000000006)
// currency1: $BUMP (0x94CE728849431818EC9a0CF29BDb24FE413bBb07)
// fee: Dynamic Fee (0x800000 = 8388608)
// tickSpacing: 200 (for dynamic fee)
// hooks: Clanker UniV4SwapExtension hook (0xd60D6B218116cFd801E28F78d011a203D2b068Cc)
export const BUMP_POOL_HOOK_ADDRESS = "0xd60D6B218116cFd801E28F78d011a203D2b068Cc" as const // Clanker UniV4SwapExtension hook
export const BUMP_POOL_CURRENCY0 = "0x4200000000000000000000000000000000000006" as const // WETH
export const BUMP_POOL_CURRENCY1 = "0x94CE728849431818EC9a0CF29BDb24FE413bBb07" as const // $BUMP
export const BUMP_POOL_FEE = 8388608 // Dynamic Fee (0x800000)
export const BUMP_POOL_TICK_SPACING = 200 // Dynamic fee tick spacing

// Clanker Fee Configuration (from SDK v4.0.0 docs)
// Using DynamicBasic preset from Clanker SDK
// Dynamic fees adjust based on pool volatility and volume
export const CLANKER_FEE_CONFIG = {
  type: "dynamic" as const,
  preset: "DynamicBasic" as const,
  // Dynamic fees provide better capital efficiency
  // Fees range from 0.01% to 1% based on pool conditions
} as const

// Clanker Rewards Configuration
// Based on Clanker SDK rewards structure
// LP rewards distributed to token holders and platform
export const CLANKER_REWARDS_CONFIG = {
  // Rewards distributed in paired token (WETH) and clanker token ($BUMP)
  recipients: [
    {
      name: "Creator Rewards",
      token: "Paired", // WETH rewards
      typicalBps: 8000, // 80% of rewards
    },
    {
      name: "Platform/Interface Rewards",
      token: "Both", // Both WETH and $BUMP
      typicalBps: 2000, // 20% of rewards
    }
  ]
} as const

// Legacy: Uniswap V3 Router (kept for reference)
// Router2 address: https://docs.uniswap.org/contracts/v3/reference/deployments/base
export const UNISWAP_V3_ROUTER2 = "0x2626664c2603336E57B271c5C0b26F42126eED1B" as const

// Token decimals
export const BUMP_DECIMALS = 18
export const WETH_DECIMALS = 18

// Fee percentages (in basis points, where 10000 = 100%)
export const TREASURY_FEE_BPS = 500 // 5% = 500 basis points
export const APP_FEE_BPS = 500 // 5% = 500 basis points
export const USER_CREDIT_BPS = 9000 // 90% = 9000 basis points
