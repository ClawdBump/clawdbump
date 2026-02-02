# CDP Paymaster Sender-based Sponsorship Setup Guide

## Overview

This guide explains how to configure **CDP Paymaster with Sender-based Sponsorship** for distributing credits from the user's Privy Smart Wallet to bot Smart Wallets.

### Sender-based Sponsorship Policy

**Key Benefits:**
- ✅ Only checks who is sending (User's Privy Smart Wallet)
- ✅ Does NOT check recipient addresses (bot wallets)
- ✅ No allowlist needed for bot wallet addresses
- ✅ Scalable - works for any number of bot wallets
- ✅ Gasless for users

**How it works:**
```
User's Privy Smart Wallet (Sender)
    ↓
CDP Paymaster checks: "Is this sender allowed?" ✅
    ↓
Transaction sponsored (GASLESS)
    ↓
Bot Wallet receives ETH (no check needed)
```

---

## Configuration Steps

### Step 1: Configure CDP Paymaster (Coinbase Developer Platform)

1. **Go to Coinbase Developer Platform:**
   - URL: https://portal.cdp.coinbase.com/
   - Login with your Coinbase account

2. **Navigate to Paymaster Settings:**
   - Click on your project
   - Go to **"Onchain Tools"** → **"Paymaster"** → **"Settings"**
   - Select **"Base Mainnet"** in the top right

3. **Set Sponsorship Policy to Sender-based:**
   - Find **"Sponsorship Policy"** section
   - Current: **Address-Based Sponsorship** (default)
   - Change to: **Sender-based Sponsorship**
   - This policy only checks the sender address, not recipients

4. **Configure Sender Allowlist (Optional but Recommended):**
   - Add your Privy Smart Wallet address(es) to the sender allowlist
   - This ensures your Privy Smart Wallets are recognized as valid senders
   - Format: One address per line
   - Example:
     ```
     0x3ee2cF4C93da4D00c27CB0339e0D6728C8774586
     0x9C3F66E40b34B3B642ecf48E42740b36C3cEe30A
     ```

5. **Save Configuration:**
   - Click **"Save"** or **"Update Configuration"**
   - Wait 1-2 minutes for changes to propagate

---

### Step 2: Configure Privy Dashboard

1. **Go to Privy Dashboard:**
   - URL: https://dashboard.privy.io/
   - Login with your Privy account

2. **Navigate to Smart Wallet Settings:**
   - Select your app
   - Go to **"Settings"** → **"Wallets"** → **"Smart Wallets"**
   - Find **"Paymaster"** section

3. **Configure CDP Paymaster:**
   - Select **"Coinbase CDP Paymaster"** (or "Custom Paymaster")
   - Enter your CDP Paymaster URL:
     ```
     https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY
     ```
   - Get this URL from: https://portal.cdp.coinbase.com/ → Onchain Tools → Paymaster
   - Click **"Save"**

4. **Verify Configuration:**
   - Privy will now use CDP Paymaster for all Smart Wallet transactions
   - Transactions will be sponsored by CDP Paymaster (Sender-based policy)

---

### Step 3: Verify Environment Variables

Ensure these environment variables are set:

```bash
# CDP Paymaster URL (used by Privy)
# This should match the URL configured in Privy Dashboard
COINBASE_CDP_BUNDLER_URL=https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY

# CDP API Credentials (for server-side operations)
CDP_API_KEY_ID=your-api-key-id
CDP_API_KEY_SECRET=your-api-key-secret

# Privy App ID
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
```

---

## How It Works

### Distribution Flow

1. **User clicks "Start Bumping"**
   - Frontend calls `distributeCredits()` hook

2. **Hook prepares distribution:**
   - Fetches credit balance from database
   - Calculates amounts per bot wallet
   - Prepares 5 individual transactions

3. **Privy Smart Wallet client sends transactions:**
   - Uses `smartWalletClient.sendTransaction()` with `isSponsored: true`
   - Privy automatically uses CDP Paymaster (configured in Dashboard)

4. **CDP Paymaster processes sponsorship:**
   - Checks: "Is the sender (Privy Smart Wallet) allowed?" ✅
   - Does NOT check recipients (bot wallets) - Sender-based policy
   - Sponsors gas fees for the transaction

5. **Transaction executed:**
   - ETH transferred from Privy Smart Wallet to bot wallet
   - Gas fees paid by CDP Paymaster (100% gasless for user)

6. **Repeat for all 5 bot wallets:**
   - Each transaction is sponsored individually
   - No allowlist needed for bot wallets

---

## Troubleshooting

### Error: "address not in allowlist"

**Cause:** CDP Paymaster is using Address-based sponsorship (checks both sender and recipient)

**Solution:**
1. Go to CDP Paymaster Settings
2. Change sponsorship policy to **"Sender-based"**
3. Wait 1-2 minutes for changes to propagate
4. Try again

### Error: "Paymaster not configured"

**Cause:** Privy Dashboard is not configured to use CDP Paymaster

**Solution:**
1. Go to Privy Dashboard → Settings → Wallets → Smart Wallets → Paymaster
2. Select "Coinbase CDP Paymaster"
3. Enter your CDP Paymaster URL
4. Save configuration

### Error: "Insufficient balance"

**Cause:** User's Privy Smart Wallet doesn't have enough ETH for distribution

**Solution:**
1. User needs to convert $BUMP to credit first
2. Ensure credit balance is sufficient for distribution

---

## Benefits of Sender-based Sponsorship

### ✅ Scalability
- No need to add each bot wallet to allowlist
- Works for any number of bot wallets
- Works for any user's bot wallets

### ✅ Simplicity
- Only need to configure sender addresses (Privy Smart Wallets)
- No need to update allowlist when creating new bot wallets
- One-time configuration

### ✅ Security
- Only approved senders (Privy Smart Wallets) can use Paymaster
- Recipients are not checked (but that's OK - they're just receiving ETH)
- Sender-based policy is more flexible than Address-based

---

## Testing

### 1. Test Distribution

```typescript
// In your app, click "Start Bumping"
// This will trigger distributeCredits() hook
// Check console logs for:
// ✅ "Sending individual transactions via Privy Smart Wallet with CDP Paymaster"
// ✅ "Paymaster: CDP Paymaster (Sender-based sponsorship)"
// ✅ Transaction hashes should appear
```

### 2. Verify Transactions

1. Go to BaseScan: https://basescan.org/
2. Search for your Privy Smart Wallet address
3. Check recent transactions
4. Verify:
   - Transactions are sponsored (gas fees = 0 for user)
   - Recipients are bot wallet addresses
   - All 5 transactions succeeded

### 3. Check CDP Paymaster Dashboard

1. Go to: https://portal.cdp.coinbase.com/
2. Navigate to: Onchain Tools → Paymaster → Usage
3. Verify:
   - Transactions are being sponsored
   - Sender addresses match your Privy Smart Wallets
   - Gas costs are being tracked

---

## Summary

✅ **CDP Paymaster with Sender-based Sponsorship** is the recommended approach for:
- Distributing credits from Privy Smart Wallets to bot wallets
- Avoiding allowlist complexity
- Maintaining gasless experience
- Scalability for multiple users and bot wallets

✅ **Configuration Required:**
1. CDP Paymaster: Set policy to "Sender-based"
2. Privy Dashboard: Configure CDP Paymaster URL
3. Environment Variables: Set CDP Paymaster URL

✅ **Result:**
- 100% gasless transactions for users
- No allowlist needed for bot wallets
- Scalable and maintainable solution

---

## References

- [CDP Paymaster Documentation](https://docs.cdp.coinbase.com/paymaster/docs/welcome)
- [Privy Smart Wallets](https://docs.privy.io/guide/react/smart-wallets)
- [CDP Paymaster Sponsorship Policies](https://docs.cdp.coinbase.com/paymaster/docs/sponsorship-policies)

