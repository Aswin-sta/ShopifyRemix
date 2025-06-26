import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  Banner,
  Divider,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Box,
  Thumbnail,
  EmptyState,
  Checkbox,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const settingsResponse = await admin.graphql(`#graphql
    query {
      shop {
        id
        metafields(namespace: "gift_card_settings", first: 20) {
          edges {
            node {
              key
              value
            }
          }
        }
      }
    }
  `);

  const settingsData = await settingsResponse.json();
  const metafields = settingsData.data?.shop?.metafields?.edges || [];

  const settings = {
    min_price: "100",
    max_price: "1000",
    selected_product: null,
    enabled: false,
    digital_enabled: false,
    physical_enabled: false,
    physical_giftbox_enabled: false,
  };

  metafields.forEach(({ node }) => {
    if (node.key === "min_price") settings.min_price = node.value;
    if (node.key === "max_price") settings.max_price = node.value;
    if (node.key === "enabled") settings.enabled = node.value === "true";
    if (node.key === "digital_enabled") settings.digital_enabled = node.value === "true";
    if (node.key === "physical_enabled") settings.physical_enabled = node.value === "true";
    if (node.key === "physical_giftbox_enabled") settings.physical_giftbox_enabled = node.value === "true";
    if (node.key === "selected_product") {
      try {
        settings.selected_product = JSON.parse(node.value);
      } catch (e) {
        settings.selected_product = null;
      }
    }
  });

  return json({
    shopId: settingsData.data.shop.id,
    settings,
  });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  if (!admin) return json({ success: false, error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "saveSettings") {
    const minAmount = formData.get("minAmount");
    const maxAmount = formData.get("maxAmount");
    const selectedProduct = formData.get("selectedProduct");
    const enabled = formData.get("enabled");
    const digitalEnabled = formData.get("digitalEnabled");
    const physicalEnabled = formData.get("physicalEnabled");
    const physicalGiftboxEnabled = formData.get("physicalGiftboxEnabled");
    const shopId = formData.get("shopId");
    const newProductId = formData.get("newProductId");
    const previousProductId = formData.get("previousProductId");
    const previousProductHandle = formData.get("previousProductHandle");
    
    const minAmountNum = parseInt(minAmount, 10);
    const maxAmountNum = parseInt(maxAmount, 10);

    if (isNaN(minAmountNum) || isNaN(maxAmountNum) || minAmountNum >= maxAmountNum) {
      return json({ success: false, error: "Invalid input values" }, { status: 400 });
    }

    if (minAmountNum < 0 || maxAmountNum < 0) {
      return json({ success: false, error: "Amounts must be positive numbers" }, { status: 400 });
    }

    try {
      // Handle product updates if needed
      if (newProductId || (previousProductId && previousProductHandle)) {
        // Restore previous product's handle if it exists
        if (previousProductId && previousProductHandle !== "null") {
         
          
          if (previousProductHandle.startsWith("custom-gift-card-product-")) {
            const originalHandle = previousProductHandle.replace(/^custom-gift-card-product-(\d+-\d+-)?/, "");            console.log("Restoring previous product handle:", originalHandle);
            await admin.graphql(`#graphql
              mutation productUpdate($input: ProductInput!) {
                productUpdate(input: $input) {
                  product {
                    id
                    handle
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `, {
              variables: {
                input: {
                  id: previousProductId,
                  handle: originalHandle
                }
              }
            });
          }
        }

        // Update new product's handle if needed
        if (newProductId && newProductId !== "null") {
          const productData = JSON.parse(selectedProduct);
          const customHandle = `custom-gift-card-product-${productData.handle}`;
          
          await admin.graphql(`#graphql
            mutation productUpdate($input: ProductInput!) {
              productUpdate(input: $input) {
                product {
                  id
                  handle
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `, {
            variables: {
              input: {
                id: newProductId,
                handle: customHandle
              }
            }
          });
        }
      }

      // Save settings
      const metafieldsToSet = [
        {
          namespace: "gift_card_settings",
          key: "enabled",
          type: "boolean",
          value: enabled === "true" ? "true" : "false",
          ownerId: shopId,
        },
        {
          namespace: "gift_card_settings",
          key: "digital_enabled",
          type: "boolean",
          value: digitalEnabled === "true" ? "true" : "false",
          ownerId: shopId,
        },
        {
          namespace: "gift_card_settings",
          key: "physical_enabled",
          type: "boolean",
          value: physicalEnabled === "true" ? "true" : "false",
          ownerId: shopId,
        },
        {
          namespace: "gift_card_settings",
          key: "physical_giftbox_enabled",
          type: "boolean",
          value: physicalGiftboxEnabled === "true" ? "true" : "false",
          ownerId: shopId,
        },
        {
          namespace: "gift_card_settings",
          key: "min_price",
          type: "number_integer",
          value: minAmountNum.toString(),
          ownerId: shopId,
        },
        {
          namespace: "gift_card_settings",
          key: "max_price",
          type: "number_integer",
          value: maxAmountNum.toString(),
          ownerId: shopId,
        },
      ];

      if (selectedProduct && selectedProduct !== "null") {
        metafieldsToSet.push({
          namespace: "gift_card_settings",
          key: "selected_product",
          type: "json",
          value: selectedProduct,
          ownerId: shopId,
        });
      }

      const res = await admin.graphql(`#graphql
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id }
            userErrors { message }
          }
        }
      `, {
        variables: {
          metafields: metafieldsToSet,
        },
      });

      const resultJson = await res.json();
      const errors = resultJson.errors || resultJson.data?.metafieldsSet?.userErrors;

      if (errors?.length > 0) {
        return json({ success: false, error: "Failed to save settings", details: errors }, { status: 500 });
      }

      return json({ success: true });
    } catch (error) {
      return json({ success: false, error: error.message }, { status: 500 });
    }
  }

  return json({ success: false, error: "Invalid action type" }, { status: 400 });
};

export default function GiftCardSettings() {
  const { settings, shopId } = useLoaderData();
  const saveFetcher = useFetcher();

  const [minAmount, setMinAmount] = useState(settings.min_price);
  const [maxAmount, setMaxAmount] = useState(settings.max_price);
  const [selectedProduct, setSelectedProduct] = useState(settings.selected_product);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [digitalEnabled, setDigitalEnabled] = useState(settings.digital_enabled);
  const [physicalEnabled, setPhysicalEnabled] = useState(settings.physical_enabled);
  const [physicalGiftboxEnabled, setPhysicalGiftboxEnabled] = useState(settings.physical_giftbox_enabled);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [error, setError] = useState(null);
  const [isSelectingProduct, setIsSelectingProduct] = useState(false);
  const [pendingProduct, setPendingProduct] = useState(null);



  console.log("Initial settings:", selectedProduct)

  

  useEffect(() => {
    setHasChanges(
      minAmount !== settings.min_price ||
      maxAmount !== settings.max_price ||
      enabled !== settings.enabled ||
      digitalEnabled !== settings.digital_enabled ||
      physicalEnabled !== settings.physical_enabled ||
      physicalGiftboxEnabled !== settings.physical_giftbox_enabled ||
      pendingProduct && pendingProduct.id !== settings.selected_product.id
    );
  }, [
    minAmount, 
    maxAmount, 
    pendingProduct, 
    enabled, 
    digitalEnabled, 
    physicalEnabled, 
    physicalGiftboxEnabled, 
    settings
  ]);

  useEffect(() => {
    if (saveFetcher.state === "idle" && saveFetcher.data) {
      if (saveFetcher.data.success) {
        setShowSuccessBanner(true);
        setTimeout(() => setShowSuccessBanner(false), 4000);
        setHasChanges(false);
        setError(null);
        if (pendingProduct) {
          setSelectedProduct(pendingProduct);
          setPendingProduct(null);
        }
      } else {
        setError(saveFetcher.data.error || "Failed to save settings");
      }
    }
  }, [saveFetcher.state, saveFetcher.data]);


  

  const handleSelectProduct = async () => {
    setIsSelectingProduct(true);
    try {
      const selected = await window.shopify.resourcePicker({
        type: 'product',
        action: 'select',
        multiple: false,
        filter: {
          query: 'tag:giftbox-product'
        }
      });

      if (!selected || selected.length === 0) {
        setIsSelectingProduct(false);
        return;
      }

      const product = selected[0];
   
      // Verify tag
      if (!product.tags || !product.tags.includes('giftbox-product')) {
        setError('Selected product must have the "giftbox-product" tag');
        setIsSelectingProduct(false);
        return;
      }

      // Just update local state
      setPendingProduct({
        id: product.id,
        title: product.title,
        handle: product.handle,
        price: product.variants?.[0]?.price || '0',
        image: product.images?.[0]?.originalSrc || null,
        totalInventory: product.totalInventory || 0
      });
      setError(null);
    } catch (error) {
      console.error('Error selecting product:', error);
      setError(error.message);
    } finally {
      setIsSelectingProduct(false);
    }
  };

  const handleClearProduct = () => {
    setPendingProduct(null);
  };

  const handleSave = () => {

    console.log("Saving settings with pending product:", pendingProduct);
    console.log("Selected product:", selectedProduct);
    const formData = new FormData();
    formData.append("actionType", "saveSettings");
    formData.append("minAmount", minAmount);
    formData.append("maxAmount", maxAmount);
    formData.append("enabled", enabled.toString());
    formData.append("digitalEnabled", digitalEnabled.toString());
    formData.append("physicalEnabled", physicalEnabled.toString());
    formData.append("physicalGiftboxEnabled", physicalGiftboxEnabled.toString());
    formData.append("selectedProduct", pendingProduct ? JSON.stringify(pendingProduct) : "null");
    formData.append("shopId", shopId);
    
    if (pendingProduct && (!selectedProduct || pendingProduct.id !== selectedProduct.id)) {
      formData.append("newProductId", pendingProduct.id);
      formData.append("previousProductId", selectedProduct?.id || null);
      formData.append("previousProductHandle", selectedProduct?.handle || null);
    } 

    saveFetcher.submit(formData, { method: "POST" });
  };

  const isInvalidRange = parseInt(minAmount) >= parseInt(maxAmount);
  const isInvalidMinAmount = parseInt(minAmount) < 0 || minAmount === '';
  const isInvalidMaxAmount = parseInt(maxAmount) < 0 || maxAmount === '';

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'INR',
    }).format(parseFloat(price) || 0);
  };

  const getInventoryStatus = (inventory) => {
    if (inventory === null || inventory === undefined) return null;
    if (inventory === 0) return { tone: 'critical', text: 'Out of stock' };
    if (inventory < 10) return { tone: 'warning', text: 'Low stock' };
    return { tone: 'success', text: 'In stock' };
  };

  const anyTypeEnabled = digitalEnabled || physicalEnabled || physicalGiftboxEnabled;
  const displayProduct = pendingProduct || selectedProduct;

  return (
    <Page>
      <TitleBar title="Gift Card Settings" />
      <Layout>
        <Layout.Section>
          {showSuccessBanner && (
            <Box paddingBlockEnd="400">
              <Banner 
                title="Settings saved successfully!" 
                tone="success" 
                onDismiss={() => setShowSuccessBanner(false)}
              />
            </Box>
          )}
          
          {error && (
            <Box paddingBlockEnd="400">
              <Banner 
                title="Something went wrong" 
                tone="critical" 
                onDismiss={() => setError(null)}
              >
                {error}
              </Banner>
            </Box>
          )}
          
          <Card>
            <BlockStack gap="600">
              <Box padding="400" >
                <InlineStack gap="400" align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Text variant="headingLg" as="h1">Gift Card Settings</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Checkbox
                      label=""
                      checked={enabled}
                      onChange={(value) => setEnabled(value)}
                      ariaLabel="Enable gift cards"
                    />
                    {enabled ? (
                      <Badge tone="success">Enabled</Badge>
                    ) : (
                      <Badge tone="critical">Disabled</Badge>
                    )}
                  </InlineStack>
                </InlineStack>
              </Box>
              
              {enabled && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Gift Card Types</Text>
                    
                    <InlineStack gap="400" wrap>
                      <Box minWidth="280px">
                        <Card padding="400">
                          <BlockStack gap="300">
                            <InlineStack gap="200" blockAlign="center">
                              <Checkbox
                                checked={digitalEnabled}
                                onChange={(value) => setDigitalEnabled(value)}
                                label="Digital Gift Card"
                              />
                              {digitalEnabled && <Badge tone="success">Active</Badge>}
                            </InlineStack>
                            <Text variant="bodySm" as="p" tone="subdued">
                              Sent via email instantly
                            </Text>
                          </BlockStack>
                        </Card>
                      </Box>

                      <Box minWidth="280px">
                        <Card padding="400">
                          <BlockStack gap="300">
                            <InlineStack gap="200" blockAlign="center">
                              <Checkbox
                                checked={physicalEnabled}
                                onChange={(value) => setPhysicalEnabled(value)}
                                label="Physical Gift Card"
                              />
                              {physicalEnabled && <Badge tone="success">Active</Badge>}
                            </InlineStack>
                            <Text variant="bodySm" as="p" tone="subdued">
                              Shipped to recipient
                            </Text>
                          </BlockStack>
                        </Card>
                      </Box>

                      <Box minWidth="280px">
                        <Card padding="400">
                          <BlockStack gap="300">
                            <InlineStack gap="200" blockAlign="center">
                              <Checkbox
                                checked={physicalGiftboxEnabled}
                                onChange={(value) => setPhysicalGiftboxEnabled(value)}
                                label="Gift Card + Giftbox"
                              />
                              {physicalGiftboxEnabled && <Badge tone="success">Active</Badge>}
                            </InlineStack>
                            <Text variant="bodySm" as="p" tone="subdued">
                              Includes selected product
                            </Text>
                          </BlockStack>
                        </Card>
                      </Box>
                    </InlineStack>

                    {!anyTypeEnabled && (
                      <Banner tone="warning">
                        Please enable at least one gift card type
                      </Banner>
                    )}
                  </BlockStack>
                </Box>
              )}
              
              {enabled && <Divider />}
              
              {enabled && anyTypeEnabled && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack blockAlign="center" align="space-between">
                      <Text variant="headingMd" as="h2">Amount Range</Text>
                      <Text variant="bodyLg" as="p" tone="subdued">
                        Current range: <Text variant="bodyLg" as="span" tone="base" fontWeight="semibold">
                          {formatPrice(minAmount)} - {formatPrice(maxAmount)}
                        </Text>
                      </Text>
                    </InlineStack>

                    <InlineStack gap="400" align="start" wrap>
                      <Box minWidth="220px">
                        <TextField
                          label="Minimum amount"
                          type="number"
                          value={minAmount}
                          onChange={(value) => setMinAmount(value.replace(/\D/g, ""))}
                          min={0}
                          error={isInvalidMinAmount ? "Invalid amount" : undefined}
                          size="slim"
                        />
                      </Box>
                      <Box minWidth="220px">
                        <TextField
                          label="Maximum amount"
                          type="number"
                          value={maxAmount}
                          onChange={(value) => setMaxAmount(value.replace(/\D/g, ""))}
                          min={0}
                          error={isInvalidMaxAmount ? "Invalid amount" : undefined}
                          size="slim"
                        />
                      </Box>
                    </InlineStack>

                    {isInvalidRange && !isInvalidMinAmount && !isInvalidMaxAmount && (
                      <Banner tone="warning">
                        Minimum must be less than maximum
                      </Banner>
                    )}
                  </BlockStack>
                </Box>
              )}

              {enabled && <Divider />}
              
              {enabled && physicalGiftboxEnabled && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">Gift Box Product</Text>
                      <InlineStack gap="200">
                        {(displayProduct || pendingProduct === null) && (
                          <Button 
                            onClick={handleClearProduct}
                            tone="critical"
                            variant="plain"
                            size="slim"
                            disabled={isSelectingProduct || saveFetcher.state === "submitting"}
                          >
                            Clear
                          </Button>
                        )}
                        <Button 
                          onClick={handleSelectProduct}
                          size="slim"
                          loading={isSelectingProduct}
                          disabled={isSelectingProduct || saveFetcher.state === "submitting"}
                        >
                          {displayProduct ? 'Change' : 'Select'}
                        </Button>
                      </InlineStack>
                    </InlineStack>
                    {!displayProduct ? (
                      <Card padding="800">
                        <EmptyState
                          heading="No gift box product selected"
                          action={{
                            content: 'Select Product',
                            onAction: handleSelectProduct,
                            loading: isSelectingProduct,
                            disabled: isSelectingProduct || saveFetcher.state === "submitting",
                            size: 'large',
                          }}
                          image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                        >
                          <Text variant="bodyLg" as="p">
                            Choose a product that customers can purchase with their gift cards. 
                            Make sure the product is tagged with "giftbox-product".
                          </Text>
                        </EmptyState>
                      </Card>
                    ) : (
                      <Card padding="300" >
                        <InlineStack gap="300" blockAlign="center">
                          <Thumbnail
                            source={displayProduct.image || ""}
                            alt={displayProduct.title}
                            size="medium"
                          />
                          <BlockStack gap="100">
                            <Text variant="bodyMd" fontWeight="medium">{displayProduct.title}</Text>
                            <InlineStack gap="200" align="space-between" blockAlign="center">
                              <Text variant="bodySm" tone="subdued">
                                {formatPrice(displayProduct.price)}
                              </Text>
                              <Badge tone={getInventoryStatus(displayProduct.totalInventory)?.tone || 'subdued'}>
                                {displayProduct.totalInventory} in stock
                              </Badge>
                            </InlineStack>
                          </BlockStack>
                        </InlineStack>
                      </Card>
                    )}
                  </BlockStack>
                  <Box padding="400">
                    <InlineStack align="end">
                      <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={
                          !enabled ||
                          (enabled && (!anyTypeEnabled || 
                          isInvalidRange || 
                          isInvalidMinAmount || 
                          isInvalidMaxAmount || 
                          !hasChanges)) || 
                          saveFetcher.state === "submitting" ||
                          isSelectingProduct
                        }
                        loading={saveFetcher.state === "submitting"}
                        size="medium"
                      >
                        Save Settings
                      </Button>
                    </InlineStack>
                  </Box>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}