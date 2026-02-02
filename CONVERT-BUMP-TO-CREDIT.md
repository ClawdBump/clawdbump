# Convert $BUMP to Credit - Implementation Guide

Dokumentasi lengkap implementasi fitur "Convert $BUMP to Credit" pada FarBump.

## 📋 Overview

Fitur ini memungkinkan user mengkonversi token $BUMP mereka menjadi saldo ETH (Fuel) yang disimpan di Smart Wallet, namun dicatat secara off-chain di database sebagai "Credit".

## 🔄 Logic Pembagian (90/5/5)

Setiap konversi melakukan:

1. **5% dari total $BUMP** → Dikirim langsung ke `TREASURY_ADDRESS` sebagai fee (dalam bentuk token $BUMP)
2. **95% dari total $BUMP** → Di-swap menjadi ETH melalui Uniswap V3 Router di Base
3. **Dari hasil swap ETH:**
   - **5%** → Dikirim ke `TREASURY_ADDRESS` sebagai App Fee
   - **90%** → Tetap di Smart Wallet user sebagai Credit (dicatat di database)

## 📁 File Structure

\`\`\`
FarBump/
├── lib/
│   ├── constants.ts          # Contract addresses & constants
│   └── supabase.ts           # Supabase client (client & service role)
├── hooks/
│   ├── use-convert-fuel.ts   # Frontend hook untuk konversi
│   └── use-credit-balance.ts # Hook untuk fetch credit balance
├── app/
│   └── api/
│       └── sync-credit/
│           └── route.ts      # Backend API untuk sync credit ke database
└── DATABASE-SCHEMA.md        # Database schema documentation
\`\`\`

## 🔧 Setup

### 1. Environment Variables

Pastikan file `.env.local` memiliki:

\`\`\`env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Server-side only!

# Base RPC (optional)
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
\`\`\`

### 2. Database Setup

Jalankan SQL script dari `DATABASE-SCHEMA.md` di Supabase SQL Editor untuk membuat:
- Tabel `user_credits`
- Tabel `conversion_logs`
- Function `increment_user_credit` (optional)

### 3. Contract Addresses

Semua address sudah dikonfigurasi di `lib/constants.ts`:
- `BUMP_TOKEN_ADDRESS`: 0x94ce728849431818ec9a0cf29bdb24fe413bbb07
- `TREASURY_ADDRESS`: 0x831204121Dbf75Fd11256a96831E6acD669B4bf6
- `BASE_WETH_ADDRESS`: 0x4200000000000000000000000000000000000006
- `UNISWAP_V3_ROUTER2`: 0x2626664c2603336E57B271c5C0b26F42126eED1B

## 💻 Usage

### Frontend: Convert $BUMP to Credit

\`\`\`typescript
import { useConvertFuel } from "@/hooks/use-convert-fuel"

function ConvertButton() {
  const { convert, isPending, isSuccess, error, hash } = useConvertFuel()
  
  const handleConvert = async () => {
    await convert("100") // Convert 100 $BUMP
  }
  
  return (
    <button onClick={handleConvert} disabled={isPending}>
      {isPending ? "Converting..." : "Convert to Credit"}
    </button>
  )
}
\`\`\`

### Frontend: Display Credit Balance

\`\`\`typescript
import { useCreditBalance } from "@/hooks/use-credit-balance"

function CreditDisplay({ userAddress }: { userAddress: string }) {
  const { data, isLoading } = useCreditBalance(userAddress)
  
  if (isLoading) return <div>Loading...</div>
  
  return (
    <div>
      <p>Credit Balance: ${data?.balanceUsd?.toFixed(2) || "0.00"}</p>
      <p>ETH: {data?.balanceEth || "0"}</p>
    </div>
  )
}
\`\`\`

### Backend: Sync Credit (Automatic)

API `/api/sync-credit` dipanggil otomatis setelah transaksi sukses. Manual call:

\`\`\`typescript
const response = await fetch("/api/sync-credit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    txHash: "0x...",
    userAddress: "0x...",
    amountBump: "100",
    amountBumpWei: "100000000000000000000",
  }),
})
\`\`\`

## 🔐 Security Features

1. **Transaction Verification**: API memverifikasi txHash sebelum update database
2. **Treasury Fee Validation**: Memastikan 5% fee dikirim ke treasury
3. **RLS Bypass**: API menggunakan service_role key untuk bypass RLS
4. **Atomic Increment**: Menggunakan SQL increment untuk menghindari race condition
5. **BigInt Handling**: Semua nilai Wei disimpan sebagai string untuk presisi

## ⚠️ Important Notes

### Uniswap Pool Fee Tier

Hook `use-convert-fuel.ts` menggunakan fee tier `500` (0.05%) untuk Uniswap swap. **Pastikan pool $BUMP/WETH di Base menggunakan fee tier yang sama**, atau update constant di hook.

Untuk cek fee tier pool:
1. Buka Uniswap V3 Pool: https://info.uniswap.org/#/base/pools
2. Cari pool $BUMP/WETH
3. Lihat fee tier (biasanya 0.05%, 0.3%, atau 1%)

### Batch Transaction Limitation

Karena Privy smartWalletClient tidak mendukung batch transaction langsung, hook mengirim transaksi secara berurutan:
1. Transfer 5% $BUMP ke treasury
2. Approve Uniswap router
3. Swap 95% $BUMP ke ETH

**Note**: Transfer 5% ETH fee ke treasury dilakukan di transaksi terpisah atau dihitung di backend.

### ETH Amount Calculation

API route menghitung ETH credit berdasarkan:
1. WETH Transfer events di transaction logs (primary method)
2. Fallback: Balance change atau trace (jika tersedia)

**Rekomendasi**: Gunakan RPC yang support `traceTransaction` untuk akurasi maksimal.

## 🐛 Troubleshooting

### Error: "Paymaster billing not configured"
- **Solusi**: Setup billing di Coinbase CDP Dashboard untuk Base mainnet

### Error: "Transaction verification failed"
- **Solusi**: Pastikan transaksi sudah confirmed dan status = success
- Cek apakah treasury fee transfer ada di logs

### Error: "Failed to update user credit balance"
- **Solusi**: Pastikan `SUPABASE_SERVICE_ROLE_KEY` sudah di-set
- Pastikan tabel `user_credits` sudah dibuat
- Cek RLS policies

### Credit balance tidak update
- **Solusi**: 
  1. Cek apakah API `/api/sync-credit` dipanggil setelah transaksi
  2. Cek console logs untuk error
  3. Verifikasi txHash di block explorer
  4. Pastikan WETH transfer events ada di transaction

## 📊 Database Schema

Lihat `DATABASE-SCHEMA.md` untuk detail lengkap schema dan SQL scripts.

## 🔄 Flow Diagram

\`\`\`
User clicks "Convert"
    ↓
Frontend: useConvertFuel.convert()
    ↓
1. Transfer 5% $BUMP → Treasury
2. Approve Uniswap Router
3. Swap 95% $BUMP → ETH
    ↓
Transaction Confirmed
    ↓
Frontend: Call /api/sync-credit
    ↓
Backend: Verify txHash
    ↓
Backend: Calculate ETH credit (90%)
    ↓
Backend: Update user_credits.balance_wei
    ↓
Backend: Save conversion_logs
    ↓
Success ✅
\`\`\`

## 🚀 Next Steps

1. **UI Integration**: Tambahkan UI component untuk convert button dan credit display
2. **Slippage Protection**: Tambahkan slippage protection untuk Uniswap swap
3. **Transaction History**: Tampilkan history konversi dari `conversion_logs`
4. **Multi-step UI**: Tampilkan progress untuk setiap step konversi
5. **Error Recovery**: Implement retry mechanism untuk failed sync









