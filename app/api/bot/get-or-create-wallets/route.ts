import { NextRequest, NextResponse } from "next/server"
import { type Address, isAddress } from "viem"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { CdpClient } from "@coinbase/cdp-sdk"
import "dotenv/config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Updated interface to use CDP Server Wallet V2 with Smart Accounts
interface BotWalletData {
  smart_account_address: Address // Smart Account address (for transactions)
  owner_address: Address // EOA Owner address (for signing)
  network: string // Network ID (e.g., 'base-mainnet')
}

/**
 * API Route: Get or create 5 bot wallets using Coinbase CDP SDK V2
 * 
 * Official Documentation: 
 * - Quickstart: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart
 * - Managing Accounts: https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/managing-accounts
 * 
 * CDP SDK V2 Features:
 * - Automatic key management by Coinbase in secure AWS Nitro Enclaves
 * - Auto-loads credentials from environment variables (CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET)
 * - Native gas sponsorship support
 * - EVM and Smart Account support
 * - Production-grade security
 * 
 * Environment Variables Required:
 * - CDP_API_KEY_ID: Your CDP API Key ID
 * - CDP_API_KEY_SECRET: Your CDP API Key Secret
 * - CDP_WALLET_SECRET: Your Wallet Secret
 * 
 * Get these from: https://portal.cdp.coinbase.com/
 * 
 * Logic:
 * 1. Check if user already has 5 bot wallets in database
 * 2. If yes, return existing wallet info with hasBotWallets: true
 * 3. If no, create 5 new EVM accounts using cdp.evm.createAccount()
 * 4. Store account addresses in database with user_address categorization
 * 5. Each user's wallets are isolated by user_address column
 * 
 * Database Schema:
 * - user_address: Main user's Smart Wallet address (from Privy) - unique identifier
 * - smart_account_address: Bot wallet address from CDP
 * - owner_address: Same as smart_account_address (for compatibility)
 * - network: 'base-mainnet'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress } = body as { userAddress: string }

    // Validation: Ensure userAddress is provided
    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing required field: userAddress" },
        { status: 400 }
      )
    }

    // Validation: Validate userAddress is a valid Ethereum address
    if (typeof userAddress !== 'string') {
      return NextResponse.json(
        { error: "Invalid userAddress: must be a string" },
        { status: 400 }
      )
    }

    if (!isAddress(userAddress)) {
      return NextResponse.json(
        { error: `Invalid Ethereum address format: ${userAddress}` },
        { status: 400 }
      )
    }

    // IMPORTANT: userAddress is the Smart Wallet address from Privy
    // This is used as the unique identifier to categorize wallets per user
    const normalizedUserAddress = userAddress.toLowerCase()

    const supabase = createSupabaseServiceClient()

    // Step 1: Check if user already has bot wallets
    // Database query filters by user_address to ensure proper categorization
    const { data: existingWallets, error: fetchError } = await supabase
      .from("wallets_data")
      .select("*")
      .eq("user_address", normalizedUserAddress)

    if (fetchError) {
      console.error("❌ Supabase fetch error:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch existing wallets", details: fetchError.message },
        { status: 500 }
      )
    }

    // Step 2: If user already has 5 wallets, return them
    // This ensures each user has exactly 5 bot wallets, no mixing between users
    if (existingWallets && existingWallets.length === 5) {
      console.log(`✅ User ${normalizedUserAddress} already has 5 bot wallets`)
      
      // Format existing wallets for frontend compatibility
      const formattedWallets = existingWallets.map((w, index) => ({
        smartWalletAddress: w.smart_account_address,
        ownerAddress: w.owner_address,
        network: w.network,
        index: index,
      }))
      
      return NextResponse.json({
        message: "Bot wallets already exist",
        wallets: formattedWallets,
        hasBotWallets: true, // Flag for frontend to show "Start Bumping" button
        created: false, // Indicate these are existing wallets
      })
    }

    // Step 3: Initialize Coinbase CDP Client V2
    // Official Quickstart: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart
    // The CDP Client automatically loads credentials from environment variables:
    // - CDP_API_KEY_ID
    // - CDP_API_KEY_SECRET
    // - CDP_WALLET_SECRET (optional but recommended)
    console.log("🔧 Initializing Coinbase CDP SDK V2...")
    
    // Check if required environment variables are present
    const apiKeyId = process.env.CDP_API_KEY_ID
    const apiKeySecret = process.env.CDP_API_KEY_SECRET
    const walletSecret = process.env.CDP_WALLET_SECRET

    if (!apiKeyId || !apiKeySecret) {
      console.error("❌ Missing CDP credentials in environment variables")
      console.error("   Required: CDP_API_KEY_ID, CDP_API_KEY_SECRET")
      console.error("   Optional: CDP_WALLET_SECRET")
      console.error("   Get these from: https://portal.cdp.coinbase.com/")
      return NextResponse.json(
        { 
          error: "CDP Credentials not found in .env", 
          details: "Please set CDP_API_KEY_ID and CDP_API_KEY_SECRET in environment variables. Get your API key from https://portal.cdp.coinbase.com/" 
        },
        { status: 500 }
      )
    }

    console.log("✅ CDP credentials found:")
    console.log(`   CDP_API_KEY_ID: ${apiKeyId.substring(0, 20)}...`)
    console.log(`   CDP_API_KEY_SECRET: ${apiKeySecret.substring(0, 10)}...`)
    console.log(`   CDP_WALLET_SECRET: ${walletSecret ? 'Set' : 'Not set (optional)'}`)

    // Initialize CDP Client V2
    // According to the official quickstart, CdpClient() auto-loads from env vars
    // Reference: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart#project-setup
    let cdp: CdpClient
    try {
      // The CdpClient constructor automatically reads from environment variables
      // No need to pass credentials explicitly
      cdp = new CdpClient()
      console.log("✅ CDP Client V2 initialized successfully")
      console.log("   SDK will auto-load credentials from environment")
    } catch (configError: any) {
      console.error("❌ Failed to initialize CDP Client:", configError)
      console.error("   Error message:", configError.message)
      console.error("   Error stack:", configError.stack)
      return NextResponse.json(
        { 
          error: "Failed to configure CDP SDK", 
          details: configError.message 
        },
        { status: 500 }
      )
    }

    // Step 4: Create 5 Smart Accounts using CDP V2
    // Official method: 
    // 1. Create EOA owner account: cdp.evm.createAccount()
    // 2. Create Smart Account: cdp.evm.createSmartAccount({ owner: account })
    // 
    // Reference: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart#1-create-an-account
    // 
    // Example from docs:
    // const account = await cdp.evm.createAccount();
    // const smartAccount = await cdp.evm.createSmartAccount({ owner: account });
    // console.log(`Created smart account: ${smartAccount.address}. Owner address: ${account.address}`);
    //
    // Smart Account Benefits:
    // - Gasless transactions with native sponsorship
    // - Advanced security features
    // - Multi-sig capabilities
    // - Account abstraction (ERC-4337)
    console.log("🚀 Creating 5 Smart Accounts (Bot Wallets) using CDP V2...")
    console.log("   Each wallet consists of:")
    console.log("   - 1 EOA Owner Account (for signing)")
    console.log("   - 1 Smart Account (for transactions)")
    console.log("   Reference: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart#1-create-an-account")

    const walletsToInsert: BotWalletData[] = []

    for (let i = 0; i < 5; i++) {
      console.log(`\n   [${i + 1}/5] Creating Smart Account...`)

      try {
        // Step 4.1: Create EOA owner account
        console.log(`      → Creating EOA owner account...`)
        const ownerAccount = await cdp.evm.createAccount()

        if (!ownerAccount || !ownerAccount.address) {
          throw new Error(`Owner account ${i + 1} created but missing address`)
        }

        console.log(`      ✅ EOA Owner created: ${ownerAccount.address}`)

        // Step 4.2: Create Smart Account with the owner
        console.log(`      → Creating Smart Account with owner...`)
        const smartAccount = await cdp.evm.createSmartAccount({
          owner: ownerAccount,
        })

        if (!smartAccount || !smartAccount.address) {
          throw new Error(`Smart account ${i + 1} created but missing address`)
        }

        console.log(`      ✅ Smart Account created: ${smartAccount.address}`)
        console.log(`      📦 Wallet ${i + 1} complete:`)
        console.log(`         Smart Account: ${smartAccount.address}`)
        console.log(`         Owner Account: ${ownerAccount.address}`)
        console.log(`         Network: base-mainnet (default)`)

        walletsToInsert.push({
          smart_account_address: smartAccount.address as Address,
          owner_address: ownerAccount.address as Address, // Store owner separately
          network: "base-mainnet",
        })
      } catch (walletError: any) {
        console.error(`\n   ❌ Failed to create Smart Account ${i + 1}:`)
        console.error(`      Error: ${walletError.message}`)
        if (walletError.response) {
          console.error(`      API Response:`, walletError.response.data)
        }
        
        // If one wallet fails, we should still try to create the rest
        console.log(`   ⚠️  Continuing to next wallet...`)
        continue
      }
    }

    // Check if we successfully created all 5 Smart Accounts
    if (walletsToInsert.length < 5) {
      console.error(`❌ Only created ${walletsToInsert.length}/5 Smart Accounts`)
      return NextResponse.json(
        { 
          error: "Failed to create all 5 Smart Accounts", 
          details: `Only ${walletsToInsert.length} Smart Accounts were created successfully` 
        },
        { status: 500 }
      )
    }

    console.log(`✅ All 5 Smart Accounts created successfully`)

    // Step 5: Save wallets to database
    // IMPORTANT: Each wallet is tied to user_address to ensure proper categorization
    // This prevents wallets from mixing between different users
    console.log("💾 Saving wallets to Supabase...")

    const walletsToStore = walletsToInsert.map((wallet) => ({
      user_address: normalizedUserAddress, // This ensures wallets are categorized per user
      smart_account_address: wallet.smart_account_address,
      owner_address: wallet.owner_address,
      network: wallet.network,
      created_at: new Date().toISOString(),
    }))

    const { data: insertedWallets, error: insertError } = await supabase
      .from("wallets_data")
      .insert(walletsToStore)
      .select()

    if (insertError) {
      console.error("❌ Supabase insert error:", insertError)
      return NextResponse.json(
        { error: "Failed to save wallets to database", details: insertError.message },
        { status: 500 }
      )
    }

    console.log(`✅ Saved ${insertedWallets.length} wallets to database`)
    console.log(`✅ Wallets categorized under user: ${normalizedUserAddress}`)

    // Format wallets for frontend compatibility
    const formattedWallets = walletsToInsert.map((wallet, index) => ({
      smartWalletAddress: wallet.smart_account_address,
      ownerAddress: wallet.owner_address,
      network: wallet.network,
      index: index,
    }))

    return NextResponse.json({
      message: "Successfully created 5 Smart Accounts using CDP V2",
      wallets: formattedWallets, // Send formatted wallets with smartWalletAddress property
      hasBotWallets: true, // Flag for frontend to show "Start Bumping" button
      created: true, // Indicate these are newly created wallets
    })
  } catch (error: any) {
    console.error("❌ Error in get-or-create-wallets:", error)
    console.error("   Error stack:", error.stack)
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
