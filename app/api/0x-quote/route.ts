import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sellToken = searchParams.get("sellToken");
  const buyToken = searchParams.get("buyToken");
  const sellAmount = searchParams.get("sellAmount");
  const taker = searchParams.get("takerAddress");

  if (!sellToken || !buyToken || !sellAmount || !taker) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  try {
    const apiUrl = new URL('https://api.0x.org/swap/allowance-holder/quote')
    apiUrl.searchParams.set('chainId', '8453')
    apiUrl.searchParams.set('sellToken', sellToken)
    apiUrl.searchParams.set('buyToken', buyToken) // Akan menerima alamat WETH dari frontend
    apiUrl.searchParams.set('sellAmount', sellAmount)
    apiUrl.searchParams.set('taker', taker)
    apiUrl.searchParams.set('slippageBps', '1000')
    
    const response = await fetch(apiUrl.toString(), {
      headers: {
        "0x-api-key": process.env.ZEROX_API_KEY || "",
        "0x-version": "v2",
        "Accept": "application/json",
      },
    });

    const data = await response.json();
    if (!response.ok) return NextResponse.json(data, { status: response.status });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
