import { CatalogInput } from "./catalog-ui";
import type {
  VariantEditorProduct,
  VariantEditorVariant,
} from "../lib/catalog-variant-editor.server";

export type VariantEditorDraft = {
  sku: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  barcode: string;
};

type VariantEditorTableProps = {
  products: VariantEditorProduct[];
  drafts: Record<string, VariantEditorDraft>;
  expanded: Record<string, boolean>;
  dirtyVariantIds: Set<string>;
  disabled?: boolean;
  onToggleProduct: (productId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onDraftChange: (
    variantId: string,
    field: keyof VariantEditorDraft,
    value: string,
  ) => void;
};

function VariantFields({
  variant,
  draft,
  dirty,
  disabled,
  onDraftChange,
}: {
  variant: VariantEditorVariant;
  draft: VariantEditorDraft;
  dirty: boolean;
  disabled?: boolean;
  onDraftChange: (
    variantId: string,
    field: keyof VariantEditorDraft,
    value: string,
  ) => void;
}) {
  return (
    <tr className={`variant-editor__row${dirty ? " variant-editor__row--dirty" : ""}`}>
      <td className="variant-editor__cell variant-editor__cell--label">
        {variant.label}
      </td>
      <td className="variant-editor__cell">
        <CatalogInput
          value={draft.sku}
          disabled={disabled}
          onChange={(e) => onDraftChange(variant.id, "sku", e.target.value)}
        />
      </td>
      <td className="variant-editor__cell variant-editor__cell--narrow">
        <CatalogInput
          value={draft.price}
          disabled={disabled}
          inputMode="decimal"
          onChange={(e) => onDraftChange(variant.id, "price", e.target.value)}
        />
      </td>
      <td className="variant-editor__cell variant-editor__cell--narrow">
        <CatalogInput
          value={draft.compareAtPrice}
          disabled={disabled}
          inputMode="decimal"
          onChange={(e) =>
            onDraftChange(variant.id, "compareAtPrice", e.target.value)
          }
        />
      </td>
      <td className="variant-editor__cell variant-editor__cell--narrow">
        <CatalogInput
          value={draft.stock}
          disabled={disabled}
          inputMode="numeric"
          onChange={(e) => onDraftChange(variant.id, "stock", e.target.value)}
        />
      </td>
      <td className="variant-editor__cell">
        <CatalogInput
          value={draft.barcode}
          disabled={disabled}
          onChange={(e) => onDraftChange(variant.id, "barcode", e.target.value)}
        />
      </td>
    </tr>
  );
}

export function VariantEditorTable({
  products,
  drafts,
  expanded,
  dirtyVariantIds,
  disabled,
  onToggleProduct,
  onExpandAll,
  onCollapseAll,
  onDraftChange,
}: VariantEditorTableProps) {
  if (products.length === 0) {
    return (
      <div className="variant-editor__empty">
        No hay productos con estos filtros.
      </div>
    );
  }

  return (
    <div className="variant-editor">
      <div className="variant-editor__toolbar">
        <button
          type="button"
          className="variant-editor__toolbar-btn"
          onClick={onExpandAll}
          disabled={disabled}
        >
          Expandir todos
        </button>
        <button
          type="button"
          className="variant-editor__toolbar-btn"
          onClick={onCollapseAll}
          disabled={disabled}
        >
          Contraer todos
        </button>
      </div>

      <div className="variant-editor__scroll">
        <table className="variant-editor__table">
          <thead>
            <tr>
              <th>Producto / variante</th>
              <th>SKU</th>
              <th>Precio</th>
              <th>Precio comparado</th>
              <th>Stock</th>
              <th>Código barras</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const isOpen = expanded[product.id] ?? product.variants.length <= 1;
              const variantCount = product.variants.length;

              return (
                <ProductGroup
                  key={product.id}
                  product={product}
                  isOpen={isOpen}
                  variantCount={variantCount}
                  drafts={drafts}
                  dirtyVariantIds={dirtyVariantIds}
                  disabled={disabled}
                  onToggleProduct={onToggleProduct}
                  onDraftChange={onDraftChange}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductGroup({
  product,
  isOpen,
  variantCount,
  drafts,
  dirtyVariantIds,
  disabled,
  onToggleProduct,
  onDraftChange,
}: {
  product: VariantEditorProduct;
  isOpen: boolean;
  variantCount: number;
  drafts: Record<string, VariantEditorDraft>;
  dirtyVariantIds: Set<string>;
  disabled?: boolean;
  onToggleProduct: (productId: string) => void;
  onDraftChange: (
    variantId: string,
    field: keyof VariantEditorDraft,
    value: string,
  ) => void;
}) {
  const hasDirtyVariant = product.variants.some((variant) =>
    dirtyVariantIds.has(variant.id),
  );

  return (
    <>
      <tr
        className={`variant-editor__product-row${hasDirtyVariant ? " variant-editor__product-row--dirty" : ""}`}
      >
        <td colSpan={6}>
          <button
            type="button"
            className="variant-editor__product-toggle"
            onClick={() => onToggleProduct(product.id)}
            disabled={disabled || variantCount <= 1}
          >
            <span className="variant-editor__chevron">
              {variantCount <= 1 ? "•" : isOpen ? "▾" : "▸"}
            </span>
            <span className="variant-editor__product-title">{product.title}</span>
            <span className="variant-editor__product-meta">
              {product.handle}
              {variantCount > 1
                ? ` · ${variantCount} variantes`
                : " · 1 variante"}
            </span>
          </button>
        </td>
      </tr>

      {(isOpen || variantCount <= 1) &&
        product.variants.map((variant) => {
          const draft = drafts[variant.id] ?? {
            sku: variant.sku,
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            stock: variant.stock,
            barcode: variant.barcode,
          };

          return (
            <VariantFields
              key={variant.id}
              variant={variant}
              draft={draft}
              dirty={dirtyVariantIds.has(variant.id)}
              disabled={disabled}
              onDraftChange={onDraftChange}
            />
          );
        })}
    </>
  );
}

export function variantToDraft(variant: VariantEditorVariant): VariantEditorDraft {
  return {
    sku: variant.sku,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    stock: variant.stock,
    barcode: variant.barcode,
  };
}

export function draftsEqual(
  a: VariantEditorDraft,
  b: VariantEditorDraft,
): boolean {
  return (
    a.sku === b.sku &&
    a.price === b.price &&
    a.compareAtPrice === b.compareAtPrice &&
    a.stock === b.stock &&
    a.barcode === b.barcode
  );
}
