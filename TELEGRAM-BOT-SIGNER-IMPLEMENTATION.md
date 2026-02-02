# 🤖 Telegram Bot Signer Implementation Guide

Berdasarkan dokumentasi Privy: https://docs.privy.io/recipes/wallets/session-signer-use-cases/telegram-bot

## 📋 Overview

Guide ini menjelaskan bagaimana mengimplementasikan signers untuk ClawdBumpbot agar bot bisa execute transactions atas nama user.

---

## 🔄 Flow dengan Signers

### **Current Flow (Tanpa Signers):**
1. User login via Telegram di FarBump
2. Smart Wallet created
3. Mapping stored di database
4. Bot bisa check login status
5. ❌ Bot **TIDAK bisa** execute transactions

### **Enhanced Flow (Dengan Signers):**
1. User login via Telegram di FarBump
2. Smart Wallet created
3. **Signer added to wallet** ← NEW
4. **Signer private key stored securely** ← NEW
5. Mapping stored di database
6. Bot bisa check login status
7. ✅ Bot **BISA** execute transactions menggunakan signer

---

## 🚀 Implementation Steps

### **Step 1: Add Signer After Wallet Creation**

**File:** `app/api/v1/auth/telegram/add-signer/route.ts` (create new)

```typescript
import { NextRequest, NextResponse } from "next/server"
import { PrivyClient } from "@privy-io/server-auth"

const privy = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
)

export async function POST(request: NextRequest) {
  try {
    const { walletId } = await request.json()

    if (!walletId) {
      return NextResponse.json(
        { error: "Missing walletId" },
        { status: 400 }
      )
    }

    // Add signer to wallet
    const signer = await privy.wallets().addSigner({
      walletId: walletId,
      // Configure signer permissions via policies if needed
    })

    // Store signer private key securely
    // IMPORTANT: Store in secure storage (encrypted database, secrets manager, etc.)
    const signerPrivateKey = signer.privateKey // Get from signer response

    // Store in database (encrypted)
    // TODO: Implement secure storage

    return NextResponse.json({
      success: true,
      signerId: signer.id,
      // DO NOT return private key in response
    })
  } catch (error: any) {
    console.error("❌ Error adding signer:", error)
    return NextResponse.json(
      { error: error.message || "Failed to add signer" },
      { status: 500 }
    )
  }
}
```

---

### **Step 2: Store Signer Private Key Securely**

**File:** `lib/signer-storage.ts` (create new)

```typescript
import { createSupabaseServiceClient } from "@/lib/supabase"
import crypto from "crypto"

// Encryption key (store in environment variable)
const ENCRYPTION_KEY = process.env.SIGNER_ENCRYPTION_KEY!

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decrypt(text: string): string {
  const parts = text.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const encryptedText = Buffer.from(parts[1], 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}

export async function storeSignerPrivateKey(
  walletId: string,
  signerId: string,
  privateKey: string
) {
  const supabase = createSupabaseServiceClient()
  const encryptedKey = encrypt(privateKey)

  const { error } = await supabase
    .from("wallet_signers")
    .upsert({
      wallet_id: walletId,
      signer_id: signerId,
      encrypted_private_key: encryptedKey,
      created_at: new Date().toISOString(),
    })

  if (error) {
    throw new Error(`Failed to store signer: ${error.message}`)
  }
}

export async function getSignerPrivateKey(walletId: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from("wallet_signers")
    .select("encrypted_private_key")
    .eq("wallet_id", walletId)
    .single()

  if (error || !data) {
    return null
  }

  return decrypt(data.encrypted_private_key)
}
```

---

### **Step 3: Database Schema for Signers**

**File:** `DATABASE-SIGNER-STORAGE.sql` (create new)

```sql
-- Create wallet_signers table
CREATE TABLE IF NOT EXISTS wallet_signers (
  id BIGSERIAL PRIMARY KEY,
  wallet_id TEXT NOT NULL UNIQUE,
  signer_id TEXT NOT NULL UNIQUE,
  encrypted_private_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_signers_wallet_id ON wallet_signers(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_signers_signer_id ON wallet_signers(signer_id);

-- Enable RLS
ALTER TABLE wallet_signers ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role only
CREATE POLICY "Service role can manage wallet_signers"
  ON wallet_signers
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

---

### **Step 4: Use Signer in ClawdBumpbot**

**File:** `CLAWDBUMPBOT-SIGNER-EXAMPLE.md` (create new)

```typescript
import { Bot, Context } from "grammy"
import { PrivyClient } from "@privy-io/server-auth"
import { getSignerPrivateKey } from "@/lib/signer-storage"

const privy = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
)

// Configure Privy client with signer private key
// This allows bot to sign transactions
const signerPrivateKey = await getSignerPrivateKey(walletId)
privy.configureSigner({
  privateKey: signerPrivateKey,
})

// Bot command to execute transaction
bot.onText(/\/transact/, async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString()
  
  if (!telegramId) {
    await ctx.reply("❌ Cannot get Telegram ID")
    return
  }

  try {
    // Get user by Telegram ID
    const user = await privy.getUserByTelegramUserId(telegramId)
    
    if (!user) {
      await ctx.reply("❌ User not found. Please login to FarBump first.")
      return
    }

    // Get wallet
    const wallet = user.linkedAccounts.find(
      (account): account is WalletWithMetadata =>
        account.type === 'wallet' && 
        account.walletClientType === 'privy'
    )

    if (!wallet) {
      await ctx.reply("❌ Wallet not found")
      return
    }

    // Get signer private key
    const signerKey = await getSignerPrivateKey(wallet.id)
    
    if (!signerKey) {
      await ctx.reply("❌ Signer not configured for this wallet")
      return
    }

    // Configure Privy with signer
    privy.configureSigner({
      privateKey: signerKey,
    })

    // Execute transaction
    // Example: Swap transaction
    const transaction = {
      to: "0x...", // Token address
      value: "0", // ETH amount
      data: "0x...", // Transaction data
    }

    await privy.wallets().ethereum().sendTransaction(wallet.id, {
      caip2: 'eip155:8453', // Base chain
      params: { transaction },
    })

    await ctx.reply("✅ Transaction executed successfully!")
  } catch (error) {
    console.error("Error executing transaction:", error)
    await ctx.reply("❌ Failed to execute transaction")
  }
})
```

---

## 🔒 Security Considerations

### **1. Private Key Storage**

**CRITICAL:** Signer private keys must be stored securely:

- ✅ **Encrypt** private keys before storing
- ✅ **Use environment variable** for encryption key
- ✅ **Never** log or expose private keys
- ✅ **Use secure storage** (encrypted database, secrets manager)
- ✅ **Limit access** to signer storage functions

### **2. Signer Permissions**

**Configure policies** to limit what signer can do:

```typescript
// Add signer with policy
const signer = await privy.wallets().addSigner({
  walletId: walletId,
  policies: [
    {
      // Only allow specific transaction types
      allowedMethods: ['sendTransaction'],
      // Limit to specific token addresses
      allowedTokens: ['0x...'],
      // Limit transaction amount
      maxAmount: '1000000000000000000', // 1 ETH
    }
  ]
})
```

### **3. Authorization**

**Verify user authorization** before executing transactions:

- ✅ Check if user has authorized bot
- ✅ Verify transaction parameters
- ✅ Implement rate limiting
- ✅ Log all transactions

---

## 📋 Checklist

### **Implementation:**
- [ ] Create `wallet_signers` table in database
- [ ] Implement signer storage functions (encrypted)
- [ ] Create API endpoint to add signer
- [ ] Update `useTelegramPair` to add signer after pairing
- [ ] Configure Privy client with signer in bot
- [ ] Implement transaction execution in bot
- [ ] Add security measures (encryption, policies, etc.)

### **Security:**
- [ ] Encrypt signer private keys
- [ ] Store encryption key in environment variable
- [ ] Configure signer policies
- [ ] Implement authorization checks
- [ ] Add rate limiting
- [ ] Log all transactions

### **Testing:**
- [ ] Test signer creation
- [ ] Test private key encryption/decryption
- [ ] Test transaction execution from bot
- [ ] Test error handling
- [ ] Test security measures

---

## 🎯 Use Cases

### **1. Bot Execute Swap Transaction**

```typescript
// User sends: /swap 0.01 USDC
bot.onText(/\/swap (.+)/, async (ctx, match) => {
  const amount = match[1]
  // Execute swap transaction using signer
})
```

### **2. Bot Check Balance**

```typescript
// User sends: /balance
bot.onText(/\/balance/, async (ctx) => {
  // Get wallet balance
  const balance = await privy.wallets().ethereum().getBalance(walletId)
  await ctx.reply(`Balance: ${balance} ETH`)
})
```

### **3. Bot Start/Stop Session**

```typescript
// User sends: /start-bot
bot.onText(/\/start-bot/, async (ctx) => {
  // Call FarBump API to start bot session
  await fetch(`${FARBUMP_API_URL}/api/bot/session`, {
    method: "POST",
    body: JSON.stringify({
      userAddress: walletAddress,
      // ... session params
    }),
  })
})
```

---

## 📚 References

- [Privy Signers Documentation](https://docs.privy.io/recipes/wallets/session-signer-use-cases/telegram-bot)
- [Signer Quickstart](https://docs.privy.io/wallets/using-wallets/signers/quickstart)
- [Privy Node SDK](https://docs.privy.io/server-sdks/node)
- [Authorization Keys](https://docs.privy.io/controls/authorization-keys/using-owners/sign)

---

## ⚠️ Important Notes

1. **Signers are optional** - Current implementation works without signers
2. **Security is critical** - Private keys must be stored securely
3. **Policies recommended** - Limit what signer can do
4. **Testing required** - Test thoroughly before production

**Current implementation (without signers) is sufficient for basic bot integration!**

Signers are only needed if you want bot to execute transactions on user's behalf.

