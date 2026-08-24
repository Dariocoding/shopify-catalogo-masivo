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
          <CatalogStep step={1} title="Edición masiva">
            <CatalogBodyText>
              Descarga un Excel con una fila por producto, edita precio, stock
              y tags, y súbelo de nuevo. Sin variantes ni IDs técnicos.
            </CatalogBodyText>
            <CatalogStepActions>
              <Link to="/app/bulk-edit" style={{ textDecoration: "none" }}>
                <s-button variant="primary">Edición masiva</s-button>
              </Link>
            </CatalogStepActions>
          </CatalogStep>

          <CatalogStep step={2} title="Exportar (con variantes)">
            <CatalogStepActions>
              <Link to="/app/export" style={{ textDecoration: "none" }}>
                <s-button variant="primary">Exportar catálogo</s-button>
              </Link>
            </CatalogStepActions>
          </CatalogStep>

          <CatalogStep step={3} title="Importar (con variantes)">
            <CatalogStepActions>
              <Link to="/app/import" style={{ textDecoration: "none" }}>
                <s-button variant="primary">Importar catálogo</s-button>
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
