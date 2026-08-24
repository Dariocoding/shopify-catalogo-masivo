import { useState } from "react";

import { VariantAddPanel } from "./variant-add-panel";
import { VariantOptionsEditor } from "./variant-options-editor";
import { CatalogInput } from "./catalog-ui";
import type { VariantEditorCreateInput } from "../lib/catalog-variant-editor.server";
import type { VariantEditorRenameOptionChange } from "../lib/catalog-variant-editor.server";
import {
  getEditableOptions,
  isSimpleProduct,
  type VariantEditorProduct,
  type VariantEditorVariant,
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
  onDeleteVariant: (productId: string, variant: VariantEditorVariant) => void;
  onCreateVariants: (
    productId: string,
    variants: VariantEditorCreateInput[],
  ) => void;
  onAddOption: (productId: string, optionName: string, values: string[]) => void;
  onRenameOptions: (
    productId: string,
    changes: VariantEditorRenameOptionChange[],
  ) => void;
  addingProductId?: string | null;
  renamingProductId?: string | null;
};

function formatStatus(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Activo";
    case "DRAFT":
      return "Borrador";
    case "ARCHIVED":
      return "Archivado";
    default:
      return status;
  }
}

function statusClassName(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "variant-editor__status--active";
    case "DRAFT":
      return "variant-editor__status--draft";
    case "ARCHIVED":
      return "variant-editor__status--archived";
    default:
      return "";
  }
}

function ProductThumbnail({
  imageUrl,
  alt,
  size = "md",
}: {
  imageUrl: string | null;
  alt: string;
  size?: "md" | "sm";
}) {
  const className = `variant-editor__thumb variant-editor__thumb--${size}`;

  if (!imageUrl) {
    return (
      <div className={`${className} variant-editor__thumb--placeholder`} aria-hidden>
        <span>—</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={imageUrl}
      alt={alt}
      loading="lazy"
      width={size === "sm" ? 36 : 48}
      height={size === "sm" ? 36 : 48}
    />
  );
}

function VariantFields({
  product,
  variant,
  draft,
  dirty,
  disabled,
  canDelete,
  onDraftChange,
  onDeleteVariant,
}: {
  product: VariantEditorProduct;
  variant: VariantEditorVariant;
  draft: VariantEditorDraft;
  dirty: boolean;
  disabled?: boolean;
  canDelete: boolean;
  onDraftChange: (
    variantId: string,
    field: keyof VariantEditorDraft,
    value: string,
  ) => void;
  onDeleteVariant: (productId: string, variant: VariantEditorVariant) => void;
}) {
  const variantImageUrl = variant.imageUrl ?? product.imageUrl;

  return (
    <tr
      className={`variant-editor__row${dirty ? " variant-editor__row--dirty" : ""}`}
    >
      <td className="variant-editor__cell variant-editor__cell--photo">
        <ProductThumbnail
          imageUrl={variantImageUrl}
          alt={variant.imageAlt || variant.label}
          size="sm"
        />
      </td>
      <td className="variant-editor__cell variant-editor__cell--label">
        <span className="variant-editor__variant-label">{variant.label}</span>
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
      <td className="variant-editor__cell variant-editor__cell--actions">
        <button
          type="button"
          className="variant-editor__delete-btn"
          disabled={disabled || !canDelete}
          title={
            canDelete
              ? "Eliminar variante"
              : "No se puede eliminar la única variante del producto"
          }
          onClick={() => onDeleteVariant(product.id, variant)}
        >
          Eliminar
        </button>
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
  onDeleteVariant,
  onCreateVariants,
  onAddOption,
  onRenameOptions,
  addingProductId,
  renamingProductId,
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
              <th className="variant-editor__cell--photo">Foto</th>
              <th>Producto / variante</th>
              <th>SKU</th>
              <th>Precio</th>
              <th>Precio comparado</th>
              <th>Stock</th>
              <th>Código barras</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const isOpen = expanded[product.id] ?? product.variants.length <= 1;
              const variantCount = product.variants.length;
              const canDeleteVariants = variantCount > 1;

              return (
                <ProductGroup
                  key={product.id}
                  product={product}
                  isOpen={isOpen}
                  variantCount={variantCount}
                  canDeleteVariants={canDeleteVariants}
                  drafts={drafts}
                  dirtyVariantIds={dirtyVariantIds}
                  disabled={
                    disabled ||
                    Boolean(
                      (addingProductId && addingProductId !== product.id) ||
                        (renamingProductId && renamingProductId !== product.id),
                    )
                  }
                  onToggleProduct={onToggleProduct}
                  onDraftChange={onDraftChange}
                  onDeleteVariant={onDeleteVariant}
                  onCreateVariants={onCreateVariants}
                  onAddOption={onAddOption}
                  onRenameOptions={onRenameOptions}
                  isAdding={addingProductId === product.id}
                  isRenaming={renamingProductId === product.id}
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
  canDeleteVariants,
  drafts,
  dirtyVariantIds,
  disabled,
  onToggleProduct,
  onDraftChange,
  onDeleteVariant,
  onCreateVariants,
  onAddOption,
  onRenameOptions,
  isAdding,
  isRenaming,
}: {
  product: VariantEditorProduct;
  isOpen: boolean;
  variantCount: number;
  canDeleteVariants: boolean;
  drafts: Record<string, VariantEditorDraft>;
  dirtyVariantIds: Set<string>;
  disabled?: boolean;
  isAdding?: boolean;
  onToggleProduct: (productId: string) => void;
  onDraftChange: (
    variantId: string,
    field: keyof VariantEditorDraft,
    value: string,
  ) => void;
  onDeleteVariant: (productId: string, variant: VariantEditorVariant) => void;
  onCreateVariants: (
    productId: string,
    variants: VariantEditorCreateInput[],
  ) => void;
  onAddOption: (productId: string, optionName: string, values: string[]) => void;
  onRenameOptions: (
    productId: string,
    changes: VariantEditorRenameOptionChange[],
  ) => void;
  isRenaming?: boolean;
}) {
  const [showAddPanel, setShowAddPanel] = useState(
    () => isSimpleProduct(product) && product.variants.length === 0,
  );
  const addPanelOpen = isAdding || showAddPanel;
  const simple = isSimpleProduct(product);
  const editableOptions = getEditableOptions(product);
  const hasDirtyVariant = product.variants.some((variant) =>
    dirtyVariantIds.has(variant.id),
  );
  const tagPreview =
    product.tags.length > 0
      ? product.tags.slice(0, 3).join(", ") +
        (product.tags.length > 3 ? ` +${product.tags.length - 3}` : "")
      : null;

  return (
    <>
      <tr
        className={`variant-editor__product-row${hasDirtyVariant ? " variant-editor__product-row--dirty" : ""}`}
      >
        <td className="variant-editor__cell variant-editor__cell--photo">
          <ProductThumbnail
            imageUrl={product.imageUrl}
            alt={product.imageAlt || product.title}
          />
        </td>
        <td colSpan={7}>
          <button
            type="button"
            className="variant-editor__product-toggle"
            onClick={() => onToggleProduct(product.id)}
            disabled={disabled || variantCount <= 1}
          >
            <span className="variant-editor__chevron">
              {variantCount <= 1 ? "•" : isOpen ? "▾" : "▸"}
            </span>
            <span className="variant-editor__product-copy">
              <span className="variant-editor__product-title">{product.title}</span>
              <span className="variant-editor__product-meta">
                <span
                  className={`variant-editor__status ${statusClassName(product.status)}`}
                >
                  {formatStatus(product.status)}
                </span>
                {product.vendor ? (
                  <>
                    <span className="variant-editor__meta-sep">·</span>
                    <span>{product.vendor}</span>
                  </>
                ) : null}
                {product.productType ? (
                  <>
                    <span className="variant-editor__meta-sep">·</span>
                    <span>{product.productType}</span>
                  </>
                ) : null}
                <span className="variant-editor__meta-sep">·</span>
                <span>{product.handle}</span>
                {variantCount > 1 ? (
                  <>
                    <span className="variant-editor__meta-sep">·</span>
                    <span>{variantCount} variantes</span>
                  </>
                ) : variantCount === 1 ? (
                  <>
                    <span className="variant-editor__meta-sep">·</span>
                    <span>{simple ? "Sin opciones" : "1 variante"}</span>
                  </>
                ) : (
                  <>
                    <span className="variant-editor__meta-sep">·</span>
                    <span className="variant-editor__badge-empty">Sin variantes</span>
                  </>
                )}
                {tagPreview ? (
                  <>
                    <span className="variant-editor__meta-sep">·</span>
                    <span className="variant-editor__tags">{tagPreview}</span>
                  </>
                ) : null}
              </span>
            </span>
          </button>
        </td>
      </tr>

      {(isOpen || variantCount <= 1) && editableOptions.length > 0 && (
        <VariantOptionsEditor
          product={product}
          disabled={disabled || isRenaming}
          onRename={(changes) => onRenameOptions(product.id, changes)}
        />
      )}

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
              product={product}
              variant={variant}
              draft={draft}
              dirty={dirtyVariantIds.has(variant.id)}
              disabled={disabled}
              canDelete={canDeleteVariants}
              onDraftChange={onDraftChange}
              onDeleteVariant={onDeleteVariant}
            />
          );
        })}

      {(isOpen || variantCount <= 1 || addPanelOpen) && !addPanelOpen && (
        <tr className="variant-editor__add-trigger-row">
          <td colSpan={8}>
            <button
              type="button"
              className={`variant-editor__add-trigger${simple ? " variant-editor__add-trigger--highlight" : ""}`}
              disabled={disabled}
              onClick={() => setShowAddPanel(true)}
            >
              + Agregar variante
              {simple ? " (tallas, colores…)" : ""}
            </button>
          </td>
        </tr>
      )}

      {(isOpen || variantCount <= 1 || addPanelOpen) && addPanelOpen && (
        <VariantAddPanel
          product={product}
          disabled={disabled}
          onCancel={() => setShowAddPanel(false)}
          onCreate={(variants) => {
            setShowAddPanel(false);
            onCreateVariants(product.id, variants);
          }}
          onAddOption={(optionName, values) => {
            setShowAddPanel(false);
            onAddOption(product.id, optionName, values);
          }}
        />
      )}
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
