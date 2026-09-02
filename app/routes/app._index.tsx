import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";

// ==========================================
// 1. CARGA DE DATOS (LOADER) - Leer de Shopify
// ==========================================
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let shop = { name: "Mi Tienda", myshopifyDomain: "mitienda.myshopify.com" };
  let products: any[] = [];
  let collections: any[] = [];
  let pages: any[] = [];
  let articles: any[] = [];

  try {
    const mainResponse = await admin.graphql(
      `
        query getBasicSEOAuditData {
          shop { name myshopifyDomain }
          products(first: 50) {
            edges { node { id title handle status description seo { title description } featuredImage { id url altText } media(first: 10) { nodes { ... on MediaImage { id image { url altText } } } } metafield(namespace: "seo", key: "hidden") { id value } } }
          }
          collections(first: 50) {
            edges { node { id title handle description seo { title description } metafield(namespace: "seo", key: "hidden") { id value } } }
          }
        }
      `
    );
    const mainJson = await mainResponse.json();
    if (mainJson.data?.shop) shop = mainJson.data.shop;

    const rawProducts = mainJson.data?.products?.edges.map((e: any) => e.node) || [];
    products = rawProducts.map((p: any) => {
      const seoTitle = p.seo?.title || p.title || "";
      const seoDesc = p.seo?.description || "";
      const isHidden = p.metafield?.value === "1";
      const allMedia = p.media?.nodes || [];
      const missingAltCount = allMedia.filter((m: any) => !m.image?.altText || m.image.altText.trim() === "").length;

      let score = 100;
      const issues: string[] = [];
      if (seoTitle.length < 30 || seoTitle.length > 60) { score -= 25; issues.push(seoTitle.length < 30 ? "Título SEO corto (<30)" : "Título SEO largo (>60)"); }
      if (!seoDesc || seoDesc.length < 70 || seoDesc.length > 160) { score -= 35; issues.push(!seoDesc ? "Sin meta descripción" : "Meta descripción fuera de rango (70-160)"); }
      if (missingAltCount > 0) { score -= 20; issues.push(`${missingAltCount} imagen(es) sin ALT`); }
      if (score < 0) score = 0;

      return { ...p, numericId: p.id.split("/").pop(), seoTitle, seoDesc, isHidden, missingAltCount, score, issues };
    });

    const rawCollections = mainJson.data?.collections?.edges.map((e: any) => e.node) || [];
    collections = rawCollections.map((c: any) => {
      const seoTitle = c.seo?.title || c.title || "";
      const seoDesc = c.seo?.description || "";
      const isHidden = c.metafield?.value === "1";
      let score = 100;
      const issues: string[] = [];
      if (seoTitle.length < 30 || seoTitle.length > 60) { score -= 30; issues.push(seoTitle.length < 30 ? "Título corto (<30)" : "Título largo (>60)"); }
      if (!seoDesc || seoDesc.length < 70 || seoDesc.length > 160) { score -= 40; issues.push(!seoDesc ? "Sin meta descripción" : "Meta descripción fuera de rango (70-160)"); }
      if (score < 0) score = 0;
      return { ...c, numericId: c.id.split("/").pop(), seoTitle, seoDesc, isHidden, score, issues };
    });
  } catch (err) {}

  try {
    const pagesResponse = await admin.graphql(
      ` query getPagesSEO { pages(first: 50) { edges { node { id title handle bodySummary seoTitleTag: metafield(namespace: "global", key: "title_tag") { value } seoDescTag: metafield(namespace: "global", key: "description_tag") { value } metafield(namespace: "seo", key: "hidden") { id value } } } } }`
    );
    const pagesJson = await pagesResponse.json();
    if (pagesJson.data?.pages?.edges) {
      pages = pagesJson.data.pages.edges.map((e: any) => {
        const node = e.node;
        const seoTitle = node.seoTitleTag?.value || node.title || "";
        const seoDesc = node.seoDescTag?.value || (node.bodySummary ? node.bodySummary.slice(0, 160) : "");
        const isHidden = node.metafield?.value === "1";
        let score = 100;
        const issues: string[] = [];
        if (seoTitle.length < 30 || seoTitle.length > 60) { score -= 30; issues.push(seoTitle.length < 30 ? "Título corto (<30)" : "Título largo (>60)"); }
        if (!seoDesc || seoDesc.length < 70 || seoDesc.length > 160) { score -= 40; issues.push(!seoDesc ? "Sin meta descripción" : "Meta descripción fuera de rango"); }
        if (score < 0) score = 0;
        return { id: node.id, numericId: node.id.split("/").pop(), title: node.title, handle: node.handle, seoTitle, seoDesc, isHidden, score, issues };
      });
    }
  } catch (err) {}

  try {
    const blogsResponse = await admin.graphql(
      ` query getBlogsSEO { blogs(first: 10) { edges { node { id title handle articles(first: 50) { edges { node { id title handle summary author { name } image { url altText } seoTitleTag: metafield(namespace: "global", key: "title_tag") { value } seoDescTag: metafield(namespace: "global", key: "description_tag") { value } metafield(namespace: "seo", key: "hidden") { id value } } } } } } } }`
    );
    const blogsJson = await blogsResponse.json();
    if (blogsJson.data?.blogs?.edges) {
      blogsJson.data.blogs.edges.forEach((blogEdge: any) => {
        const blogNode = blogEdge.node;
        const rawArticles = blogNode.articles?.edges.map((e: any) => e.node) || [];
        rawArticles.forEach((artNode: any) => {
          const seoTitle = artNode.seoTitleTag?.value || artNode.title || "";
          const seoDesc = artNode.seoDescTag?.value || (artNode.summary ? artNode.summary.slice(0, 160) : "");
          const isHidden = artNode.metafield?.value === "1";
          const hasAlt = !artNode.image || (artNode.image?.altText && artNode.image.altText.trim() !== "");
          let score = 100;
          const issues: string[] = [];
          if (seoTitle.length < 30 || seoTitle.length > 60) { score -= 30; issues.push(seoTitle.length < 30 ? "Título corto (<30)" : "Título largo (>60)"); }
          if (!seoDesc || seoDesc.length < 70 || seoDesc.length > 160) { score -= 40; issues.push(!seoDesc ? "Sin meta descripción" : "Meta descripción fuera de rango"); }
          if (artNode.image && !hasAlt) { score -= 20; issues.push("Imagen destacada sin texto ALT"); }
          if (score < 0) score = 0;

          articles.push({ id: artNode.id, numericId: artNode.id.split("/").pop(), title: artNode.title, handle: artNode.handle, blogTitle: blogNode.title, blogHandle: blogNode.handle, authorName: artNode.author?.name || "Autor", imageUrl: artNode.image?.url || null, imageAlt: artNode.image?.altText || "", seoTitle, seoDesc, isHidden, score, issues });
        });
      });
    }
  } catch (err) {}

  const allScores = [...products.map((p) => p.score), ...collections.map((c) => c.score), ...pages.map((pg) => pg.score), ...articles.map((a) => a.score)];
  const totalScore = allScores.length > 0 ? Math.round(allScores.reduce((acc, curr) => acc + curr, 0) / allScores.length) : 100;

  return { shop, products, collections, pages, articles, totalScore };
};

// ==========================================
// 2. ACCIONES (ACTION) - Escribir en Shopify (El backend unificado)
// ==========================================
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "save_seo_metadata") {
      const resourceType = formData.get("resourceType") as string;
      const resourceId = formData.get("resourceId") as string;
      const seoTitle = (formData.get("seoTitle") as string) || "";
      const seoDesc = (formData.get("seoDesc") as string) || "";

      if (resourceType === "product") {
        await admin.graphql(
          ` mutation updateProductSEO($input: ProductInput!) { productUpdate(input: $input) { userErrors { field message } } }`,
          { variables: { input: { id: resourceId, seo: { title: seoTitle, description: seoDesc } } } }
        );
      } else if (resourceType === "collection") {
        await admin.graphql(
          ` mutation updateCollectionSEO($input: CollectionInput!) { collectionUpdate(input: $input) { userErrors { field message } } }`,
          { variables: { input: { id: resourceId, seo: { title: seoTitle, description: seoDesc } } } }
        );
      } else if (resourceType === "page" || resourceType === "article") {
        await admin.graphql(
          ` mutation updateContentSEO($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`,
          { variables: { metafields: [
            { ownerId: resourceId, namespace: "global", key: "title_tag", value: seoTitle, type: "single_line_text_field" },
            { ownerId: resourceId, namespace: "global", key: "description_tag", value: seoDesc, type: "single_line_text_field" }
          ] } }
        );
      }
      return { success: true, message: "Metadatos SEO guardados correctamente en Shopify." };
    }

    if (intent === "toggle_sitemap") {
      const resourceId = formData.get("resourceId") as string;
      const hideAction = formData.get("hideAction") as string;
      const value = hideAction === "hide" ? "1" : "0";

      await admin.graphql(
        ` mutation setSEOHiddenMetafield($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`,
        { variables: { metafields: [{ ownerId: resourceId, namespace: "seo", key: "hidden", value: value, type: "number_integer" }] } }
      );
      return { success: true, message: hideAction === "hide" ? "Recurso excluido del Sitemap e indexación (noindex)." : "Recurso incluido en el Sitemap." };
    }

    if (intent === "bulk_update_alt_texts") {
      const altTemplate = (formData.get("altTemplate") as string) || "{{title}}";
      const shopName = (formData.get("shopName") as string) || "Tienda";

      const productsQuery = await admin.graphql(
        ` query getMissingAltImages { products(first: 25) { edges { node { id title media(first: 10) { nodes { ... on MediaImage { id image { altText } } } } } } } } }`
      );

      const productsData = await productsQuery.json();
      const products = productsData.data?.products?.edges || [];

      for (const edge of products) {
        const prod = edge.node;
        const mediaNodes = prod.media?.nodes || [];
        const missingAltNodes = mediaNodes.filter((m: any) => !m.image?.altText || m.image.altText.trim() === "");

        if (missingAltNodes.length > 0) {
          const generatedAlt = altTemplate.replace(/\{\{title\}\}/g, prod.title).replace(/\{\{shop\}\}/g, shopName);
          const mediaUpdates = missingAltNodes.map((m: any) => ({ id: m.id, alt: generatedAlt }));

          await admin.graphql(
            ` mutation updateMediaAlt($media: [UpdateMediaInput!]!, $productId: ID!) { productUpdateMedia(media: $media, productId: $productId) { mediaUserErrors { field message } } }`,
            { variables: { productId: prod.id, media: mediaUpdates } }
          );
        }
      }

      return { success: true, message: "Textos alternativos (ALT) actualizados con éxito." };
    }

    return { error: "Intención no válida." };
  } catch (error: any) {
    console.error("Error en Action:", error);
    return { error: error.message || "Error al procesar la acción en Shopify." };
  }
};

// ==========================================
// 3. INTERFAZ DE USUARIO
// ==========================================
export default function CompleteSEOApp() {
  const { shop, products, collections, pages, articles, totalScore } = useLoaderData<typeof loader>();
  
  // Usamos fetcher apuntando AL MISMO ARCHIVO. Sin enredos de rutas.
  const fetcher = useFetcher<any>();
  const isSubmitting = fetcher.state !== "idle";

  const actionData = fetcher.data;
  const feedback = actionData 
    ? (actionData.error ? { type: "critical" as const, message: actionData.error } : { type: "success" as const, message: actionData.message }) 
    : null;

  const [activeTab, setActiveTab] = useState<"products" | "collections" | "pages" | "blogs" | "images" | "guide">("products");
  const [editingItem, setEditingItem] = useState<{
    id: string;
    type: "product" | "collection" | "page" | "article";
    title: string;
    handle: string;
    parentHandle?: string;
    seoTitle: string;
    seoDesc: string;
  } | null>(null);

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [altTemplate, setAltTemplate] = useState("{{title}} - {{shop}}");

  // AHORA LLAMA A SÍ MISMO
  const executeApiCall = (body: Record<string, string>) => {
    fetcher.submit(body, { method: "POST" });
  };

  const handleOpenEditor = (item: any, type: "product" | "collection" | "page" | "article", parentHandle?: string) => {
    setEditingItem({ id: item.id, type, title: item.title, handle: item.handle, parentHandle: parentHandle || "", seoTitle: item.seoTitle, seoDesc: item.seoDesc });
  };

  const handleSaveMetadata = () => {
    if (!editingItem) return;
    executeApiCall({ intent: "save_seo_metadata", resourceType: editingItem.type, resourceId: editingItem.id, seoTitle: editingItem.seoTitle, seoDesc: editingItem.seoDesc });
    setEditingItem(null);
  };

  const handleToggleSitemap = (resourceId: string, currentlyHidden: boolean) => {
    executeApiCall({ intent: "toggle_sitemap", resourceId, hideAction: currentlyHidden ? "show" : "hide" });
  };

  const handleBulkAltUpdate = () => {
    executeApiCall({ intent: "bulk_update_alt_texts", altTemplate, shopName: shop.name });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#108043";
    if (score >= 50) return "#b98900";
    return "#d82c0d";
  };

  const renderProductStatus = (status: string) => {
    switch (status) {
      case "ACTIVE": return <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", backgroundColor: "#e3f1df", color: "#108043" }}>● Activo</span>;
      case "DRAFT": return <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", backgroundColor: "#f6f6f7", color: "#5c5f62" }}>○ Borrador</span>;
      case "ARCHIVED": return <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", backgroundColor: "#fef3d6", color: "#8a6100" }}>📦 Archivado</span>;
      default: return <span style={{ fontSize: "12px", color: "#6d7175" }}>{status}</span>;
    }
  };

  const getGoogleSnippetUrl = () => {
    if (!editingItem) return `https://${shop.myshopifyDomain}`;
    if (editingItem.type === "product") return `https://${shop.myshopifyDomain}/products/${editingItem.handle}`;
    if (editingItem.type === "collection") return `https://${shop.myshopifyDomain}/collections/${editingItem.handle}`;
    if (editingItem.type === "page") return `https://${shop.myshopifyDomain}/pages/${editingItem.handle}`;
    if (editingItem.type === "article") return `https://${shop.myshopifyDomain}/blogs/${editingItem.parentHandle || "news"}/${editingItem.handle}`;
    return `https://${shop.myshopifyDomain}`;
  };

  return (
    <s-page heading="SEO Master & Sitemap Control Pro">
      <s-title-bar title="Panel de Auditoría y Control SEO" />

      {feedback && (
        <s-banner tone={feedback.type} heading={feedback.type === "critical" ? "Atención" : "Operación exitosa"}>
          {feedback.message}
        </s-banner>
      )}

      <s-card style={{ marginBottom: "20px", padding: "20px", marginTop: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "600" }}>Puntuación de Salud SEO Global</h2>
            <p style={{ margin: "4px 0 0 0", color: "#6d7175", fontSize: "14px" }}>Auditoría en tiempo real de Productos, Colecciones, Páginas y Artículos de Blog.</p>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: getScoreColor(totalScore), backgroundColor: "#f6f6f7", padding: "6px 14px", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            {totalScore} %
          </div>
        </div>
        <div style={{ width: "100%", height: "8px", backgroundColor: "#e1e3e5", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ width: `${totalScore}%`, height: "100%", backgroundColor: getScoreColor(totalScore), transition: "width 0.4s ease" }} />
        </div>
      </s-card>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", borderBottom: "1px solid #e1e3e5", paddingBottom: "8px", flexWrap: "wrap" }}>
        <s-button variant={activeTab === "products" ? "primary" : "secondary"} onClick={() => setActiveTab("products")}>📦 Productos ({products.length})</s-button>
        <s-button variant={activeTab === "collections" ? "primary" : "secondary"} onClick={() => setActiveTab("collections")}>📁 Colecciones ({collections.length})</s-button>
        <s-button variant={activeTab === "pages" ? "primary" : "secondary"} onClick={() => setActiveTab("pages")}>📄 Páginas ({pages.length})</s-button>
        <s-button variant={activeTab === "blogs" ? "primary" : "secondary"} onClick={() => setActiveTab("blogs")}>✍️ Blogs y Artículos ({articles.length})</s-button>
        <s-button variant={activeTab === "images" ? "primary" : "secondary"} onClick={() => setActiveTab("images")}>🖼️ Optimizador Masivo ALT</s-button>
        <s-button variant={activeTab === "guide" ? "primary" : "secondary"} onClick={() => setActiveTab("guide")}>📚 Guía y Ayuda SEO</s-button>
      </div>

      {activeTab === "products" && (
        <s-card style={{ padding: "0px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f7f7f8", borderBottom: "1px solid #e1e3e5" }}>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Producto</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Puntaje</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Estado</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Diagnóstico</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Sitemap / Index</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#6d7175" }}>No se encontraron productos.</td></tr>
              ) : (
                products.map((prod: any) => (
                  <tr key={prod.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <img src={prod.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"} alt={prod.title} style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e1e3e5" }} />
                        <div>
                          <div style={{ fontWeight: "600", fontSize: "14px" }}>{prod.title}</div>
                          <div style={{ fontSize: "12px", color: "#6d7175" }}>/products/{prod.handle}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", color: getScoreColor(prod.score), backgroundColor: "#f6f6f7" }}>{prod.score} / 100</span></td>
                    <td style={{ padding: "12px 16px" }}>{renderProductStatus(prod.status)}</td>
                    <td style={{ padding: "12px 16px" }}>{prod.issues.length === 0 ? <span style={{ color: "#108043", fontSize: "13px" }}>✓ Optimizado</span> : prod.issues.map((issue: string, idx: number) => <div key={idx} style={{ color: "#d82c0d", fontSize: "12px" }}>• {issue}</div>)}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", backgroundColor: prod.isHidden ? "#fef3d6" : "#e3f1df", color: prod.isHidden ? "#8a6100" : "#108043" }}>{prod.isHidden ? "Oculto (noindex)" : "En Sitemap"}</span></td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <s-button variant="secondary" onClick={() => handleOpenEditor(prod, "product")}>✏️ Editar SEO</s-button>
                        <s-button variant={prod.isHidden ? "primary" : "secondary"} tone={prod.isHidden ? "success" : "critical"} disabled={isSubmitting} onClick={() => handleToggleSitemap(prod.id, prod.isHidden)}>{prod.isHidden ? "Incluir" : "Excluir"}</s-button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </s-card>
      )}

      {activeTab === "collections" && (
        <s-card style={{ padding: "0px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f7f7f8", borderBottom: "1px solid #e1e3e5" }}>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Colección</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Puntaje</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Diagnóstico</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Sitemap / Index</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#6d7175" }}>No se encontraron colecciones.</td></tr>
              ) : (
                collections.map((col: any) => (
                  <tr key={col.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                    <td style={{ padding: "12px 16px" }}><div style={{ fontWeight: "600", fontSize: "14px" }}>{col.title}</div><div style={{ fontSize: "12px", color: "#6d7175" }}>/collections/{col.handle}</div></td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", color: getScoreColor(col.score), backgroundColor: "#f6f6f7" }}>{col.score} / 100</span></td>
                    <td style={{ padding: "12px 16px" }}>{col.issues.length === 0 ? <span style={{ color: "#108043", fontSize: "13px" }}>✓ Optimizado</span> : col.issues.map((issue: string, idx: number) => <div key={idx} style={{ color: "#d82c0d", fontSize: "12px" }}>• {issue}</div>)}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", backgroundColor: col.isHidden ? "#fef3d6" : "#e3f1df", color: col.isHidden ? "#8a6100" : "#108043" }}>{col.isHidden ? "Oculto (noindex)" : "En Sitemap"}</span></td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <s-button variant="secondary" onClick={() => handleOpenEditor(col, "collection")}>✏️ Editar SEO</s-button>
                        <s-button variant={col.isHidden ? "primary" : "secondary"} tone={col.isHidden ? "success" : "critical"} disabled={isSubmitting} onClick={() => handleToggleSitemap(col.id, col.isHidden)}>{col.isHidden ? "Incluir" : "Excluir"}</s-button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </s-card>
      )}

      {activeTab === "pages" && (
        <s-card style={{ padding: "0px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f7f7f8", borderBottom: "1px solid #e1e3e5" }}>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Página</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Puntaje</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Diagnóstico</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Sitemap / Index</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pages.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#6d7175" }}>No se encontraron páginas.</td></tr>
              ) : (
                pages.map((pg: any) => (
                  <tr key={pg.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                    <td style={{ padding: "12px 16px" }}><div style={{ fontWeight: "600", fontSize: "14px" }}>{pg.title}</div><div style={{ fontSize: "12px", color: "#6d7175" }}>/pages/{pg.handle}</div></td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", color: getScoreColor(pg.score), backgroundColor: "#f6f6f7" }}>{pg.score} / 100</span></td>
                    <td style={{ padding: "12px 16px" }}>{pg.issues.length === 0 ? <span style={{ color: "#108043", fontSize: "13px" }}>✓ Optimizado</span> : pg.issues.map((issue: string, idx: number) => <div key={idx} style={{ color: "#d82c0d", fontSize: "12px" }}>• {issue}</div>)}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", backgroundColor: pg.isHidden ? "#fef3d6" : "#e3f1df", color: pg.isHidden ? "#8a6100" : "#108043" }}>{pg.isHidden ? "Oculto (noindex)" : "En Sitemap"}</span></td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <s-button variant="secondary" onClick={() => handleOpenEditor(pg, "page")}>✏️ Editar SEO</s-button>
                        <s-button variant={pg.isHidden ? "primary" : "secondary"} tone={pg.isHidden ? "success" : "critical"} disabled={isSubmitting} onClick={() => handleToggleSitemap(pg.id, pg.isHidden)}>{pg.isHidden ? "Incluir" : "Excluir"}</s-button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </s-card>
      )}

      {activeTab === "blogs" && (
        <s-card style={{ padding: "0px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f7f7f8", borderBottom: "1px solid #e1e3e5" }}>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Artículo de Blog</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Blog Asociado</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Puntaje</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Diagnóstico</th>
                <th style={{ padding: "12px 16px", textAlign: "left" }}>Sitemap / Index</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {articles.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#6d7175" }}>No se encontraron artículos de blog.</td></tr>
              ) : (
                articles.map((art: any) => (
                  <tr key={art.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {art.imageUrl ? <img src={art.imageUrl} alt={art.title} style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e1e3e5" }} /> : <div style={{ width: "44px", height: "44px", backgroundColor: "#f1f2f3", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>✍️</div>}
                        <div><div style={{ fontWeight: "600", fontSize: "14px" }}>{art.title}</div><div style={{ fontSize: "12px", color: "#6d7175" }}>/blogs/{art.blogHandle}/{art.handle}</div></div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "12px", backgroundColor: "#eef3fc", color: "#2c6ecb", fontWeight: "600" }}>{art.blogTitle}</span></td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", color: getScoreColor(art.score), backgroundColor: "#f6f6f7" }}>{art.score} / 100</span></td>
                    <td style={{ padding: "12px 16px" }}>{art.issues.length === 0 ? <span style={{ color: "#108043", fontSize: "13px" }}>✓ Optimizado</span> : art.issues.map((issue: string, idx: number) => <div key={idx} style={{ color: "#d82c0d", fontSize: "12px" }}>• {issue}</div>)}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", backgroundColor: art.isHidden ? "#fef3d6" : "#e3f1df", color: art.isHidden ? "#8a6100" : "#108043" }}>{art.isHidden ? "Oculto (noindex)" : "En Sitemap"}</span></td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <s-button variant="secondary" onClick={() => handleOpenEditor(art, "article", art.blogHandle)}>✏️ Editar SEO</s-button>
                        <s-button variant={art.isHidden ? "primary" : "secondary"} tone={art.isHidden ? "success" : "critical"} disabled={isSubmitting} onClick={() => handleToggleSitemap(art.id, art.isHidden)}>{art.isHidden ? "Incluir" : "Excluir"}</s-button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </s-card>
      )}

      {activeTab === "images" && (
        <s-card style={{ padding: "20px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", marginTop: 0 }}>Optimizador Masivo de Etiquetas ALT</h2>
          <p style={{ color: "#6d7175", fontSize: "14px" }}>Asigna automáticamente textos alternativos a todas las imágenes que actualmente no tienen etiqueta ALT.</p>
          <div style={{ margin: "20px 0" }}>
            <label style={{ display: "block", fontWeight: "600", fontSize: "14px", marginBottom: "6px" }}>Plantilla de Texto Alternativo (ALT):</label>
            <input type="text" value={altTemplate} onChange={(e) => setAltTemplate(e.target.value)} style={{ width: "100%", maxWidth: "500px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #c9cccf" }} />
          </div>
          <div style={{ padding: "12px", backgroundColor: "#f6f6f7", borderRadius: "6px", marginBottom: "20px", maxWidth: "500px" }}>
            <span style={{ fontWeight: "600", fontSize: "13px" }}>Vista previa: </span><span style={{ fontSize: "13px" }}>{altTemplate.replace("{{title}}", "Camiseta").replace("{{shop}}", shop.name)}</span>
          </div>
          <s-button variant="primary" disabled={isSubmitting} onClick={handleBulkAltUpdate}>🚀 Aplicar ALT masivamente</s-button>
        </s-card>
      )}

      {activeTab === "guide" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ backgroundColor: "#f0f7f5", border: "1px solid #b7ece0", borderRadius: "12px", padding: "20px", display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <span style={{ fontSize: "28px", lineHeight: "1" }}>💡</span>
            <div>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: "600", color: "#005e46" }}>Regla de Oro del SEO</h3>
              <p style={{ margin: 0, color: "#2c5448", fontSize: "13px", lineHeight: "1.5" }}>Evita títulos genéricos. Utiliza siempre: <strong>[Producto] + [Material] + [Beneficio o Marca]</strong>.</p>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", width: "100%", maxWidth: "720px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "600" }}>Editar SEO: {editingItem.title}</h2>
              <button onClick={() => setEditingItem(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}>✕</button>
            </div>
            
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontWeight: "600", fontSize: "13px" }}>Título SEO</label>
                <span style={{ fontSize: "12px", color: editingItem.seoTitle.length >= 50 && editingItem.seoTitle.length <= 60 ? "#108043" : "#8a6100" }}>{editingItem.seoTitle.length} / 60</span>
              </div>
              <input type="text" value={editingItem.seoTitle} onChange={(e) => setEditingItem({ ...editingItem, seoTitle: e.target.value })} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #c9cccf" }} />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontWeight: "600", fontSize: "13px" }}>Meta Descripción</label>
                <span style={{ fontSize: "12px", color: editingItem.seoDesc.length >= 120 && editingItem.seoDesc.length <= 155 ? "#108043" : "#8a6100" }}>{editingItem.seoDesc.length} / 155</span>
              </div>
              <textarea rows={3} value={editingItem.seoDesc} onChange={(e) => setEditingItem({ ...editingItem, seoDesc: e.target.value })} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #c9cccf" }} />
            </div>

            <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px", backgroundColor: "#ffffff", marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontWeight: "600", fontSize: "13px", color: "#303030" }}>Vista Previa en Google:</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button type="button" onClick={() => setPreviewDevice("desktop")} style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #e1e3e5", backgroundColor: previewDevice === "desktop" ? "#202223" : "#ffffff", color: previewDevice === "desktop" ? "#ffffff" : "#202223", fontSize: "12px", cursor: "pointer" }}>🖥️ Escritorio</button>
                  <button type="button" onClick={() => setPreviewDevice("mobile")} style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #e1e3e5", backgroundColor: previewDevice === "mobile" ? "#202223" : "#ffffff", color: previewDevice === "mobile" ? "#ffffff" : "#202223", fontSize: "12px", cursor: "pointer" }}>📱 Móvil</button>
                </div>
              </div>
              <div style={{ maxWidth: previewDevice === "mobile" ? "360px" : "600px", fontFamily: "Arial, sans-serif" }}>
                <div style={{ fontSize: "12px", color: "#202124" }}>{getGoogleSnippetUrl()}</div>
                <div style={{ color: "#1a0dab", fontSize: "18px", lineHeight: "1.3", cursor: "pointer", marginTop: "4px", textDecoration: "underline" }}>{editingItem.seoTitle || editingItem.title}</div>
                <div style={{ color: "#4d5156", fontSize: "14px", lineHeight: "1.4", marginTop: "4px" }}>{editingItem.seoDesc || "Agrega una meta descripción para ver cómo aparecerá este resultado..."}</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <s-button variant="secondary" onClick={() => setEditingItem(null)}>Cancelar</s-button>
              <s-button variant="primary" disabled={isSubmitting} onClick={handleSaveMetadata}>💾 Guardar en Shopify</s-button>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}