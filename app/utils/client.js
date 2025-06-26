import { SHOPIFY_CONFIG } from "../config.js";

export class ShopifyClient {
  constructor(access_token) {
    this.baseUrl = `https://${SHOPIFY_CONFIG.STORE_DOMAIN}/admin/api/${SHOPIFY_CONFIG.API_VERSION}`;
    this.headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": access_token,
    };
  }

  async query({ query, variables }) {
    const response = await fetch(`${this.baseUrl}/graphql.json`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(
        `GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`
      );
    }

    return result.data;
  }
}
