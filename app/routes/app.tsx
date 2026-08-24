import type { HeadersFunction, LinksFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import catalogStyles from "../styles/catalog-app.css?url";
import { authenticate } from "../shopify.server";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: catalogStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

function NavLink({ to, children }: { to: string; children: string }) {
  const location = useLocation();
  const active =
    to === "/app"
      ? location.pathname === "/app" || location.pathname === "/app/"
      : location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      style={{
        textDecoration: "none",
        fontWeight: active ? 600 : 400,
      }}
    >
      <span style={{ textDecoration: active ? "underline" : "none" }}>
        {children}
      </span>
    </Link>
  );
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <NavLink to="/app">Inicio</NavLink>
        <NavLink to="/app/bulk-edit">Edición masiva</NavLink>
        <NavLink to="/app/variants">Variantes</NavLink>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return {
    ...boundary.headers(headersArgs),
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
};
