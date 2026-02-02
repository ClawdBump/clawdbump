# 💰 ClawdBump Credit System Documentation

Dokumentasi lengkap sistem credit tracking untuk ClawdBump - mencatat dan mengurangi credit user saat melakukan bumping/swap.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Credit Flow](#credit-flow)
4. [API Endpoints](#api-endpoints)
5. [React Hooks](#react-hooks)
6. [Usage Examples](#usage-examples)
7. [Credit Calculation](#credit-calculation)

---

## 🎯 Overview

Sistem credit di ClawdBump menggunakan **3 komponen utama**:

1. **Main Wallet Credit** (`user_credits.balance_wei`)
   - Credit yang berada di Privy Smart Wallet user
   - Berasal dari deposit ETH/WETH
   
2. **Bot Wallet Credits** (`bot_wallet_credits.weth_balance_wei`)
   - Credit yang sudah didistribusikan ke 5 bot wallets
   - Berasal dari distribusi credit dari main wallet
   
3. **Total Credit** = Main Wallet Credit + Bot Wallets Credit
   - Ini yang ditampilkan ke user
   - 1 WETH = 1 ETH = 1 Credit (nilai 1:1)

---

## 🗄️ Database Schema

### Table: `user_credits`
Menyimpan credit balance user di main wallet (Privy Smart Account).

```sql
CREATE TABLE user_credits (
  id UUID PRIMARY KEY,
  user_address TEXT NOT NULL UNIQUE,
  balance_wei TEXT NOT NULL DEFAULT '0',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Kolom:**
- `user_address`: Alamat Privy Smart Wallet (lowercase)
- `balance_wei`: Balance credit dalam wei (WETH)
- `last_updated`: Waktu terakhir update
- `created_at`: Waktu record dibuat

---

### Table: `bot_wallet_credits`
Menyimpan credit yang sudah didistribusikan ke bot wallets.

```sql
CREATE TABLE bot_wallet_credits (
  id UUID PRIMARY KEY,
  user_address TEXT NOT NULL,
  bot_wallet_address TEXT NOT NULL,
  weth_balance_wei TEXT NOT NULL DEFAULT '0',
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_address, bot_wallet_address)
);
```

**Kolom:**
- `user_address`: Alamat user (main wallet)
- `bot_wallet_address`: Alamat bot wallet (Smart Account)
- `weth_balance_wei`: Balance WETH dalam wei
- `tx_hash`: Transaction hash distribusi terakhir

**Important:** Hanya 1 row per `bot_wallet_address` per user (UNIQUE constraint).

---

### Table: `bot_logs`
Mencatat semua aktivitas swap dan transaksi bot.

```sql
CREATE TABLE bot_logs (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES bot_sessions(id),
  user_address TEXT NOT NULL,
  bot_wallet_address TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  tx_hash TEXT,
  amount_wei TEXT,
  token_address TEXT,
  error_details TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔄 Credit Flow

### 1️⃣ **DEPOSIT ETH/WETH** (Menambah Credit)

```
User Deposits ETH/WETH
         ↓
Frontend calls /api/credit/add
         ↓
API checks on-chain balance (ETH + WETH)
         ↓
API updates user_credits.balance_wei
         ↓
Credit balance increases ✅
```

**Code Example:**
```typescript
import { useAddCredit } from "@/hooks/use-add-credit"

const { addCredit } = useAddCredit()

// After user deposits 1 ETH
await addCredit({
  userAddress: "0x...",
  amountWei: parseEther("1").toString(),
  txHash: "0x...",
})
```

---

### 2️⃣ **DISTRIBUTE CREDITS** (Transfer ke Bot Wallets)

```
User clicks "Distribute Credits"
         ↓
Frontend transfers WETH to 5 bot wallets (on-chain)
         ↓
Frontend calls /api/bot/record-distribution
         ↓
API adds to bot_wallet_credits.weth_balance_wei
API subtracts from user_credits.balance_wei
         ↓
Total credit remains same (no double counting) ✅
```

**Code Example:**
```typescript
import { useDistributeCredits } from "@/hooks/use-distribute-credits"

const { distribute } = useDistributeCredits()

await distribute({
  userAddress: "0x...",
  botWallets: [/* 5 bot wallets */],
  creditBalanceWei: parseEther("5"),
})
```

**Database Changes:**
```
Before:
- user_credits.balance_wei = 5 ETH
- bot_wallet_credits (total) = 0 ETH
- Total = 5 ETH ✅

After:
- user_credits.balance_wei = 0 ETH
- bot_wallet_credits (total) = 5 ETH
- Total = 5 ETH ✅ (no double counting)
```

---

### 3️⃣ **EXECUTE SWAP** (Mengurangi Credit)

```
Bot executes swap (bumping)
         ↓
Swap transaction executed on-chain
         ↓
API /api/bot/execute-swap deducts credit
         ↓
API updates bot_wallet_credits.weth_balance_wei
         ↓
Credit balance decreases ✅
```

**Database Changes:**
```
Before Swap:
- bot_wallet_credits.weth_balance_wei = 1 ETH
- Total = 1 ETH

After Swap (0.1 ETH used):
- bot_wallet_credits.weth_balance_wei = 0.9 ETH
- Total = 0.9 ETH ✅
```

**Code (Automatic):**
```typescript
// In execute-swap/route.ts (line 1448-1508)
const currentBalance = BigInt(creditRecord.weth_balance_wei || "0")
const newBalance = currentBalance - amountWei

await supabase
  .from("bot_wallet_credits")
  .update({ weth_balance_wei: newBalance.toString() })
  .eq("id", creditRecord.id)
```

---

### 4️⃣ **CHECK BALANCE** (Menampilkan Credit)

```
Frontend queries credit balance
         ↓
API /api/credit-balance gets:
  - user_credits.balance_wei (main wallet)
  - SUM(bot_wallet_credits.weth_balance_wei) (bot wallets)
         ↓
Total Credit = Main + Bot Wallets
         ↓
Display to user ✅
```

**Code Example:**
```typescript
import { useCreditBalance } from "@/hooks/use-credit-balance"

const { data, isLoading } = useCreditBalance(userAddress)

console.log(`Total Credit: ${data.balanceEth} ETH`)
console.log(`Main Wallet: ${data.mainWalletCreditWei} wei`)
console.log(`Bot Wallets: ${data.botWalletCreditsWei} wei`)
```

---

## 🔌 API Endpoints

### 1. `POST /api/credit/add`
**Menambahkan credit** saat user deposit ETH/WETH.

**Request:**
```json
{
  "userAddress": "0x...",
  "amountWei": "1000000000000000000",  // 1 ETH
  "txHash": "0x...",                    // Optional
  "syncOnly": false                     // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Credit added successfully",
  "previousCreditWei": "0",
  "previousCreditEth": "0",
  "newCreditWei": "1000000000000000000",
  "newCreditEth": "1",
  "addedWei": "1000000000000000000",
  "addedEth": "1",
  "txHash": "0x..."
}
```

---

### 2. `POST /api/credit/sync`
**Sync credit** dengan on-chain balance (jika berbeda).

**Request:**
```json
{
  "userAddress": "0x...",
  "onChainBalanceWei": "1000000000000000000",
  "syncUp": false  // Optional: allow sync up if on-chain > database
}
```

**Response:**
```json
{
  "success": true,
  "synced": true,
  "message": "Credit synced with on-chain balance",
  "syncReason": "On-chain balance is lower than database credit",
  "previousCreditWei": "2000000000000000000",
  "newCreditWei": "1000000000000000000"
}
```

---

### 3. `POST /api/credit-balance`
**Get credit balance** (main wallet + bot wallets).

**Request:**
```json
{
  "userAddress": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "balanceWei": "5000000000000000000",
  "balanceEth": "5",
  "mainWalletCreditWei": "2000000000000000000",
  "botWalletCreditsWei": "3000000000000000000",
  "lastUpdated": "2024-01-01T00:00:00.000Z"
}
```

---

### 4. `POST /api/bot/record-distribution`
**Record distribusi credit** ke bot wallets.

**Request:**
```json
{
  "userAddress": "0x...",
  "distributions": [
    {
      "botWalletAddress": "0x...",
      "amountWei": "1000000000000000000",
      "wethAmountWei": "1000000000000000000"
    }
  ],
  "txHash": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Distribution recorded successfully",
  "recordsCount": 5
}
```

**Important:** API ini juga:
- ✅ Menambah `bot_wallet_credits.weth_balance_wei`
- ✅ Mengurangi `user_credits.balance_wei`
- ✅ Mencegah double counting

---

### 5. `POST /api/bot/consume-credit`
**Consume credit** saat bot wallet melakukan swap.

**Request:**
```json
{
  "userAddress": "0x...",
  "botWalletAddress": "0x...",
  "consumedWethAmountWei": "100000000000000000"  // 0.1 ETH
}
```

**Response:**
```json
{
  "success": true,
  "message": "Credit consumed successfully",
  "consumedWethAmountWei": "100000000000000000",
  "remainingCreditWei": "900000000000000000"
}
```

---

### 6. `POST /api/bot/execute-swap`
**Execute swap** dan **otomatis mengurangi credit**.

**Request:**
```json
{
  "sessionId": "uuid",
  "walletIndex": 0
}
```

**Response:**
```json
{
  "message": "Swap executed successfully",
  "txHash": "0x...",
  "nextIndex": 1,
  "remainingBalance": "0.9",
  "sellAmount": "0.1"
}
```

**Note:** API ini **otomatis memanggil logic pengurangan credit** (line 1448-1508).

---

## 🎣 React Hooks

### 1. `useAddCredit()`
Hook untuk menambahkan credit saat deposit.

```typescript
import { useAddCredit } from "@/hooks/use-add-credit"

const { addCredit, isPending, isSuccess, error } = useAddCredit()

// Add credit after deposit
await addCredit({
  userAddress: "0x...",
  amountWei: parseEther("1").toString(),
  txHash: "0x...",
})
```

---

### 2. `useCreditBalance()`
Hook untuk mengambil credit balance.

```typescript
import { useCreditBalance } from "@/hooks/use-credit-balance"

const { data, isLoading, error, refetch } = useCreditBalance(userAddress)

console.log(`Total: ${data.balanceEth} ETH`)
console.log(`Main: ${formatEther(BigInt(data.mainWalletCreditWei))} ETH`)
console.log(`Bots: ${formatEther(BigInt(data.botWalletCreditsWei))} ETH`)
```

---

### 3. `useDistributeCredits()`
Hook untuk distribute credits ke bot wallets.

```typescript
import { useDistributeCredits } from "@/hooks/use-distribute-credits"

const { distribute, isPending, isSuccess, status } = useDistributeCredits()

await distribute({
  userAddress: "0x...",
  botWallets: [/* 5 bot wallets */],
  creditBalanceWei: parseEther("5"),
})
```

---

## 📖 Usage Examples

### Example 1: User Deposits 5 ETH

```typescript
// Step 1: User deposits 5 ETH to Privy Smart Account
const depositTxHash = await smartWallet.sendTransaction({
  to: smartWalletAddress,
  value: parseEther("5"),
})

// Step 2: Record deposit in database
const { addCredit } = useAddCredit()
await addCredit({
  userAddress: smartWalletAddress,
  amountWei: parseEther("5").toString(),
  txHash: depositTxHash,
})

// Result:
// ✅ user_credits.balance_wei = 5 ETH
// ✅ Total Credit = 5 ETH
```

---

### Example 2: User Distributes Credits to Bot Wallets

```typescript
// Step 1: Get bot wallets
const { data: botWallets } = useBotWallets(userAddress)

// Step 2: Distribute credits
const { distribute } = useDistributeCredits()
await distribute({
  userAddress,
  botWallets,
  creditBalanceWei: parseEther("5"),
})

// Result:
// ✅ user_credits.balance_wei = 0 ETH
// ✅ bot_wallet_credits (total) = 5 ETH
// ✅ Total Credit = 5 ETH (no change, no double counting)
```

---

### Example 3: Bot Executes Swap (0.1 ETH)

```typescript
// Automatic - called by bumping-worker.ts
const response = await fetch("/api/bot/execute-swap", {
  method: "POST",
  body: JSON.stringify({
    sessionId: "uuid",
    walletIndex: 0,
  }),
})

// Result:
// ✅ Swap executed on-chain
// ✅ bot_wallet_credits.weth_balance_wei -= 0.1 ETH
// ✅ Total Credit = 4.9 ETH
```

---

### Example 4: Check Credit Balance

```typescript
const { data } = useCreditBalance(userAddress)

console.log(`Total Credit: ${data.balanceEth} ETH`)
console.log(`In USD: $${data.balanceEth * ethPriceUsd}`)

// Result:
// Total Credit: 4.9 ETH
// In USD: $14,700 (assuming ETH = $3000)
```

---

## 🧮 Credit Calculation

### Formula:

```
Total Credit (ETH) = user_credits.balance_wei (main wallet)
                   + SUM(bot_wallet_credits.weth_balance_wei) (bot wallets)

Total Credit (USD) = Total Credit (ETH) × ETH Price (USD)
```

### Example Calculation:

```
Main Wallet Credit: 2 ETH
Bot Wallet #1: 0.5 ETH
Bot Wallet #2: 0.5 ETH
Bot Wallet #3: 0.5 ETH
Bot Wallet #4: 0.5 ETH
Bot Wallet #5: 0.5 ETH

Total Credit = 2 + (0.5 × 5) = 4.5 ETH

If ETH = $3000 USD:
Total Credit = 4.5 × 3000 = $13,500 USD
```

---

## ✅ Credit System Checklist

- [x] Database schema (`user_credits`, `bot_wallet_credits`, `bot_logs`)
- [x] API endpoint untuk **add credit** (`/api/credit/add`)
- [x] API endpoint untuk **sync credit** (`/api/credit/sync`)
- [x] API endpoint untuk **get balance** (`/api/credit-balance`)
- [x] API endpoint untuk **distribute credits** (`/api/bot/record-distribution`)
- [x] API endpoint untuk **consume credit** (`/api/bot/consume-credit`)
- [x] API endpoint untuk **execute swap** (auto-deduct) (`/api/bot/execute-swap`)
- [x] React hook untuk **add credit** (`useAddCredit`)
- [x] React hook untuk **get balance** (`useCreditBalance`)
- [x] React hook untuk **distribute** (`useDistributeCredits`)
- [x] **Bumping worker** auto-deduct credit setelah swap
- [x] **Execute swap** auto-deduct credit setelah swap
- [x] **Session validation** check credit sebelum start bumping
- [x] **Auto-stop session** jika semua wallet depleted

---

## 🎉 Summary

**Sistem credit ClawdBump sudah LENGKAP dan TERINTEGRASI!**

### ✅ Yang Sudah Diimplementasikan:

1. **Add Credit** - Saat user deposit ETH/WETH
2. **Distribute Credits** - Transfer dari main wallet ke bot wallets
3. **Consume Credit** - Pengurangan credit saat swap
4. **Check Balance** - Menampilkan total credit
5. **Auto-deduction** - Credit otomatis dikurangi saat bumping
6. **Session validation** - Validasi credit sebelum start
7. **Auto-stop** - Stop session jika credit habis

### 📝 Cara Penggunaan:

1. User deposit ETH/WETH → Call `useAddCredit()`
2. User distribute → Call `useDistributeCredits()`
3. User start bumping → Credit otomatis dikurangi
4. Display balance → Use `useCreditBalance()`

### 🔒 Keamanan:

- ✅ Database balance sebagai source of truth
- ✅ Validasi on-chain balance untuk prevent bypass
- ✅ Unique constraint untuk prevent double counting
- ✅ Atomic operations untuk consistency
- ✅ Session validation untuk prevent overdraft

---

**Dokumentasi dibuat pada:** 2026-02-03  
**Last Updated:** 2026-02-03  
**Version:** 1.0.0

