# Coinbase CDP Paymaster Quickstart Tutorial

This tutorial demonstrates how to submit your first smart account transaction on Base Sepolia using Viem, with gas sponsorship from Coinbase Developer Platform.

## Prerequisites

- Node.js >= 14.0.0
- npm >= 6.0.0
- Coinbase CDP account with Paymaster endpoint
- Private key for testing

## Setup Instructions

### 1. Get Paymaster Endpoint from Coinbase CDP

1. Create a new CDP account or sign in: https://portal.cdp.coinbase.com/
2. Navigate to **Paymaster**
3. Add NFT contract address to allowlist: `0x66519FCAee1Ed65bc9e0aCc25cCD900668D3eD49`
4. Switch to **Base testnet (Sepolia)** in the top right
5. Copy your endpoint URL (it should look like: `https://api.developer.coinbase.com/rpc/v1/base-sepolia/YOUR_TOKEN_HERE`)
6. **IMPORTANT**: Make sure billing is configured for mainnet sponsorship (if using mainnet) or testnet sponsorship (for Sepolia)

### 2. Generate Private Key

You can generate a private key using one of these methods:

**Option A: Using Foundry (if installed)**
\`\`\`bash
cast wallet new
\`\`\`

**Option B: Using Node.js**
\`\`\`bash
node -e "console.log('0x' + require('crypto').randomBytes(32).toString('hex'))"
\`\`\`

**Option C: Use any existing Ethereum private key (0x...)**

### 3. Configure the Project

1. Open `config.js`
2. Replace `<your-rpc-token>` in the RPC_URL with your actual RPC token from Coinbase CDP Dashboard
   - Example: If your endpoint is `https://api.developer.coinbase.com/rpc/v1/base-sepolia/abc123xyz`
   - Then replace `<your-rpc-token>` with `abc123xyz`
3. A test private key is already included in `config.js` for testing purposes
   - For production, generate a new key using: `node generate-key.js`
   - **NEVER commit private keys to version control!**

### 4. Run the Script

\`\`\`bash
npm start
\`\`\`

## What This Does

- Creates a Coinbase Smart Wallet using your private key
- Mints an NFT to your smart wallet address
- Sponsors the gas fees using Coinbase CDP Paymaster
- Displays transaction links on Base Sepolia block explorers

## Troubleshooting

If you encounter errors:

1. **"No billing attached"**: Configure billing in Coinbase CDP Dashboard → Paymaster → Billing
2. **"Invalid RPC URL"**: Check that your RPC token is correct and for Base Sepolia
3. **"Contract not in allowlist"**: Add `0x66519FCAee1Ed65bc9e0aCc25cCD900668D3eD49` to your Paymaster allowlist
4. **"Invalid private key"**: Ensure your private key starts with `0x` and is 66 characters long

For more help, see: https://docs.cdp.coinbase.com/paymaster/guides/quickstart
