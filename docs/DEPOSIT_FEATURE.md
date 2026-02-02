# 💳 Deposit Feature Documentation

Dokumentasi untuk fitur **Deposit** dan **Refresh Balance** yang baru ditambahkan ke ClawdBump.

---

## 🎯 Overview

Dua fitur baru telah ditambahkan untuk meningkatkan user experience dalam mengelola credit:

1. **Button Deposit dengan QR Code** - Di bagian "Fuel Status" (`config-panel.tsx`)
2. **Refresh Balance dari Blockchain** - Icon spinner di bagian "Credits" (`wallet-card.tsx`)

---

## 1️⃣ Button Deposit dengan QR Code

### 📍 Lokasi
**Component:** `components/config-panel.tsx`  
**Section:** Fuel Status → Current Balance

### 🎨 UI/UX

```
┌─────────────────────────────────┐
│ Fuel Status                     │
├─────────────────────────────────┤
│ Current Balance                 │
│ $0.00 Credits                   │
│ Deposit ETH or WETH...          │
│                                 │
│ [💰 Deposit]  ← NEW BUTTON      │
└─────────────────────────────────┘
```

### ✨ Features

#### QR Code Dialog
Ketika user klik button **"Deposit"**, muncul dialog dengan:

1. **QR Code (256x256 px)**
   - Berisi alamat Smart Wallet Privy user
   - High error correction level (Level H)
   - Include margin untuk scanning yang lebih mudah

2. **Smart Wallet Address**
   - Display address lengkap (font mono, break-all)
   - Copy button dengan feedback visual (check icon)
   - Toast notification saat berhasil copy

3. **Network Warning**
   - Highlight: "Network: Base Mainnet"
   - Warning: "Only deposit on Base Network"
   - Prevent user deposit ke network lain

### 🔧 Technical Implementation

#### Dependencies
```bash
pnpm add qrcode.react
```

#### Imports
```typescript
import { QRCodeSVG } from "qrcode.react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { Wallet, Copy, Check } from "lucide-react"
import { toast } from "sonner"
```

#### State Management
```typescript
const [isQRDialogOpen, setIsQRDialogOpen] = useState(false)
const [copied, setCopied] = useState(false)
```

#### QR Code Generation
```typescript
<QRCodeSVG 
  value={smartWalletAddress}  // Smart Wallet address
  size={256}                   // 256x256 pixels
  level="H"                    // High error correction
  includeMargin={true}         // Include white margin
/>
```

#### Copy Address Function
```typescript
const handleCopyAddress = () => {
  if (smartWalletAddress && smartWalletAddress !== "0x000...000") {
    navigator.clipboard.writeText(smartWalletAddress)
    setCopied(true)
    toast.success("Address copied to clipboard!")
    setTimeout(() => setCopied(false), 2000)
  }
}
```

### 🎬 User Flow

```
1. User klik button "Deposit"
   ↓
2. Dialog terbuka dengan QR Code
   ↓
3. User scan QR Code ATAU copy address
   ↓
4. User transfer ETH/WETH dari wallet lain (Coinbase, MetaMask, etc)
   ↓
5. Credit otomatis bertambah (on-chain balance increases)
   ↓
6. User klik "Refresh" icon untuk sync database dengan blockchain
   ↓
7. Credit balance updated ✅
```

### 📝 Code Example

```typescript
<Dialog open={isQRDialogOpen} onOpenChange={setIsQRDialogOpen}>
  <DialogTrigger asChild>
    <Button 
      className="w-full" 
      size="sm"
      disabled={!smartWalletAddress || smartWalletAddress === "0x000...000"}
    >
      <Wallet className="h-4 w-4 mr-2" />
      Deposit
    </Button>
  </DialogTrigger>
  
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Deposit to Smart Wallet</DialogTitle>
      <DialogDescription>
        Scan QR code or copy address to deposit ETH/WETH
      </DialogDescription>
    </DialogHeader>
    
    {/* QR Code */}
    <div className="flex justify-center p-4 bg-white rounded-lg">
      <QRCodeSVG 
        value={smartWalletAddress}
        size={256}
        level="H"
        includeMargin={true}
      />
    </div>
    
    {/* Copy Address */}
    <div className="flex items-center gap-2">
      <div className="flex-1 p-3 bg-secondary rounded-lg">
        <p className="font-mono text-xs break-all">
          {smartWalletAddress}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={handleCopyAddress}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

---

## 2️⃣ Refresh Balance dari Blockchain

### 📍 Lokasi
**Component:** `components/wallet-card.tsx`  
**Section:** Credits (dengan icon RefreshCw)

### 🎨 UI/UX

```
┌─────────────────────────────────┐
│ Credits           [🔄]  ← ICON  │
│ $0.00                           │
│ Deposit ETH or WETH...          │
└─────────────────────────────────┘
```

### ✨ Features

#### Smart Balance Fetching
Ketika user klik icon **Refresh (🔄)**:

1. **Fetch from Blockchain (On-Chain)**
   - Native ETH balance via `publicClient.getBalance()`
   - WETH balance via `publicClient.readContract()`
   - Total = Native ETH + WETH

2. **Sync dengan Database**
   - Call `/api/credit/add` dengan `syncOnly: true`
   - Update `user_credits.balance_wei` to match on-chain
   - Prevent discrepancies between blockchain and database

3. **Toast Notifications**
   - Success: "Balance updated from blockchain" + amount details
   - Warning: "Fetched but failed to sync" (if API error)
   - Error: "Failed to fetch from blockchain" (if RPC error)

4. **Loading State**
   - Icon spinner animates while fetching
   - Button disabled during refresh
   - Auto-hide after 500ms completion delay

### 🔧 Technical Implementation

#### Dependencies
```typescript
import { usePublicClient } from "wagmi"
import { formatEther } from "viem"
import { toast } from "sonner"
```

#### Refresh Balance Function
```typescript
const handleRefreshBalance = async () => {
  if (!smartWalletAddress || smartWalletAddress === "0x000...000") {
    toast.error("Wallet not connected")
    return
  }
  
  setIsRefreshing(true)
  
  try {
    // 1. Fetch Native ETH balance
    const nativeEthBalance = await publicClient.getBalance({
      address: smartWalletAddress as `0x${string}`,
    })
    
    // 2. Fetch WETH balance
    const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"
    const WETH_ABI = [
      {
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ]
    
    const wethBalance = await publicClient.readContract({
      address: WETH_ADDRESS,
      abi: WETH_ABI,
      functionName: "balanceOf",
      args: [smartWalletAddress],
    })
    
    // 3. Calculate total on-chain balance
    const totalOnChainBalanceWei = nativeEthBalance + wethBalance
    const totalEth = formatEther(totalOnChainBalanceWei)
    
    console.log(`✅ On-chain: ${totalEth} ETH`)
    
    // 4. Sync with database
    const syncResponse = await fetch("/api/credit/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAddress: smartWalletAddress,
        syncOnly: true,
      }),
    })
    
    const syncData = await syncResponse.json()
    
    if (syncResponse.ok && syncData.success) {
      toast.success("Balance updated from blockchain", {
        description: `${totalEth} ETH`,
      })
    }
    
    // 5. Refetch from database (React Query)
    await refetchCredit()
    
  } catch (error: any) {
    toast.error("Failed to fetch balance", {
      description: error.message,
    })
  } finally {
    setTimeout(() => setIsRefreshing(false), 500)
  }
}
```

### 🎬 User Flow

```
1. User klik icon Refresh (🔄)
   ↓
2. Fetch Native ETH balance from blockchain
   ↓
3. Fetch WETH balance from blockchain
   ↓
4. Calculate Total = Native ETH + WETH
   ↓
5. Sync database with on-chain balance via API
   ↓
6. Refetch credit from database (React Query)
   ↓
7. Display updated balance with toast notification ✅
```

### 📊 Balance Sources

| Step | Source | Value |
|------|--------|-------|
| 1. On-Chain | Blockchain (RPC) | Native ETH + WETH |
| 2. Database | Supabase | `user_credits.balance_wei` |
| 3. Sync | API Call | Match database to on-chain |
| 4. Display | React Query | From database (after sync) |

---

## 🔄 Integration dengan Credit System

### Credit Flow dengan Deposit

```
1. USER DEPOSIT VIA QR CODE
   User scan QR → Transfer ETH from external wallet
   ✅ On-chain balance increases
   
2. REFRESH FROM BLOCKCHAIN
   User klik Refresh icon
   ✅ Fetch: Native ETH + WETH from blockchain
   ✅ Sync: Update database to match on-chain
   ✅ Display: Show updated credit balance
   
3. DISTRIBUTE CREDITS
   User klik "Distribute Credits"
   ✅ Transfer WETH to 5 bot wallets
   ✅ Deduct from user_credits.balance_wei
   ✅ Add to bot_wallet_credits.weth_balance_wei
   
4. START BUMPING
   Bot execute swaps automatically
   ✅ Deduct from bot_wallet_credits.weth_balance_wei
   ✅ Total credit decreases with each swap
```

### API Endpoints Used

1. **`GET /api/credit-balance`**
   - Get credit balance from database
   - Used by React Query hook

2. **`POST /api/credit/add`**
   - Sync database with on-chain balance
   - Called by Refresh Balance function
   - Parameters: `{ userAddress, syncOnly: true }`

3. **`POST /api/credit/sync`**
   - Alternative sync endpoint (optional)
   - More granular control over sync behavior

---

## 🎨 UI Components

### Button Deposit
```tsx
<Button className="w-full" size="sm">
  <Wallet className="h-4 w-4 mr-2" />
  Deposit
</Button>
```

### QR Code Display
```tsx
<div className="flex justify-center p-4 bg-white rounded-lg">
  <QRCodeSVG 
    value={smartWalletAddress}
    size={256}
    level="H"
    includeMargin={true}
  />
</div>
```

### Refresh Icon
```tsx
<Button
  size="sm"
  variant="ghost"
  onClick={handleRefreshBalance}
  disabled={showSpinner || !isSmartAccountActive}
  className="h-6 w-6 p-0"
>
  <RefreshCw className={`h-3.5 w-3.5 ${showSpinner ? "animate-spin" : ""}`} />
</Button>
```

### Toast Notifications
```tsx
// Success
toast.success("Balance updated from blockchain", {
  description: `${totalEth} ETH (${nativeEth} Native + ${weth} WETH)`,
})

// Warning
toast.warning("Fetched but failed to sync database", {
  description: errorMessage,
})

// Error
toast.error("Failed to fetch balance from blockchain", {
  description: error.message,
})
```

---

## 🧪 Testing

### Test Case 1: Deposit Flow
1. ✅ Click "Deposit" button
2. ✅ Dialog opens with QR code
3. ✅ Scan QR code with mobile wallet
4. ✅ Transfer 0.01 ETH to address
5. ✅ Wait for confirmation (1-2 minutes on Base)
6. ✅ Click Refresh icon
7. ✅ Credit balance updated

### Test Case 2: Refresh Balance
1. ✅ User has existing balance on-chain
2. ✅ Click Refresh icon
3. ✅ Spinner animates
4. ✅ Toast shows "Balance updated"
5. ✅ Credit display updates
6. ✅ Database synced with on-chain

### Test Case 3: Copy Address
1. ✅ Click "Deposit" button
2. ✅ Dialog opens
3. ✅ Click Copy button
4. ✅ Check icon appears
5. ✅ Toast shows "Address copied"
6. ✅ Paste address → matches Smart Wallet

### Test Case 4: Error Handling
1. ✅ No wallet connected → Button disabled
2. ✅ RPC error → Toast shows error message
3. ✅ API error → Warning toast but still shows on-chain balance
4. ✅ Network mismatch → Warning in dialog

---

## 🔒 Security Considerations

### 1. Address Validation
- ✅ Validate Smart Wallet address exists before showing QR
- ✅ Prevent showing "0x000...000" as valid address
- ✅ Disable buttons if wallet not connected

### 2. Network Safety
- ✅ Display "Base Mainnet" warning prominently
- ✅ Warn users about depositing to wrong network
- ✅ Use correct WETH contract address for Base

### 3. Balance Accuracy
- ✅ Fetch from blockchain as source of truth
- ✅ Sync database to prevent discrepancies
- ✅ Log balance differences for debugging

### 4. Error Handling
- ✅ Graceful degradation if RPC fails
- ✅ Toast notifications for all states
- ✅ Loading states prevent double-clicking

---

## 📚 Related Documentation

- **Credit System**: `docs/CREDIT_SYSTEM.md`
- **API Reference**: `docs/API_ENDPOINTS.md` (create if needed)
- **Component Library**: Shadcn/ui components

---

## 🎉 Summary

### ✅ Features Implemented

1. **Button Deposit dengan QR Code**
   - QR Code generation (256x256 px)
   - Copy address functionality
   - Network warning (Base Mainnet)
   - Dialog UI dengan Shadcn

2. **Refresh Balance dari Blockchain**
   - Fetch Native ETH balance
   - Fetch WETH balance
   - Sync database with on-chain
   - Toast notifications
   - Loading states

### 📦 Dependencies Added
```json
{
  "qrcode.react": "^4.2.0"
}
```

### 🔨 Files Modified
1. `components/config-panel.tsx` - Added Deposit button with QR dialog
2. `components/wallet-card.tsx` - Enhanced Refresh to fetch from blockchain
3. `docs/DEPOSIT_FEATURE.md` - This documentation

---

**Dibuat pada:** 2026-02-03  
**Last Updated:** 2026-02-03  
**Version:** 1.0.0

