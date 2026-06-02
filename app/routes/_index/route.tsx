import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function LoginLanding() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Catalog Sync</h1>
        <p className={styles.text}>
          Importa y exporta productos de tu tienda con archivos Excel.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Dominio de la tienda</span>
              <input className={styles.input} type="text" name="shop" />
              <span>ej: mi-tienda.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Iniciar sesión
            </button>
          </Form>
        )}
      </div>
    </div>
  );
};
