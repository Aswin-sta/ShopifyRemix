import crypto from "crypto";

export function verifyShopifyProxyRequest(url, secret) {
  try {
    const params = Object.fromEntries(url.searchParams.entries());
    const signature = params.signature;

    if (!signature) {
      return false;
    }

    delete params.signature;

    const sortedParams = Object.keys(params)
      .sort()
      .map((key) =>
        `${key}=${Array.isArray(params[key]) ? params[key].join(",") : params[key]}`
      )
      .join("");

    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(sortedParams)
      .digest("hex");

    const result = crypto.timingSafeEqual(
      Buffer.from(generatedSignature, "hex"),
      Buffer.from(signature, "hex")
    );

    return result;
  } catch (error) {
    return false;
  }
}



export async function getAccessTokenByShop(shopify, shop) {
  const sessions = await shopify.sessionStorage.findSessionsByShop(shop);
  const session = sessions?.[0];
  if (!session) {
    throw new Error(`No session found for shop: ${shop}`);
  }
  return session.accessToken;
}