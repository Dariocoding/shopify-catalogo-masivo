import type { ExportFilters } from "../lib/catalog-export-filters";
import {
  CatalogField,
  CatalogFiltersActive,
  CatalogInput,
  CatalogSelect,
} from "./catalog-ui";

export type CollectionOption = { id: string; title: string };

type CatalogFiltersPanelProps = {
  filters: ExportFilters;
  collections: CollectionOption[];
  filtersLabel: string;
  hasActiveFilters: boolean;
  disabled?: boolean;
  onFilterChange: <K extends keyof ExportFilters>(
    key: K,
    value: ExportFilters[K],
  ) => void;
  onClear?: () => void;
};

export function CatalogFiltersPanel({
  filters,
  collections,
  filtersLabel,
  hasActiveFilters,
  disabled,
  onFilterChange,
  onClear,
}: CatalogFiltersPanelProps) {
  return (
    <div className="catalog-filters-panel">
      <div className="catalog-filters-panel__grid">
        <CatalogField label="Colección" className="catalog-filters-panel__span-2">
          <CatalogSelect
            value={filters.collectionId}
            onChange={(e) => onFilterChange("collectionId", e.target.value)}
            disabled={disabled}
          >
            <option value="">Todas las colecciones</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.title}
              </option>
            ))}
          </CatalogSelect>
        </CatalogField>

        <CatalogField label="Marca">
          <CatalogInput
            value={filters.vendor}
            onChange={(e) => onFilterChange("vendor", e.target.value)}
            disabled={disabled}
            placeholder="Ej. Nike"
            autoComplete="off"
          />
        </CatalogField>

        <CatalogField label="Estado">
          <CatalogSelect
            value={filters.status}
            onChange={(e) =>
              onFilterChange(
                "status",
                e.target.value as ExportFilters["status"],
              )
            }
            disabled={disabled}
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Activos</option>
            <option value="DRAFT">Borrador</option>
            <option value="ARCHIVED">Archivados</option>
          </CatalogSelect>
        </CatalogField>

        <CatalogField label="Etiqueta" className="catalog-filters-panel__span-2">
          <CatalogInput
            value={filters.tag}
            onChange={(e) => onFilterChange("tag", e.target.value)}
            disabled={disabled}
            placeholder="Ej. verano"
            autoComplete="off"
          />
        </CatalogField>
      </div>

      {hasActiveFilters && (
        <div className="catalog-filters-panel__footer">
          <CatalogFiltersActive>
            <strong>Activos:</strong> {filtersLabel}
          </CatalogFiltersActive>
          {onClear && (
            <button
              type="button"
              className="catalog-filters-panel__clear"
              onClick={onClear}
              disabled={disabled}
            >
              Quitar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}
