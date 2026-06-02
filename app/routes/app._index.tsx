import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";

import {
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
          <CatalogStep step={1} title="Exportar">
            <CatalogStepActions>
              <Link to="/app/export" style={{ textDecoration: "none" }}>
                <s-button variant="primary">Exportar catálogo</s-button>
              </Link>
            </CatalogStepActions>
          </CatalogStep>

          <CatalogStep step={2} title="Importar">
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
