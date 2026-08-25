import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";

import {
  CatalogBodyText,
  CatalogPage,
  CatalogStep,
  CatalogStepActions,
  CatalogSteps,
} from "../components/catalog-ui";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Dashboard() {
  return (
    <s-page heading="Catálogo">
      <CatalogPage>
        <CatalogSteps>
          <CatalogStep step={1} title="Edición masiva sin variantes">
            <CatalogBodyText>
              Productos simples (sin tallas ni colores). Descarga un Excel con
              una fila por producto, edita precio, stock y tags, y súbelo de
              nuevo.
            </CatalogBodyText>
            <CatalogStepActions>
              <Link to="/app/bulk-edit" style={{ textDecoration: "none" }}>
                <s-button variant="primary">Edición masiva simple</s-button>
              </Link>
            </CatalogStepActions>
          </CatalogStep>

          <CatalogStep step={2} title="Edición masiva con variantes">
            <CatalogBodyText>
              Productos con tallas, colores u otras opciones. Descarga un Excel
              con una fila por variante, edítalo y súbelo de nuevo.
            </CatalogBodyText>
            <CatalogStepActions>
              <Link
                to="/app/bulk-edit-variants"
                style={{ textDecoration: "none" }}
              >
                <s-button variant="primary">Edición masiva de variantes</s-button>
              </Link>
            </CatalogStepActions>
          </CatalogStep>
        </CatalogSteps>
      </CatalogPage>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
