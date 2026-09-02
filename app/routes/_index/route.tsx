import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, redirect } from "react-router"; // <-- Importamos redirect
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  // Verificamos si Shopify está cargando esto dentro de su iframe
  const isEmbedded = url.searchParams.get("embedded") === "1";

  if (shop) {
    if (isEmbedded) {
      // 🚀 LA MAGIA: Si estamos dentro del iframe, evitamos el login 
      // y redirigimos al panel de la app. Allí, authenticate.admin() 
      // gestionará los tokens de forma segura sin romper el iframe.
      throw redirect(`/app${url.search}`);
    }
    
    // Si estamos afuera (ej: pantalla completa de instalación), usamos el login normal.
    throw await login(request);
  }
  return { showForm: Boolean(login) };
};

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();

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
          maxWidth: "460px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: "0 0 10px 0", fontSize: "22px", fontWeight: "700" }}>
          ⚡ SEO PRO - All in One
        </h1>
        <p style={{ margin: "0 0 20px 0", color: "#6d7175", fontSize: "14px" }}>
          Ingresa el dominio de tu tienda para conectar la aplicación:
        </p>

        {showForm && (
          <form method="get" action="/auth/login" target="_top" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input
              type="text"
              name="shop"
              placeholder="tu-tienda.myshopify.com"
              required
              style={{
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid #c9cccf",
                fontSize: "15px",
                outline: "none",
              }}
            />
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
              Conectar con Shopify
            </button>
          </form>
        )}
      </div>
    </div>
  );
}