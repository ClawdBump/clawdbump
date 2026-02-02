//config.js
import { createPublicClient, http } from 'viem'
import { toCoinbaseSmartAccount } from 'viem/account-abstraction'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

// Your RPC url. Using Base mainnet
// Paymaster and Bundler URL for Base mainnet
export const RPC_URL = "https://api.developer.coinbase.com/rpc/v1/base/3ZsrZCdLzVslzHKjZcoaFEzmIN4s2isT"

export const client = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
})

// Private key generated for testing
// WARNING: This is a test private key - DO NOT use in production!
// For production, use a secure key management solution
const TEST_PRIVATE_KEY = '0x2e0267c875dc8a548ef3c421370938803e2b992b259dd37bd196a79d36ebb20a'
const owner = privateKeyToAccount(TEST_PRIVATE_KEY)

// Creates a Coinbase smart wallet using an EOA signer
export const account = await toCoinbaseSmartAccount({
  client,
  owners: [owner]
})
