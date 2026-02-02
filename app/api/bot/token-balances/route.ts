import { NextRequest, NextResponse } from "next/server"
import { formatUnits } from "viem"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY
const ALCHEMY_URL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`

/**
 * Mendapatkan saldo semua token ERC20 di sebuah alamat menggunakan Alchemy Portfolio API
 * Doc: https://www.alchemy.com/docs/data/portfolio-apis/portfolio-api-endpoints/get-token-balances-by-address
 */
async function getAlchemyBalances(address: string) {
  try {
    const res = await fetch(ALCHEMY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "alchemy_getTokenBalances",
        params: [address, "erc20"],
        id: 1,
      }),
    })
    const data = await res.json()
    return data.result?.tokenBalances || []
  } catch (error) {
    console.error(`Error fetching Alchemy balances for ${address}:`, error)
    return []
  }
}

/**
 * Mendapatkan metadata token (simbol, desimal, logo) dari Alchemy
 * Doc: https://www.alchemy.com/docs/data/portfolio-apis/portfolio-api-endpoints/get-tokens-by-address
 */
async function getAlchemyMetadata(contractAddress: string) {
  try {
    const res = await fetch(ALCHEMY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "alchemy_getTokenMetadata",
        params: [contractAddress],
        id: 1,
      }),
    })
    const data = await res.json()
    return data.result
  } catch (error) {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { botWallets } = await request.json()
    if (!botWallets || botWallets.length === 0 || !ALCHEMY_KEY) {
      return NextResponse.json({ success: true, tokens: [] })
    }

    // 1. Ambil semua saldo token dari semua wallet secara paralel
    const walletDataResults = await Promise.all(
      botWallets.map((addr: string) => getAlchemyBalances(addr))
    )

    // 2. Agregasi saldo per Kontrak Token
    const tokenMap: Record<string, {
      address: string,
      balanceWei: bigint,
      walletBalances: { address: string, balance: string }[]
    }> = {}

    walletDataResults.forEach((tokenList, index) => {
      const walletAddress = botWallets[index]
      tokenList.forEach((t: any) => {
        const contract = t.contractAddress.toLowerCase()
        const balance = BigInt(t.tokenBalance || "0")

        if (balance > 0n) {
          if (!tokenMap[contract]) {
            tokenMap[contract] = {
              address: contract,
              balanceWei: 0n,
              walletBalances: []
            }
          }
          tokenMap[contract].balanceWei += balance
          tokenMap[contract].walletBalances.push({
            address: walletAddress,
            balance: balance.toString()
          })
        }
      })
    })

    // 3. Ambil Metadata untuk token yang unik dan memiliki saldo
    const uniqueTokenAddresses = Object.keys(tokenMap)
    const tokens = await Promise.all(
      uniqueTokenAddresses.map(async (addr) => {
        const metadata = await getAlchemyMetadata(addr)
        if (!metadata) return null

        const data = tokenMap[addr]
        const decimals = metadata.decimals || 18

        return {
          address: addr,
          symbol: metadata.symbol || "???",
          name: metadata.name || "Unknown Token",
          decimals: decimals,
          balanceWei: data.balanceWei.toString(),
          balanceFormatted: formatUnits(data.balanceWei, decimals),
          walletBalances: data.walletBalances,
          logo: metadata.logo
        }
      })
    )

    // Filter null, urutkan saldo terbanyak
    const finalTokens = tokens
      .filter((t) => t !== null)
      .sort((a, b) => parseFloat(b!.balanceFormatted) - parseFloat(a!.balanceFormatted))

    return NextResponse.json({ success: true, tokens: finalTokens })
  } catch (error: any) {
    console.error("❌ Token Balance Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
