export const GET_PRODUCT_WITH_VARIANTS = `
query GetProductWithVariants($handle: String!) {
  productByHandle(handle: $handle) {
    id
    title
    handle
    variants(first: 100) {
      edges {
        node {
          id
          sku
          price
        }
      }
    }
    options {
      id
      name
      position
      values
    }
  }
}
`;

export const CREATE_GIFTCARD_PRODUCT = `
mutation CreateGiftCardProduct($input: ProductInput!) {
  productCreate(input: $input) {
    product {
      id
      title
      status
      options {
        id
        name
        position
        optionValues {
          id
          name
          hasVariants
        }
      }
      variants(first: 10) {
        edges {
          node {
            id
            price
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

export const BULK_UPDATE_VARIANTS = `
mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    product {
      id
    }
    productVariants {
      id
    }
    userErrors {
      field
      message
    }
  }
}`;

export const BULK_CREATE_VARIANTS = `
mutation BulkCreateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants) {
    productVariants {
      id
      title
      price
      selectedOptions {
        name
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;


export const SETTINGS_QUERY = `#graphql
query {
  shop {
    metafields(namespace: "gift_card_settings", first: 10) {
      edges {
        node {
          key
          value
        }
      }
    }
  }
}
`;
