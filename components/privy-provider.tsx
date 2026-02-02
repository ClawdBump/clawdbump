"use client"

import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth"
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets"
import { WagmiProvider } from "@privy-io/wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { http, createConfig } from "wagmi"
import { base } from "wagmi/chains"
import { ReactNode } from "react"

// 1. Inisialisasi Wagmi Config
const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
})

// 2. Inisialisasi Query Client
const queryClient = new QueryClient()

// CRITICAL: Initialize environment variables at top level (before component)
// This prevents "Cannot access before initialization" errors in production
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID

if (!PRIVY_APP_ID) {
  throw new Error("NEXT_PUBLIC_PRIVY_APP_ID environment variable is required")
}

interface PrivyProviderProps {
  children: ReactNode
}

export function PrivyProvider({ children }: PrivyProviderProps) {

  return (
    <PrivyProviderBase
      appId={PRIVY_APP_ID}
      config={{
        /**
         * Login Methods Configuration
         * 
         * Telegram Login:
         * - Telegram is included in loginMethods array
         * - Bot credentials (token & handle) are configured in Privy Dashboard
         *   (Settings → Login Methods → Socials → Telegram)
         * - Domain must be configured in BotFather using /setdomain
         * - Privy SDK automatically handles Telegram OAuth flow
         * 
         * Important:
         * - Bot token and bot handle are NOT stored in frontend code
         * - They are configured in Privy Dashboard (server-side)
         * - Frontend only needs "telegram" in loginMethods array
         */
        loginMethods: ["farcaster", "wallet", "telegram"],
        appearance: {
          theme: "light",
          accentColor: "#676FFF",
          logo: "/farbump-logo.png",
        },
        /**
         * EOA Signer Configuration
         * Menggunakan ethereum.createOnLogin untuk memastikan 
         * signer (kunci) dibuat otomatis untuk user Farcaster.
         * CRITICAL: Embedded wallet diperlukan sebagai SIGNER untuk Smart Wallet
         * 
         * IMPORTANT: "all-users" ensures embedded wallet is created for all users
         * We should NOT call createWallet() manually if embedded wallet already exists
         */
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users" as const,
          },
        },
        /**
         * Smart Wallets (Account Abstraction ERC-4337)
         * Ini yang memungkinkan transaksi gasless via Paymaster Coinbase.
         * 
         * ⚠️ CRITICAL ISSUE: Privy does NOT automatically create Smart Wallets for Farcaster Mini App logins
         * Even with createOnLogin: "all-users", Smart Wallets are NOT created automatically when using loginToMiniApp()
         * 
         * SOLUTION: We need to manually create Smart Wallet after login succeeds
         * This is handled in page.tsx useEffect that watches for authenticated state
         * 
         * PAYMASTER CONFIGURATION:
         * Paymaster is configured in Privy Dashboard (Settings → Wallets → Smart Wallets → Paymaster)
         * When using Coinbase CDP Paymaster, Privy automatically handles:
         * - User Operation creation with Paymaster sponsorship
         * - pm_getPaymasterStubData calls to Coinbase CDP API
         * - Gas fee sponsorship for transactions
         * 
         * The Smart Wallet client (from useSmartWallets hook) automatically uses Paymaster
         * for all transactions, allowing users to transact with 0 ETH balance
         */
        smartWallets: {
          enabled: true,
          createOnLogin: "all-users" as const,
        },
        // Base Mainnet sebagai default
        defaultChain: base,
        supportedChains: [base],
      } as any}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <SmartWalletsProvider>
            {children}
          </SmartWalletsProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProviderBase>
  )
}
