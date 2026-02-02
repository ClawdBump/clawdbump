"use client"

import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth"
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets"
import { WagmiProvider } from "@privy-io/wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { http, createConfig } from "wagmi"
import { base } from "wagmi/chains"
import { ReactNode } from "react"

const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
})

const queryClient = new QueryClient()

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
         *   (Settings -> Login Methods -> Socials -> Telegram)
         * - Domain must be configured in BotFather using /setdomain
         * - Privy SDK automatically handles Telegram OAuth flow
         */
        loginMethods: ["wallet", "telegram"],
        appearance: {
          theme: "light",
          accentColor: "#676FFF",
          logo: "/icon.png",
        },
        /**
         * EOA Signer Configuration
         * Using ethereum.createOnLogin to ensure 
         * signer (key) is created automatically for users.
         */
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users" as const,
          },
        },
        /**
         * Smart Wallets (Account Abstraction ERC-4337)
         * Enables gasless transactions via Coinbase Paymaster.
         */
        smartWallets: {
          enabled: true,
          createOnLogin: "all-users" as const,
        },
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
