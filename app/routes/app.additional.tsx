import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// 1. El loader es OBLIGATORIO para que Shopify autorice la ruta hija
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AdditionalPage() {
  return (
    <div style={{ padding: "0 4px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      
      {/* CABECERA */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#202223", margin: "0 0 6px 0" }}>
          📚 Manual de Buenas Prácticas & Centro de Ayuda SEO
        </h1>
        <p style={{ margin: 0, color: "#6d7175", fontSize: "14px" }}>
          Guía técnica y recomendaciones oficiales de Google para posicionar tu tienda Shopify en los primeros lugares de búsqueda orgánica.
        </p>
      </div>

      {/* TARJETA DE RECOMENDACIÓN RÁPIDA */}
      <div
        style={{
          backgroundColor: "#f0f7f5",
          border: "1px solid #b7ece0",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
        }}
      >
        <span style={{ fontSize: "28px", lineHeight: "1" }}>💡</span>
        <div>
          <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: "600", color: "#005e46" }}>
            Regla de Oro del SEO para E-Commerce
          </h3>
          <p style={{ margin: 0, color: "#2c5448", fontSize: "13px", lineHeight: "1.5" }}>
            Los motores de búsqueda premian la especificidad. Evita títulos genéricos como "Remera" o "Camisa". Utiliza siempre la fórmula: <strong>[Producto] + [Material / Característica] + [Beneficio o Marca]</strong>.
          </p>
        </div>
      </div>

      {/* BLOQUES DE GUÍA TÉCNICA */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "18px",
          marginBottom: "28px",
        }}
      >
        {/* BLOQUE 1: TÍTULOS SEO */}
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e1e3e5",
            borderRadius: "10px",
            padding: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "20px" }}>🏷️</span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#202223" }}>
              1. Títulos SEO (Meta Titles)
            </h3>
          </div>
          <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#6d7175", lineHeight: "1.5" }}>
            Es el factor de posicionamiento on-page más influyente para Google.
          </p>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#303030", lineHeight: "1.6" }}>
            <li><strong>Longitud ideal:</strong> Entre 50 y 60 caracteres.</li>
            <li>Coloca la palabra clave principal al inicio del título.</li>
            <li>Evita superar los 60 caracteres para que Google no lo corte con puntos suspensivos (...).</li>
          </ul>
        </div>

        {/* BLOQUE 2: META DESCRIPCIONES */}
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e1e3e5",
            borderRadius: "10px",
            padding: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "20px" }}>📝</span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#202223" }}>
              2. Meta Descripciones
            </h3>
          </div>
          <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#6d7175", lineHeight: "1.5" }}>
            Determina la tasa de clics (CTR) en la página de resultados de búsqueda.
          </p>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#303030", lineHeight: "1.6" }}>
            <li><strong>Longitud recomendada:</strong> Entre 120 y 155 caracteres.</li>
            <li>Incluye incentivos comerciales (ej: <em>Envío gratis</em>, <em>Garantía oficial</em>).</li>
            <li>Añade un llamado a la acción claro (ej: <em>Compra online al mejor precio</em>).</li>
          </ul>
        </div>

        {/* BLOQUE 3: TEXTOS ALT */}
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e1e3e5",
            borderRadius: "10px",
            padding: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "20px" }}>🖼️</span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#202223" }}>
              3. Textos Alternativos (ALT)
            </h3>
          </div>
          <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#6d7175", lineHeight: "1.5" }}>
            Permite a los motores de búsqueda indexar tus productos en Google Imágenes.
          </p>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#303030", lineHeight: "1.6" }}>
            <li>Describe el producto de forma natural y sin repetir palabras clave innecesariamente.</li>
            <li>Usa la pestaña <strong>Optimizador Masivo ALT</strong> del panel para completar todas las fotos sin etiqueta con un solo clic.</li>
          </ul>
        </div>

        {/* BLOQUE 4: SITEMAP Y CANONICALS */}
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e1e3e5",
            borderRadius: "10px",
            padding: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "20px" }}>🗺️</span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#202223" }}>
              4. Sitemap & Indexación
            </h3>
          </div>
          <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#6d7175", lineHeight: "1.5" }}>
            Controla qué contenido rastrean los motores de búsqueda.
          </p>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#303030", lineHeight: "1.6" }}>
            <li>El sitemap de tu tienda siempre se ubica en <code>/sitemap.xml</code>.</li>
            <li>Usa la opción <strong>Ocultar (noindex)</strong> en el panel para páginas de prueba o duplicadas.</li>
          </ul>
        </div>
      </div>

      {/* CHECKLIST DE RUTINA SEO */}
      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e1e3e5",
          borderRadius: "10px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "600", color: "#202223" }}>
          📋 Checklist de Mantenimiento SEO
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "14px", color: "#303030" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input type="checkbox" defaultChecked />
            <span>Verificar periódicamente productos con diagnósticos en rojo en el panel principal.</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input type="checkbox" defaultChecked />
            <span>Optimizar de forma masiva los textos ALT de imágenes nuevas.</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input type="checkbox" />
            <span>Revisar que todas las colecciones principales tengan meta descripción redactada.</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input type="checkbox" />
            <span>Enviar el archivo <code>sitemap.xml</code> a Google Search Console.</span>
          </label>
        </div>
      </div>

    </div>
  );
}