import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw await login(request);
  }

  return { showForm: Boolean(login) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shop = (formData.get("shop") as string) || "";

  if (!shop) {
    return { errors: { shop: "Por favor ingresa el dominio de tu tienda" } };
  }

  throw await login(request);
};

export default function AuthLogin() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f6f6f7",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "20px",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          padding: "36px",
          borderRadius: "12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          maxWidth: "440px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: "0 0 8px 0", fontSize: "22px", fontWeight: "700" }}>
          ⚡ SEO PRO - All in One
        </h1>
        <p style={{ margin: "0 0 20px 0", color: "#6d7175", fontSize: "14px" }}>
          Conecta tu tienda para autorizar la aplicación:
        </p>

        <Form method="post" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            type="text"
            name="shop"
            placeholder="ejemplo.myshopify.com"
            required
            style={{
              padding: "12px 14px",
              borderRadius: "8px",
              border: actionData?.errors?.shop ? "1px solid #d82c0d" : "1px solid #c9cccf",
              fontSize: "15px",
              outline: "none",
            }}
          />
          {actionData?.errors?.shop && (
            <span style={{ color: "#d82c0d", fontSize: "13px", textAlign: "left" }}>
              {actionData.errors.shop}
            </span>
          )}
          <button
            type="submit"
            style={{
              backgroundColor: "#008060",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "12px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Instalar / Iniciar Sesión
          </button>
        </Form>
      </div>
    </div>
  );
}