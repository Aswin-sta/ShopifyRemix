import { jsonResponse, errorResponse } from "../utils/response";
import { ShopifyClient } from "../utils/client";
import shopify from "../shopify.server";
import {
  CREATE_GIFTCARD_PRODUCT,
  BULK_UPDATE_VARIANTS,
  BULK_CREATE_VARIANTS,
  GET_PRODUCT_WITH_VARIANTS,
  SETTINGS_QUERY,
} from "../utils/mutation";
import {
  verifyShopifyProxyRequest,
  getAccessTokenByShop,
} from "../utils/helper";

const allowedTypes = ["digital", "physical"];

const getPriceBucket = (price) => {
  const num = Number(price);
  const min = Math.floor(num / 100) * 100;
  const max = min + 99;
  const priceStr = num.toFixed(2);
  return { min, max, priceStr };
};

const clientQuery = async (client, query, variables) => {
  try {
    return await client.query({ query, variables });
  } catch (error) {
    console.error("[Shopify Query Error]:", error);
    throw error;
  }
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") return jsonResponse(200);
  if (request.method === "GET")
    return jsonResponse(200, { message: "API Proxy ready for POST" });
  return jsonResponse(405);
};

export const action = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const secret = process.env.SHOPIFY_API_SECRET;

    if (!shop || !secret)
      return errorResponse(new Error("Missing required parameters"), 400);

    if (!verifyShopifyProxyRequest(url, secret))
      return errorResponse(new Error("Unauthorized request"), 403);

    const { amount, type } = await request.json();
    if (!amount || !allowedTypes.includes(type))
      return errorResponse(new Error("Invalid gift card input"), 400);


    const accessToken = await getAccessTokenByShop(shopify, shop);
    const client = new ShopifyClient(accessToken);
     
  
    const settingsRes = await clientQuery(client, SETTINGS_QUERY);
    const metafields = settingsRes?.shop?.metafields?.edges || [];
    
  
    const metaMap = Object.fromEntries(
      metafields.map(edge => [edge.node.key, edge.node.value])
    );
    

    const minPrice = parseInt(metaMap["min_price"] ?? "100", 10);
    const maxPrice = parseInt(metaMap["max_price"] ?? "1000", 10);

    const amountNum = Number(amount);
    if (amountNum < minPrice || amountNum > maxPrice) {
      return errorResponse(
        new Error(`Amount must be between ${minPrice} and ${maxPrice}`),
        400
      );
    }
    
    const { min, max, priceStr } = getPriceBucket(amount);
    const isPhysical = type === "physical";
    const handle = `${isPhysical ? "custom-gift-card-physical" : "custom-gift-card"}-${min}-${max}`;
    const sku = `${isPhysical ? "GIFT-PHYSICAL" : "GIFT-DIGITAL"}-${priceStr.replace(".", "-")}`;

  

    const productRes = await clientQuery(client, GET_PRODUCT_WITH_VARIANTS, {
      handle,
    });

    const product = productRes?.productByHandle;

    // If product doesn't exist, create it
    if (!product) {
      const createRes = await clientQuery(client, CREATE_GIFTCARD_PRODUCT, {
        input: {
          title: "Gift Card",
          handle,
          productType: "Gift Card",
          giftCard: !isPhysical,
          status: "ACTIVE",
          published: true,
          productOptions: [{
            name: "Denominations",
            position: 1,
            values: [{ name: priceStr }],
          }],
        },
      });

      const createdProduct = createRes?.productCreate?.product;
      const creationErrors = createRes?.productCreate?.userErrors || [];

      if (!createdProduct || creationErrors.length > 0) {
        return errorResponse(
          new Error("Failed to create product"),
          500,
          creationErrors
        );
      }

      const variantId = createdProduct?.variants?.edges?.[0]?.node?.id;

      await clientQuery(client, BULK_UPDATE_VARIANTS, {
        productId: createdProduct.id,
        variants: [{
          id: variantId,
          price: priceStr,
          inventoryItem: {
            sku,
            tracked: false,
          },
        }],
      });

      return jsonResponse(201, {
        variant: { id: variantId, price: priceStr },
        created: true,
        message: "Gift card created successfully",
      });
    }

    // Product exists, check for existing variant with same SKU
    const variant = product?.variants?.edges?.find(
      (v) => v.node.sku === sku
    )?.node;

    if (variant) {
      return jsonResponse(200, {
        variant: { id: variant.id, price: variant.price },
        created: false,
        message: "Existing gift card variant found",
      });
    }

    // Variant doesn't exist — create a new one
    const option = product.options?.[0];
    if (!option) {
      return errorResponse(
        new Error("Product has no options to assign variant"),
        400
      );
    }

    const createVariantRes = await clientQuery(client, BULK_CREATE_VARIANTS, {
      productId: product.id,
      variants: [{
        price: priceStr,
        optionValues: [{ name: priceStr, optionId: option.id }],
        inventoryItem: {
          sku,
          tracked: false,
        },
        inventoryQuantities: [],
      }],
    });

    const newVariant =
      createVariantRes?.productVariantsBulkCreate?.productVariants?.[0];
    const userErrors =
      createVariantRes?.productVariantsBulkCreate?.userErrors || [];

    if (!newVariant || userErrors.length > 0) {
      return errorResponse(
        new Error("Failed to create variant"),
        400,
        userErrors
      );
    }

    return jsonResponse(201, {
      variant: { id: newVariant.id, price: priceStr },
      created: true,
      message: "Gift card variant created successfully",
    });
  } catch (error) {
    console.error("[action] Unhandled error:", error);
    return errorResponse(error, 500);
  }
};
