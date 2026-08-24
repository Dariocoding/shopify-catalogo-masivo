import { useEffect, useMemo, useState } from "react";

import { CatalogField, CatalogInput } from "./catalog-ui";
import type { VariantEditorRenameOptionChange } from "../lib/catalog-variant-editor.shared";
import {
  getEditableOptions,
  type VariantEditorOption,
  type VariantEditorProduct,
} from "../lib/catalog-variant-editor.shared";

type VariantOptionsEditorProps = {
  product: VariantEditorProduct;
  disabled?: boolean;
  onRename: (changes: VariantEditorRenameOptionChange[]) => void;
};

function buildNameDraft(options: VariantEditorOption[]) {
  return Object.fromEntries(options.map((option) => [option.id, option.name]));
}

function buildValueDraft(options: VariantEditorOption[]) {
  return Object.fromEntries(
    options.flatMap((option) =>
      option.valueEntries.map((value) => [value.id, value.name]),
    ),
  );
}

export function VariantOptionsEditor({
  product,
  disabled,
  onRename,
}: VariantOptionsEditorProps) {
  const editableOptions = getEditableOptions(product);
  const [nameDrafts, setNameDrafts] = useState(() => buildNameDraft(editableOptions));
  const [valueDrafts, setValueDrafts] = useState(() => buildValueDraft(editableOptions));
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const options = getEditableOptions(product);
    setNameDrafts(buildNameDraft(options));
    setValueDrafts(buildValueDraft(options));
  }, [product]);

  const dirtyChanges = useMemo(() => {
    const changes: VariantEditorRenameOptionChange[] = [];

    for (const option of editableOptions) {
      const nextName = nameDrafts[option.id]?.trim() ?? "";
      const nameChanged = nextName.length > 0 && nextName !== option.name;
      const valueChanges = option.valueEntries
        .map((value) => ({
          valueId: value.id,
          name: valueDrafts[value.id]?.trim() ?? "",
          originalName: value.name,
        }))
        .filter(
          (value) => value.name.length > 0 && value.name !== value.originalName,
        )
        .map(({ valueId, name }) => ({ valueId, name }));

      if (nameChanged || valueChanges.length > 0) {
        changes.push({
          optionId: option.id,
          ...(nameChanged ? { name: nextName } : {}),
          ...(valueChanges.length > 0 ? { valueChanges } : {}),
        });
      }
    }

    return changes;
  }, [editableOptions, nameDrafts, valueDrafts]);

  const dirtyCount = useMemo(
    () =>
      dirtyChanges.reduce(
        (count, change) =>
          count +
          (change.name ? 1 : 0) +
          (change.valueChanges?.length ?? 0),
        0,
      ),
    [dirtyChanges],
  );

  if (editableOptions.length === 0) return null;

  const reset = () => {
    setNameDrafts(buildNameDraft(editableOptions));
    setValueDrafts(buildValueDraft(editableOptions));
  };

  const save = () => {
    if (dirtyChanges.length === 0) {
      window.alert("No hay cambios en opciones o valores.");
      return;
    }

    if (
      dirtyChanges.some(
        (change) => change.name?.toLowerCase() === "title",
      )
    ) {
      window.alert('No puedes usar "Title" como nombre de opción.');
      return;
    }

    onRename(dirtyChanges);
  };

  return (
    <div className="variant-editor__options-panel">
          <div className="variant-editor__options-head">
            <div>
              <p className="variant-editor__options-title">Opciones del producto</p>
              <p className="variant-editor__options-hint">
                Renombra opciones (Talla → Size) y valores (Rojo → Red). Las variantes
                existentes se actualizan automáticamente.
              </p>
            </div>
            <button
              type="button"
              className="variant-editor__toolbar-btn"
              disabled={disabled}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Ocultar" : "Editar opciones y valores"}
            </button>
          </div>

          {expanded && (
            <>
              <div className="variant-editor__options-list">
                {editableOptions.map((option) => (
                  <div key={option.id} className="variant-editor__option-block">
                    <CatalogField label={`Nombre de la opción "${option.name}"`}>
                      <CatalogInput
                        value={nameDrafts[option.id] ?? option.name}
                        disabled={disabled}
                        placeholder={option.name}
                        onChange={(e) =>
                          setNameDrafts((current) => ({
                            ...current,
                            [option.id]: e.target.value,
                          }))
                        }
                      />
                    </CatalogField>

                    {option.valueEntries.length > 0 ? (
                      <div className="variant-editor__values-grid">
                        {option.valueEntries.map((value) => (
                          <CatalogField
                            key={value.id}
                            label={`Valor "${value.name}"`}
                          >
                            <CatalogInput
                              value={valueDrafts[value.id] ?? value.name}
                              disabled={disabled}
                              placeholder={value.name}
                              onChange={(e) =>
                                setValueDrafts((current) => ({
                                  ...current,
                                  [value.id]: e.target.value,
                                }))
                              }
                            />
                          </CatalogField>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="variant-editor__options-actions">
                <button
                  type="button"
                  className="variant-editor__toolbar-btn"
                  disabled={disabled}
                  onClick={reset}
                >
                  Descartar
                </button>
                <button
                  type="button"
                  className="variant-editor__add-btn"
                  disabled={disabled || dirtyCount === 0}
                  onClick={save}
                >
                  Guardar cambios
                  {dirtyCount > 0 ? ` (${dirtyCount})` : ""}
                </button>
              </div>
            </>
          )}
    </div>
  );
}
