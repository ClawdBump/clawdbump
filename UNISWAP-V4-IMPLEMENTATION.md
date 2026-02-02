# Uniswap V4 Implementation Guide

Dokumentasi implementasi Uniswap V4 PoolManager untuk swap $BUMP ke ETH di Base network.

## 📍 Address yang Digunakan

### Uniswap V4 PoolManager
- **Address**: `0x498581ff718922c3f8e6a244956af099b2652b2b`
- **Network**: Base Mainnet
- **Source**: [Verified Pools Documentation](https://docs.verifiedpools.com/security/deployments)
- **File**: `lib/constants.ts` → `UNISWAP_V4_POOL_MANAGER`

**Apa itu PoolManager?**
- PoolManager adalah core contract Uniswap V4 yang mengelola semua pools
- Berbeda dengan V3 yang menggunakan Router, V4 menggunakan PoolManager langsung untuk swaps
- PoolManager memerlukan pool key (currency0, currency1, fee, tickSpacing, hooks) untuk mengidentifikasi pool
- **PENTING**: PoolManager tidak secara otomatis handle token transfers. Kita perlu approve PoolManager terlebih dahulu, dan PoolManager akan handle internal transfers saat swap

**Address ini digunakan untuk:**
- Approve token $BUMP ke PoolManager (agar bisa di-swap)
- Execute swap function di PoolManager
- PoolManager akan handle transfer token internal saat swap berlangsung

## 🔧 Cara Kerja Uniswap V4 Swap

### 1. Pool Key Structure
Setiap pool di V4 diidentifikasi oleh:
\`\`\`typescript
{
  currency0: Address,    // Token dengan address lebih rendah (alphabetically)
  currency1: Address,     // Token dengan address lebih tinggi
  fee: uint24,           // Fee tier (500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
  tickSpacing: int24,    // Tick spacing (1, 60, atau 200 tergantung fee)
  hooks: Address          // Hook contract (0x0 jika tidak ada hooks)
}
\`\`\`

### 2. Swap Parameters
\`\`\`typescript
{
  zeroForOne: bool,              // true = currency0 -> currency1, false = sebaliknya
  amountSpecified: int256,        // Negative untuk exact input, positive untuk exact output
  sqrtPriceLimitX96: uint160      // Price limit (0 = no limit)
}
\`\`\`

### 3. Implementation di Hook
Hook `use-convert-fuel.ts` melakukan:
1. **Transfer 5% $BUMP** → Treasury
2. **Approve PoolManager** → Untuk spend 95% $BUMP
3. **Swap via PoolManager** → 95% $BUMP → ETH/WETH

## ⚙️ Konfigurasi Pool

### Pool Configuration untuk $BUMP/WETH
\`\`\`typescript
// Token addresses (sorted alphabetically)
const token0 = BUMP_TOKEN_ADDRESS.toLowerCase() < BASE_WETH_ADDRESS.toLowerCase()
  ? BUMP_TOKEN_ADDRESS  // $BUMP (lower address)
  : BASE_WETH_ADDRESS   // WETH

const token1 = BUMP_TOKEN_ADDRESS.toLowerCase() < BASE_WETH_ADDRESS.toLowerCase()
  ? BASE_WETH_ADDRESS   // WETH (higher address)
  : BUMP_TOKEN_ADDRESS  // $BUMP

// Pool key
{
  currency0: token0,
  currency1: token1,
  fee: 500,              // 0.05% fee tier
  tickSpacing: 1,        // For 0.05% fee tier
  hooks: "0x0000...0000"  // No hooks
}

// Swap params
{
  zeroForOne: true,      // Swapping currency0 ($BUMP) for currency1 (WETH)
  amountSpecified: -swapAmountWei,  // Negative = exact input
  sqrtPriceLimitX96: 0   // No price limit
}
\`\`\`

## ⚠️ Important Notes

### 1. Pool Fee Tier
Saat ini menggunakan **fee tier 500 (0.05%)**. Pastikan pool $BUMP/WETH di Base menggunakan fee tier yang sama. Jika berbeda, update:
- `poolFee` di hook
- `tickSpacing` (1 untuk 0.05%, 60 untuk 0.3%, 200 untuk 1%)

### 2. Pool Existence
**PENTING**: Pastikan pool $BUMP/WETH sudah ada di Uniswap V4 dengan konfigurasi yang sesuai. Jika pool belum ada:
- Pool perlu dibuat terlebih dahulu
- Atau gunakan Uniswap V3 sebagai fallback

### 3. Token Transfers
Uniswap V4 PoolManager tidak secara otomatis handle token transfers. Kita perlu:
- Approve PoolManager untuk spend tokens
- PoolManager akan handle internal transfers saat swap

### 4. Hook Data
Jika pool menggunakan hooks (custom logic), perlu provide hook data. Saat ini menggunakan empty bytes (`0x`) karena tidak ada hooks.

## 🔍 Verifikasi Pool

Untuk memverifikasi pool $BUMP/WETH di Uniswap V4:

1. **Cek di Uniswap Interface**: https://app.uniswap.org/
2. **Cek Pool Key**: Pastikan currency0, currency1, fee, dan tickSpacing sesuai
3. **Test Swap**: Lakukan test swap kecil untuk memastikan pool aktif

## 🐛 Troubleshooting

### Error: "Pool not found" atau "Invalid pool key"
- **Solusi**: Pastikan pool $BUMP/WETH sudah dibuat di Uniswap V4
- Cek fee tier dan tickSpacing sesuai dengan pool yang ada
- Verifikasi currency0 dan currency1 sudah benar (sorted alphabetically)

### Error: "Insufficient liquidity"
- **Solusi**: Pool mungkin tidak memiliki cukup liquidity
- Cek liquidity di Uniswap interface
- Pertimbangkan menggunakan V3 Router sebagai fallback

### Error: "Invalid amount specified"
- **Solusi**: Pastikan `amountSpecified` adalah negative untuk exact input
- Pastikan amount dalam wei format

## 🔄 Fallback ke V3

Jika V4 pool tidak tersedia, bisa menggunakan V3 Router sebagai fallback:

\`\`\`typescript
// Fallback ke V3 Router
import { UNISWAP_V3_ROUTER2 } from "@/lib/constants"

// Use V3 Router for swap
const swapData = encodeFunctionData({
  abi: UNISWAP_V3_ROUTER_ABI,
  functionName: "exactInputSingle",
  args: [/* V3 params */],
})
\`\`\`

## 📚 References

- [Uniswap V4 Documentation](https://docs.uniswap.org/)
- [Uniswap V4 GitHub](https://github.com/Uniswap/v4-core)
- [Base Network Deployments](https://docs.verifiedpools.com/security/deployments)
