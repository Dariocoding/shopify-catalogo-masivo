export type VariantEditorOptionValue = {
  id: string;
  name: string;
};

export type VariantEditorOption = {
  id: string;
  name: string;
  values: string[];
  valueEntries: VariantEditorOptionValue[];
};

export type VariantEditorVariant = {
  id: string;
  label: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  barcode: string;
  inventoryItemId: string | null;
  imageUrl: string | null;
  imageAlt: string;
};

export type VariantEditorProduct = {
  id: string;
  handle: string;
  title: string;
  vendor: string;
  status: string;
  productType: string;
  tags: string[];
  imageUrl: string | null;
  imageAlt: string;
  options: VariantEditorOption[];
  hasOnlyDefaultVariant: boolean;
  variants: VariantEditorVariant[];
};

export type VariantEditorPage = {
  products: VariantEditorProduct[];
  totalCount: number;
  hasMore: boolean;
  endCursor: string | null;
};

export type VariantEditorChange = {
  productId: string;
  variantId: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  barcode: string;
};

export type VariantEditorSaveResult = {
  variantId: string;
  handle: string;
  success: boolean;
  errors: string[];
};

export type VariantEditorDeleteRequest = {
  productId: string;
  variantId: string;
  handle: string;
};

export type VariantEditorDeleteResult = {
  variantId: string;
  handle: string;
  success: boolean;
  errors: string[];
};

export type VariantEditorCreateInput = {
  optionValues: Array<{ optionName: string; value: string }>;
  price: string;
  compareAtPrice: string;
  sku: string;
  stock: string;
  barcode: string;
};

export type VariantEditorCreateRequest = {
  productId: string;
  handle: string;
  hasOnlyDefaultVariant: boolean;
  variants: VariantEditorCreateInput[];
};

export type VariantEditorCreateResult = {
  productId: string;
  handle: string;
  success: boolean;
  errors: string[];
  variants: VariantEditorVariant[];
  options: VariantEditorOption[];
  hasOnlyDefaultVariant: boolean;
  replaceAllVariants?: boolean;
};

export type VariantEditorAddOptionRequest = {
  productId: string;
  handle: string;
  optionName: string;
  values: string[];
};

export type VariantEditorAddOptionResult = {
  productId: string;
  handle: string;
  success: boolean;
  errors: string[];
  variants: VariantEditorVariant[];
  options: VariantEditorOption[];
  hasOnlyDefaultVariant: boolean;
};

export type VariantEditorRenameOptionChange = {
  optionId: string;
  name?: string;
  valueChanges?: Array<{ valueId: string; name: string }>;
};

export type VariantEditorRenameOptionsRequest = {
  productId: string;
  handle: string;
  changes: VariantEditorRenameOptionChange[];
};

export type VariantEditorRenameOptionsResult = {
  productId: string;
  handle: string;
  success: boolean;
  errors: string[];
  options: VariantEditorOption[];
  variants: VariantEditorVariant[];
};

export function getEditableOptions(
  product: Pick<VariantEditorProduct, "options" | "hasOnlyDefaultVariant">,
): VariantEditorOption[] {
  if (product.hasOnlyDefaultVariant) return [];
  return product.options.filter((option) => option.name !== "Title");
}

export function isSimpleProduct(
  product: Pick<VariantEditorProduct, "hasOnlyDefaultVariant" | "variants">,
): boolean {
  return product.hasOnlyDefaultVariant || product.variants.length === 0;
}

export function canAddSecondOption(
  product: Pick<VariantEditorProduct, "options" | "hasOnlyDefaultVariant">,
): boolean {
  return !product.hasOnlyDefaultVariant && getEditableOptions(product).length === 1;
}

export function buildVariantCombinations(
  optionSets: Array<{ optionName: string; values: string[] }>,
  shared: Pick<
    VariantEditorCreateInput,
    "price" | "compareAtPrice" | "stock" | "barcode"
  >,
  skuBase = "",
): VariantEditorCreateInput[] {
  const combinations = optionSets.reduce<
    Array<Array<{ optionName: string; value: string }>>
  >((acc, set) => {
    const values = set.values.filter(Boolean);
    if (values.length === 0) return acc;

    if (acc.length === 0) {
      return values.map((value) => [{ optionName: set.optionName, value }]);
    }

    return acc.flatMap((combo) =>
      values.map((value) => [...combo, { optionName: set.optionName, value }]),
    );
  }, []);

  const normalizedSku = skuBase.trim();

  return combinations.map((optionValues) => ({
    optionValues,
    ...shared,
    sku:
      normalizedSku.length > 0
        ? [normalizedSku, ...optionValues.map((entry) => entry.value)].join("-")
        : "",
  }));
}
