import { useMemo, useState } from "react";

import { CatalogField, CatalogInput } from "./catalog-ui";
import type { VariantEditorCreateInput } from "../lib/catalog-variant-editor.shared";
import {
  buildVariantCombinations,
  canAddSecondOption,
  getEditableOptions,
  isSimpleProduct,
  type VariantEditorProduct,
} from "../lib/catalog-variant-editor.shared";

type VariantAddPanelProps = {
  product: VariantEditorProduct;
  disabled?: boolean;
  onCancel: () => void;
  onCreate: (variants: VariantEditorCreateInput[]) => void;
  onAddOption: (optionName: string, values: string[]) => void;
};

const DEFAULT_OPTION_NAME = "Talla";
const DEFAULT_SECOND_OPTION_NAME = "Color";

type PanelMode = "variant" | "second-option";

function splitValues(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function defaultDraft(product: VariantEditorProduct) {
  const base = product.variants[0];
  return {
    price: base?.price ?? "",
    compareAtPrice: base?.compareAtPrice ?? "",
    stock: base?.stock ?? "",
    sku: base?.sku ?? "",
    barcode: base?.barcode ?? "",
  };
}

export function VariantAddPanel({
  product,
  disabled,
  onCancel,
  onCreate,
  onAddOption,
}: VariantAddPanelProps) {
  const simple = isSimpleProduct(product);
  const editableOptions = getEditableOptions(product);
  const allowSecondOption = simple || canAddSecondOption(product);
  const defaults = useMemo(() => defaultDraft(product), [product]);

  const [mode, setMode] = useState<PanelMode>(
    canAddSecondOption(product) ? "variant" : "variant",
  );
  const [showSecondOption, setShowSecondOption] = useState(false);
  const [optionName, setOptionName] = useState(DEFAULT_OPTION_NAME);
  const [optionValues, setOptionValues] = useState("");
  const [option2Name, setOption2Name] = useState(DEFAULT_SECOND_OPTION_NAME);
  const [option2Values, setOption2Values] = useState("");
  const [newOptionName, setNewOptionName] = useState(DEFAULT_SECOND_OPTION_NAME);
  const [newOptionValues, setNewOptionValues] = useState("");
  const [optionSelections, setOptionSelections] = useState<Record<string, string>>(
    () => Object.fromEntries(editableOptions.map((option) => [option.name, ""])),
  );
  const [price, setPrice] = useState(defaults.price);
  const [compareAtPrice, setCompareAtPrice] = useState(defaults.compareAtPrice);
  const [stock, setStock] = useState(defaults.stock);
  const [sku, setSku] = useState(defaults.sku);
  const [barcode, setBarcode] = useState(defaults.barcode);

  const parsedValues = splitValues(optionValues);
  const parsedValues2 = splitValues(option2Values);
  const parsedNewOptionValues = splitValues(newOptionValues);

  const sharedFields = {
    price: price.trim(),
    compareAtPrice: compareAtPrice.trim(),
    stock: stock.trim(),
    barcode: barcode.trim(),
  };

  const simpleCreateCount = useMemo(() => {
    if (!simple) return 1;

    const sets = [{ optionName: optionName.trim(), values: parsedValues }];
    if (showSecondOption && option2Name.trim() && parsedValues2.length > 0) {
      sets.push({ optionName: option2Name.trim(), values: parsedValues2 });
    }

    return buildVariantCombinations(sets, {
      price: price.trim(),
      compareAtPrice: compareAtPrice.trim(),
      stock: stock.trim(),
      barcode: barcode.trim(),
    }).length;
  }, [
    simple,
    optionName,
    parsedValues,
    showSecondOption,
    option2Name,
    parsedValues2,
    price,
    compareAtPrice,
    stock,
    barcode,
  ]);

  const existingOptionPreview = editableOptions[0];

  const submit = () => {
    if (mode === "second-option" && canAddSecondOption(product)) {
      const name = newOptionName.trim();
      const values = parsedNewOptionValues;

      if (!name) {
        window.alert("Indica el nombre de la nueva opción (por ejemplo, Color).");
        return;
      }
      if (values.length === 0) {
        window.alert("Indica al menos un valor (por ejemplo, Rojo, Azul).");
        return;
      }

      onAddOption(name, values);
      return;
    }

    if (simple) {
      const name = optionName.trim();
      const values = parsedValues;

      if (!name) {
        window.alert("Indica el nombre de la opción (por ejemplo, Talla o Color).");
        return;
      }
      if (values.length === 0) {
        window.alert("Indica al menos un valor (por ejemplo, S, M, L).");
        return;
      }

      const sets = [{ optionName: name, values }];
      if (showSecondOption) {
        const secondName = option2Name.trim();
        const secondValues = parsedValues2;

        if (!secondName) {
          window.alert("Indica el nombre de la segunda opción (por ejemplo, Color).");
          return;
        }
        if (secondValues.length === 0) {
          window.alert("Indica al menos un valor para la segunda opción.");
          return;
        }

        sets.push({ optionName: secondName, values: secondValues });
      }

      onCreate(buildVariantCombinations(sets, sharedFields, sku.trim()));
      return;
    }

    const selections = editableOptions.map((option) => ({
      optionName: option.name,
      value: optionSelections[option.name]?.trim() ?? "",
    }));

    if (selections.some((selection) => !selection.value)) {
      window.alert("Completa todas las opciones de la variante.");
      return;
    }

    onCreate([
      {
        optionValues: selections,
        sku: sku.trim(),
        ...sharedFields,
      },
    ]);
  };

  const submitLabel = (() => {
    if (mode === "second-option") {
      return parsedNewOptionValues.length > 1
        ? `Agregar opción y generar combinaciones`
        : "Agregar opción y generar variantes";
    }
    if (simple && simpleCreateCount > 1) {
      return `Crear ${simpleCreateCount} variantes`;
    }
    return "Crear variante";
  })();

  return (
    <div className="variant-editor__add-panel-wrap">
      <div className="variant-editor__add-panel">
          <div className="variant-editor__add-head">
            <div>
              <p className="variant-editor__add-title">Agregar variante</p>
              {simple ? (
                <p className="variant-editor__add-hint">
                  {product.variants.length === 0
                    ? "Crea la primera variante. Puedes definir una o dos opciones (Talla + Color)."
                    : "Este producto solo tiene la variante por defecto. Define tallas, colores o ambas."}
                </p>
              ) : canAddSecondOption(product) ? (
                <p className="variant-editor__add-hint">
                  Agrega una variante individual o incorpora una segunda opción como Color
                  para generar todas las combinaciones con {existingOptionPreview?.name}.
                </p>
              ) : (
                <p className="variant-editor__add-hint">
                  Completa todas las opciones del producto y los datos de inventario.
                </p>
              )}
            </div>
            <button
              type="button"
              className="variant-editor__toolbar-btn"
              onClick={onCancel}
              disabled={disabled}
            >
              Cancelar
            </button>
          </div>

          {canAddSecondOption(product) && (
            <div className="variant-editor__add-tabs">
              <button
                type="button"
                className={`variant-editor__add-tab${mode === "variant" ? " variant-editor__add-tab--active" : ""}`}
                disabled={disabled}
                onClick={() => setMode("variant")}
              >
                Una variante
              </button>
              <button
                type="button"
                className={`variant-editor__add-tab${mode === "second-option" ? " variant-editor__add-tab--active" : ""}`}
                disabled={disabled}
                onClick={() => setMode("second-option")}
              >
                Segunda opción (ej. Color)
              </button>
            </div>
          )}

          <div className="variant-editor__add-grid">
            {mode === "second-option" && canAddSecondOption(product) ? (
              <>
                <CatalogField
                  label="Nueva opción"
                  hint={`Se combinará con ${existingOptionPreview?.name}: ${existingOptionPreview?.values.slice(0, 6).join(", ") || "—"}`}
                >
                  <CatalogInput
                    value={newOptionName}
                    disabled={disabled}
                    placeholder="Color"
                    onChange={(e) => setNewOptionName(e.target.value)}
                  />
                </CatalogField>
                <CatalogField
                  label="Valores de la nueva opción"
                  hint="Separados por coma: Rojo, Azul, Verde"
                >
                  <CatalogInput
                    value={newOptionValues}
                    disabled={disabled}
                    placeholder="Rojo, Azul"
                    onChange={(e) => setNewOptionValues(e.target.value)}
                  />
                </CatalogField>
              </>
            ) : simple ? (
              <>
                <CatalogField label="Opción 1" hint="Ej. Talla, Material">
                  <CatalogInput
                    value={optionName}
                    disabled={disabled}
                    placeholder="Talla"
                    onChange={(e) => setOptionName(e.target.value)}
                  />
                </CatalogField>
                <CatalogField
                  label="Valores opción 1"
                  hint="Separados por coma: S, M, L"
                >
                  <CatalogInput
                    value={optionValues}
                    disabled={disabled}
                    placeholder="S, M, L"
                    onChange={(e) => setOptionValues(e.target.value)}
                  />
                </CatalogField>

                {allowSecondOption && !showSecondOption && (
                  <div className="variant-editor__add-span">
                    <button
                      type="button"
                      className="variant-editor__add-link-btn"
                      disabled={disabled}
                      onClick={() => setShowSecondOption(true)}
                    >
                      + Agregar segunda opción (Color, Material…)
                    </button>
                  </div>
                )}

                {showSecondOption && (
                  <>
                    <CatalogField label="Opción 2" hint="Ej. Color">
                      <CatalogInput
                        value={option2Name}
                        disabled={disabled}
                        placeholder="Color"
                        onChange={(e) => setOption2Name(e.target.value)}
                      />
                    </CatalogField>
                    <CatalogField
                      label="Valores opción 2"
                      hint="Separados por coma: Rojo, Azul"
                    >
                      <CatalogInput
                        value={option2Values}
                        disabled={disabled}
                        placeholder="Rojo, Azul"
                        onChange={(e) => setOption2Values(e.target.value)}
                      />
                    </CatalogField>
                    <div className="variant-editor__add-span">
                      <button
                        type="button"
                        className="variant-editor__add-link-btn"
                        disabled={disabled}
                        onClick={() => {
                          setShowSecondOption(false);
                          setOption2Values("");
                        }}
                      >
                        Quitar segunda opción
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              editableOptions.map((option) => (
                <CatalogField
                  key={option.id}
                  label={option.name}
                  hint={
                    option.values.length > 0
                      ? `Existentes: ${option.values.slice(0, 5).join(", ")}`
                      : undefined
                  }
                >
                  <CatalogInput
                    value={optionSelections[option.name] ?? ""}
                    disabled={disabled}
                    placeholder={`Ej. ${option.values[0] ?? "nuevo valor"}`}
                    list={`variant-option-${product.id}-${option.id}`}
                    onChange={(e) =>
                      setOptionSelections((current) => ({
                        ...current,
                        [option.name]: e.target.value,
                      }))
                    }
                  />
                  {option.values.length > 0 ? (
                    <datalist id={`variant-option-${product.id}-${option.id}`}>
                      {option.values.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  ) : null}
                </CatalogField>
              ))
            )}

            {mode !== "second-option" && (
              <>
                <CatalogField label="Precio">
                  <CatalogInput
                    value={price}
                    disabled={disabled}
                    inputMode="decimal"
                    placeholder="0.00"
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </CatalogField>
                <CatalogField label="Precio comparado">
                  <CatalogInput
                    value={compareAtPrice}
                    disabled={disabled}
                    inputMode="decimal"
                    placeholder="Opcional"
                    onChange={(e) => setCompareAtPrice(e.target.value)}
                  />
                </CatalogField>
                <CatalogField label="Stock">
                  <CatalogInput
                    value={stock}
                    disabled={disabled}
                    inputMode="numeric"
                    placeholder="0"
                    onChange={(e) => setStock(e.target.value)}
                  />
                </CatalogField>
                <CatalogField
                  label="SKU"
                  hint={
                    simple && simpleCreateCount > 1 && sku.trim()
                      ? `Se creará como ${sku.trim()}-VALOR1-VALOR2`
                      : undefined
                  }
                >
                  <CatalogInput
                    value={sku}
                    disabled={disabled}
                    placeholder="Opcional"
                    onChange={(e) => setSku(e.target.value)}
                  />
                </CatalogField>
                <CatalogField label="Código barras">
                  <CatalogInput
                    value={barcode}
                    disabled={disabled}
                    placeholder="Opcional"
                    onChange={(e) => setBarcode(e.target.value)}
                  />
                </CatalogField>
              </>
            )}
          </div>

          {simple && mode !== "second-option" && simpleCreateCount > 1 && (
            <p className="variant-editor__add-preview">
              Se crearán {simpleCreateCount} variantes (todas las combinaciones).
            </p>
          )}

          {mode === "second-option" &&
            canAddSecondOption(product) &&
            parsedNewOptionValues.length > 0 &&
            existingOptionPreview && (
              <p className="variant-editor__add-preview">
                Shopify generará combinaciones de {existingOptionPreview.name} ×{" "}
                {newOptionName.trim() || "nueva opción"} (
                {existingOptionPreview.values.length || 1} ×{" "}
                {parsedNewOptionValues.length} aprox.).
              </p>
            )}

          <div className="variant-editor__add-actions">
            <button
              type="button"
              className="variant-editor__add-btn"
              disabled={disabled}
              onClick={submit}
            >
              {submitLabel}
            </button>
          </div>
        </div>
    </div>
  );
}
