# CEO Plan: App Catálogo CSV — Visión y roadmap

**Fecha:** 2026-06-02  
**Estado:** Fase 1 implementada (2026-06-02)  
**Modo gstack:** HOLD SCOPE + SELECTIVE EXPANSION

---

## Visión

Convertir la app de catálogo CSV en la herramienta más simple y confiable para que merchants editen productos en masa sin salir del flujo Excel/Sheets que ya conocen — pero con la seguridad de no romper handles, metafields ni variantes.

**Job to be done:** "Quiero exportar todo mi catálogo, editarlo donde me sienta cómodo, y volver a subirlo sin miedo."

---

## Lo que acabamos de entregar (MVP+)

| Capacidad | Antes | Ahora |
|-----------|-------|-------|
| Exportación | Máx. 50 productos | **Todos** (paginación GraphQL) |
| Nombre archivo | Fijo `catalogo-YYYY-MM-DD.csv` | **Personalizable** + plantillas |
| UX inicio | "Hasta 50 productos" | "Todos los productos" |
| Progreso | Botón loading sin detalle | **Barra** "Exportando X de Y" |
| Filtros | No | **Colección, vendor, status, tag** |
| Historial | No | **DB** con nombre, fecha, conteo, filtros |

---

## Scope Decisions

### Aceptado (próximas 2–4 semanas)

1. ~~**Barra de progreso en exportación**~~ ✅ Implementado (export por lotes + barra %)
2. ~~**Plantillas de nombre**~~ ✅ Implementado (verano, backup, vendor)
3. ~~**Exportación filtrada**~~ ✅ Implementado (colección, vendor, status, tag)
4. ~~**Historial de exportaciones**~~ ✅ Implementado (Prisma `ExportHistory`)

1. **Conteo en vivo con filtros** — Mostrar cuántos productos coinciden antes de exportar
2. **Re-descargar desde historial** — Regenerar CSV con mismos filtros
3. **Export async** — Para tiendas >2.000 productos (evitar timeout)

### Diferido (TODOS.md / fase 2)

- Exportación programada (cron/email)
- Multi-variante por fila (hoy: solo 1ª variante)
- Sincronización bidireccional en tiempo real
- Integración con Google Sheets API directa

### Rechazado por ahora

- Editor WYSIWYG in-app — compite con Excel; no es nuestro wedge
- IA para reescribir descripciones — nice-to-have, no core loop

---

## Métricas de éxito

| Métrica | Target 30 días |
|---------|----------------|
| Exportaciones completadas / sesión | >1 (re-export tras editar) |
| Tasa de error en import | <5% |
| Tiempo medio export 1.000 productos | <45s |
| NPS merchant (encuesta in-app) | ≥40 |

---

## Riesgos estratégicos

1. **Timeout en tiendas grandes** — Shopify embedded apps tienen límites de request; considerar export async con webhook/polling.
2. **Rate limits GraphQL** — Paginación a 250/page es correcta; monitorear cost points en tiendas >10k SKUs.
3. **Competencia nativa** — Shopify Admin ya exporta CSV; nuestro diferencial = metafields + re-import limpio + UX en español.

---

## Próximo checkpoint

Revisar con `/plan-eng-review` la arquitectura de export async antes de implementar progress bar.
