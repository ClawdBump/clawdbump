# 🚀 CDP SDK V2 Setup Guide

Complete setup guide for Coinbase Developer Platform (CDP) Server Wallets V2.

## 📚 Official Documentation

- **Quickstart**: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart
- **Managing Accounts**: https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/managing-accounts
- **Authentication**: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/authentication

---

## ✅ Prerequisites

- Node.js 22.x+ installed
- A Coinbase Developer Platform account
- Access to Vercel (for deployment)

---

## 📝 Step 1: Create CDP API Key

### 1.1 Login to CDP Portal

Go to: https://portal.cdp.coinbase.com/

### 1.2 Create API Key

1. Navigate to **"API Keys"** section
2. Click **"Create API Key"**
3. Select **"Server"** as the key type
4. Give it a name (e.g., "FarBump Bot Wallets")
5. Click **"Create"**

### 1.3 Download Credentials

The portal will generate a JSON file like this:

```json
{
  "name": "organizations/abc123-def4-5678-90ab-cdef12345678/apiKeys/xyz789-abc1-2345-6789-abcdef123456",
  "privateKey": "-----BEGIN EC PRIVATE KEY-----\nMHc...YOUR-KEY-HERE...7oc=\n-----END EC PRIVATE KEY-----"
}
```

**⚠️ IMPORTANT: Save this file securely! You cannot download it again.**

### 1.4 Generate Wallet Secret (Optional but Recommended)

1. In the same API Key creation flow, look for **"Generate Wallet Secret"**
2. Click **"Generate"**
3. Copy the secret (looks like: `ws_abc123def456...`)
4. Save it securely

---

## 🔧 Step 2: Extract Environment Variables

From the downloaded JSON file, extract:

### **CDP_API_KEY_ID**

Extract from the `"name"` field. 

**Example:**
```json
"name": "organizations/abc123-def4-5678-90ab-cdef12345678/apiKeys/xyz789-abc1-2345-6789-abcdef123456"
```

**Your CDP_API_KEY_ID:**
```
organizations/abc123-def4-5678-90ab-cdef12345678/apiKeys/xyz789-abc1-2345-6789-abcdef123456
```

### **CDP_API_KEY_SECRET**

Extract from the `"privateKey"` field.

**Example:**
```json
"privateKey": "-----BEGIN EC PRIVATE KEY-----\nMHc...YOUR-KEY-HERE...7oc=\n-----END EC PRIVATE KEY-----"
```

**Your CDP_API_KEY_SECRET:**
```
-----BEGIN EC PRIVATE KEY-----
MHc...YOUR-KEY-HERE...7oc=
-----END EC PRIVATE KEY-----
```

### **CDP_WALLET_SECRET** (Optional)

This is the wallet secret you generated in step 1.4.

**Example:**
```
ws_abc123def456ghi789jkl012mno345
```

---

## 🌐 Step 3: Add to Vercel Environment Variables

### 3.1 Go to Vercel Dashboard

1. Login to https://vercel.com/
2. Select your project (**FarBump**)
3. Go to **Settings → Environment Variables**

### 3.2 Add Variables

Click **"Add"** and enter each variable:

#### Variable 1: CDP_API_KEY_ID

```
Name: CDP_API_KEY_ID
Value: organizations/abc123-def4-5678-90ab-cdef12345678/apiKeys/xyz789-abc1-2345-6789-abcdef123456
```

**Select:** All Environments (Production, Preview, Development)

#### Variable 2: CDP_API_KEY_SECRET

```
Name: CDP_API_KEY_SECRET
Value: -----BEGIN EC PRIVATE KEY-----
MHc...YOUR-KEY-HERE...7oc=
-----END EC PRIVATE KEY-----
```

**⚠️ IMPORTANT:** 
- Paste the **ENTIRE private key** including `-----BEGIN` and `-----END` lines
- If Vercel doesn't support multiline, replace actual newlines with `\n`:
  ```
  -----BEGIN EC PRIVATE KEY-----\nMHc...KEY...7oc=\n-----END EC PRIVATE KEY-----
  ```

**Select:** All Environments (Production, Preview, Development)

#### Variable 3: CDP_WALLET_SECRET (Optional)

```
Name: CDP_WALLET_SECRET
Value: ws_abc123def456ghi789jkl012mno345
```

**Select:** All Environments (Production, Preview, Development)

### 3.3 Save Changes

Click **"Save"** for each variable.

---

## 🚀 Step 4: Redeploy Application

### Option A: Automatic Redeploy (Recommended)

After adding environment variables, Vercel will prompt you to redeploy.

Click **"Redeploy"** button.

### Option B: Manual Redeploy

1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click **"Redeploy"** button

### Option C: Git Push

```bash
git commit --allow-empty -m "trigger redeploy with CDP credentials"
git push origin main
```

---

## 🧪 Step 5: Test Wallet Creation

### 5.1 Open Application

Go to: https://farbump.vercel.app/

### 5.2 Login

1. Click **"Login"** button
2. Connect your wallet using Privy

### 5.3 Generate Bot Wallets

1. Click **"Generate Bot Wallet"** button
2. Wait for the process to complete

### 5.4 Expected Success

You should see:
- ✅ "Successfully created 5 bot wallets"
- 5 wallet addresses displayed
- Button changes to **"Start Bumping"**

### 5.5 Check Console Logs

Open browser console (F12) and look for:

```
🔧 Initializing Coinbase CDP SDK V2...
✅ CDP credentials found:
   CDP_API_KEY_ID: organizations/abc...
   CDP_API_KEY_SECRET: -----BEGIN...
   CDP_WALLET_SECRET: Set
✅ CDP Client V2 initialized successfully

🚀 Creating 5 bot EVM accounts using CDP V2...

   [1/5] Creating EVM account...
   ✅ EVM Account 1 created successfully
      Address: 0x1234567890abcdef...
      Network: base-mainnet (default)

   [2/5] Creating EVM account...
   ✅ EVM Account 2 created successfully
      Address: 0xabcdef1234567890...
      Network: base-mainnet (default)

   ... (repeat for 3-5)

✅ All 5 EVM accounts created successfully
✅ Saved 5 wallets to database
✅ Wallets categorized under user: 0xYOUR-USER-ADDRESS
```

---

## 🔍 Troubleshooting

### Error: "CDP Credentials not found in .env"

**Solution:**
- Verify environment variables are set in Vercel
- Check variable names are exactly: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
- Redeploy after adding variables

### Error: "Failed to configure CDP SDK"

**Solution:**
- Check `CDP_API_KEY_SECRET` format
- Ensure private key includes `-----BEGIN EC PRIVATE KEY-----` and `-----END EC PRIVATE KEY-----`
- Try replacing actual newlines with `\n` escape sequences

### Error: "Failed to create account"

**Solution:**
- Verify API key has correct permissions in CDP Portal
- Check API key is not expired or revoked
- Verify network connectivity from Vercel

### Error: "Only created X/5 wallets"

**Solution:**
- Check Vercel function timeout (increase if needed)
- Check CDP API rate limits
- Look at detailed error logs for each failed wallet

---

## 📊 Verify in CDP Portal

### Check Created Accounts

1. Go to: https://portal.cdp.coinbase.com/
2. Navigate to **"Accounts"** or **"Wallets"** section
3. You should see 5 new EVM accounts listed
4. Each account should show:
   - Address (0x...)
   - Network: Base Mainnet
   - Balance: 0 (until funded)

---

## 🔐 Security Best Practices

### ✅ DO:
- Store credentials in environment variables only
- Use `.env.local` for local development (gitignored)
- Rotate API keys periodically
- Use `CDP_WALLET_SECRET` for additional security
- Monitor API usage in CDP Portal

### ❌ DON'T:
- Commit credentials to Git
- Share API keys publicly
- Use same API key for dev and production
- Hardcode credentials in source code
- Expose credentials in client-side code

---

## 📚 Additional Resources

- **CDP SDK Documentation**: https://docs.cdp.coinbase.com/
- **CDP Portal**: https://portal.cdp.coinbase.com/
- **Vercel Env Vars**: https://vercel.com/docs/environment-variables
- **Supabase Dashboard**: https://supabase.com/dashboard

---

## ✅ Success Checklist

- [ ] Created CDP API Key in Portal
- [ ] Downloaded JSON credentials file
- [ ] Extracted `CDP_API_KEY_ID` from JSON
- [ ] Extracted `CDP_API_KEY_SECRET` from JSON
- [ ] Generated `CDP_WALLET_SECRET` (optional)
- [ ] Added all 3 variables to Vercel
- [ ] Redeployed application
- [ ] Tested wallet generation
- [ ] Verified 5 wallets created in database
- [ ] Checked accounts in CDP Portal

---

**🎉 Congratulations!** Your CDP Server Wallets V2 integration is complete!

Next step: Fund bot wallets and start automated trading. 🚀



