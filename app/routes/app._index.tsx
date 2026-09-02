import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";

// ==========================================
// 1. CARGA DE DATOS (LOADER) - Leer de Shopify
// ==========================================
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  let shop = { name: "Mi Tienda", myshopifyDomain: "" };
  let products: any[] = [];
  let collections: any[] = [];
  let pages: any[] = [];
  let articles: any[] = [];
  let imagesWithoutAlt: any[] = []; 
  let apiErrors: string[] = []; 
  
  try {
    const mainResponse = await admin.graphql(
      `
        query getBasicSEOAuditData {
          shop { name myshopifyDomain }
          products(first: 50) {
            edges { node { id title handle status description seo { title description } featuredImage { id url altText } media(first: 10) { nodes { ... on MediaImage { id image { url altText } } } } metafield(namespace: "seo", key: "hidden") { id value } canonicalUrl: metafield(namespace: "seo", key: "canonical_url") { id value } } }
          }
          collections(first: 50) {
            edges { node { id title handle description seo { title description } metafield(namespace: "seo", key: "hidden") { id value } canonicalUrl: metafield(namespace: "seo", key: "canonical_url") { id value } } }
          }
        }
      `
    );
    const mainJson = await mainResponse.json();
    
    if (mainJson.errors) apiErrors.push("Error en Productos: " + mainJson.errors.map((e: any) => e.message).join(", "));
    
    if (mainJson.data?.shop) shop = mainJson.data.shop;
    
    if (mainJson.data?.products?.edges) {
      products = mainJson.data.products.edges.map((e: any) => {
        const node = e.node;
        const mediaNodes = node.media?.nodes || [];
        const hasAlt = mediaNodes.some((m: any) => m.image?.altText && m.image.altText.trim() !== "");
        
        mediaNodes.forEach((m: any) => {
          if (m.image && (!m.image.altText || m.image.altText.trim() === "")) {
            imagesWithoutAlt.push({
              mediaId: m.id,
              url: m.image.url,
              productId: node.id,
              productTitle: node.title,
              productHandle: node.handle
            });
          }
        });

        const seoTitle = node.seo?.title || node.title;
        const seoDesc = node.seo?.description || (node.description ? node.description.slice(0, 160) : "");
        const isHidden = node.metafield?.value === "1";
        
        let score = 100;
        let issues = [];
        if (seoTitle.length < 30 || seoTitle.length > 60) { score -= 30; issues.push(seoTitle.length < 30 ? "Título corto (<30)" : "Título largo (>60)"); }
        if (!seoDesc || seoDesc.length < 70 || seoDesc.length > 160) { score -= 40; issues.push(!seoDesc ? "Sin meta descripción" : "Meta descripción fuera de rango"); }
        if (!hasAlt) { score -= 20; issues.push("Imágenes sin texto ALT"); }
        if (score < 0) score = 0;
        
        const defaultCanonical = `https://${shop.myshopifyDomain}/products/${node.handle}`;
        const customCanonical = node.canonicalUrl?.value || "";

        return { id: node.id, numericId: node.id.split("/").pop(), title: node.title, handle: node.handle, status: node.status, imageUrl: node.featuredImage?.url || null, imageAlt: node.featuredImage?.altText || "", hasAlt, seoTitle, seoDesc, isHidden, score, issues, defaultCanonical, customCanonical };
      });
    }

    if (mainJson.data?.collections?.edges) {
      collections = mainJson.data.collections.edges.map((e: any) => {
        const node = e.node;
        const seoTitle = node.seo?.title || node.title;
        const seoDesc = node.seo?.description || (node.description ? node.description.slice(0, 160) : "");
        const isHidden = node.metafield?.value === "1";
        
        let score = 100;
        let issues = [];
        if (seoTitle.length < 30 || seoTitle.length > 60) { score -= 30; issues.push(seoTitle.length < 30 ? "Título corto (<30)" : "Título largo (>60)"); }
        if (!seoDesc || seoDesc.length < 70 || seoDesc.length > 160) { score -= 40; issues.push(!seoDesc ? "Sin meta descripción" : "Meta descripción fuera de rango"); }
        if (score < 0) score = 0;
        
        const defaultCanonical = `https://${shop.myshopifyDomain}/collections/${node.handle}`;
        const customCanonical = node.canonicalUrl?.value || "";

        return { id: node.id, numericId: node.id.split("/").pop(), title: node.title, handle: node.handle, seoTitle, seoDesc, isHidden, score, issues, defaultCanonical, customCanonical };
      });
    }
  } catch (err: any) { apiErrors.push("Conexión Productos: " + (err.message || String(err))); }

  try {
    const pagesResponse = await admin.graphql(
      ` query getPagesSEO { pages(first: 50) { edges { node { id title handle bodySummary seoTitleTag: metafield(namespace: "global", key: "title_tag") { value } seoDescTag: metafield(namespace: "global", key: "description_tag") { value } metafield(namespace: "seo", key: "hidden") { id value } canonicalUrl: metafield(namespace: "seo", key: "canonical_url") { id value } } } } }`
    );
    const pagesJson = await pagesResponse.json();
    
    if (pagesJson.errors) apiErrors.push("Error Permisos de Páginas: " + pagesJson.errors.map((e: any) => e.message).join(", "));
    
    if (pagesJson.data?.pages?.edges) {
      pages = pagesJson.data.pages.edges.map((e: any) => {
        const node = e.node;
        const seoTitle = node.seoTitleTag?.value || node.title || "";
        const seoDesc = node.seoDescTag?.value || (node.bodySummary ? node.bodySummary.slice(0, 160) : "");
        const isHidden = node.metafield?.value === "1";
        let score = 100;
        let issues = [];
        if (seoTitle.length < 30 || seoTitle.length > 60) { score -= 30; issues.push(seoTitle.length < 30 ? "Título corto (<30)" : "Título largo (>60)"); }
        if (!seoDesc || seoDesc.length < 70 || seoDesc.length > 160) { score -= 40; issues.push(!seoDesc ? "Sin meta descripción" : "Meta descripción fuera de rango"); }
        if (score < 0) score = 0;
        
        const defaultCanonical = `https://${shop.myshopifyDomain}/pages/${node.handle}`;
        const customCanonical = node.canonicalUrl?.value || "";

        return { id: node.id, numericId: node.id.split("/").pop(), title: node.title, handle: node.handle, seoTitle, seoDesc, isHidden, score, issues, defaultCanonical, customCanonical };
      });
    }
  } catch (err: any) { apiErrors.push("Conexión Páginas: " + (err.message || String(err))); }

  try {
    const blogsResponse = await admin.graphql(
      ` query getBlogsSEO { blogs(first: 10) { edges { node { id title handle articles(first: 50) { edges { node { id title handle summary author { name } image { url altText } seoTitleTag: metafield(namespace: "global", key: "title_tag") { value } seoDescTag: metafield(namespace: "global", key: "description_tag") { value } metafield(namespace: "seo", key: "hidden") { id value } canonicalUrl: metafield(namespace: "seo", key: "canonical_url") { id value } } } } } } } }`
    );
    const blogsJson = await blogsResponse.json();
    
    if (blogsJson.errors) apiErrors.push("Error Permisos de Blog: " + blogsJson.errors.map((e: any) => e.message).join(", "));
    
    if (blogsJson.data?.blogs?.edges) {
      blogsJson.data.blogs.edges.forEach((blogEdge: any) => {
        const blogNode = blogEdge.node;
        const rawArticles = blogNode.articles?.edges.map((e: any) => e.node) || [];
        rawArticles.forEach((artNode: any) => {
          const seoTitle = artNode.seoTitleTag?.value || artNode.title || "";
          const seoDesc = artNode.seoDescTag?.value || (artNode.summary ? artNode.summary.slice(0, 160) : "");
          const isHidden = artNode.metafield?.value === "1";
          const hasAlt = artNode.image?.altText && artNode.image.altText.trim() !== "";
          
          let score = 100;
          let issues = [];
          if (seoTitle.length < 30 || seoTitle.length > 60) { score -= 30; issues.push(seoTitle.length < 30 ? "Título corto (<30)" : "Título largo (>60)"); }
          if (!seoDesc || seoDesc.length < 70 || seoDesc.length > 160) { score -= 40; issues.push(!seoDesc ? "Sin meta descripción" : "Meta descripción fuera de rango"); }
          if (artNode.image && !hasAlt) { score -= 20; issues.push("Imagen destacada sin texto ALT"); }
          if (score < 0) score = 0;

          const defaultCanonical = `https://${shop.myshopifyDomain}/blogs/${blogNode.handle}/${artNode.handle}`;
          const customCanonical = artNode.canonicalUrl?.value || "";

          articles.push({ id: artNode.id, numericId: artNode.id.split("/").pop(), title: artNode.title, handle: artNode.handle, blogTitle: blogNode.title, blogHandle: blogNode.handle, authorName: artNode.author?.name || "Autor", imageUrl: artNode.image?.url || null, imageAlt: artNode.image?.altText || "", seoTitle, seoDesc, isHidden, score, issues, defaultCanonical, customCanonical });
        });
      });
    }
  } catch (err: any) { apiErrors.push("Conexión Blog: " + (err.message || String(err))); }

  const allScores = [
    ...products.filter((p) => !p.isHidden).map((p) => p.score),
    ...collections.filter((c) => !c.isHidden).map((c) => c.score),
    ...pages.filter((pg) => !pg.isHidden).map((pg) => pg.score),
    ...articles.filter((a) => !a.isHidden).map((a) => a.score)
  ];
  const totalScore = allScores.length > 0 ? Math.round(allScores.reduce((acc, curr) => acc + curr, 0) / allScores.length) : 100;

  return { shop, products, collections, pages, articles, totalScore, apiErrors, imagesWithoutAlt };
};

// ==========================================
// 2. ACCIONES (ACTION) - Escribir en Shopify
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
        const response = await admin.graphql(
          ` mutation updateProductSEO($input: ProductInput!) { productUpdate(input: $input) { userErrors { field message } } }`,
          { variables: { input: { id: resourceId, seo: { title: seoTitle, description: seoDesc } } } }
        );
        await response.json(); 
      } else if (resourceType === "collection") {
        const response = await admin.graphql(
          ` mutation updateCollectionSEO($input: CollectionInput!) { collectionUpdate(input: $input) { userErrors { field message } } }`,
          { variables: { input: { id: resourceId, seo: { title: seoTitle, description: seoDesc } } } }
        );
        await response.json(); 
      } else if (resourceType === "page" || resourceType === "article") {
        const response = await admin.graphql(
          ` mutation updateContentSEO($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`,
          { variables: { metafields: [
            { ownerId: resourceId, namespace: "global", key: "title_tag", value: seoTitle, type: "single_line_text_field" },
            { ownerId: resourceId, namespace: "global", key: "description_tag", value: seoDesc, type: "single_line_text_field" }
          ] } }
        );
        await response.json(); 
      }
      return Response.json({ success: true, message: "Metadatos SEO guardados correctamente en Shopify." });
    }

    if (intent === "toggle_sitemap") {
      const resourceId = formData.get("resourceId") as string;
      const hideAction = formData.get("hideAction") as string;
      const value = hideAction === "hide" ? "1" : "0";

      const response = await admin.graphql(
        ` mutation setSEOHiddenMetafield($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`,
        { variables: { metafields: [{ ownerId: resourceId, namespace: "seo", key: "hidden", value: value, type: "number_integer" }] } }
      );
      await response.json(); 

      return Response.json({ success: true, message: hideAction === "hide" ? "Recurso excluido del Sitemap e indexación (noindex)." : "Recurso incluido en el Sitemap." });
    }

    if (intent === "save_canonical_url") {
      const resourceId = formData.get("resourceId") as string;
      const canonicalUrl = formData.get("canonicalUrl") as string;
      
      const response = await admin.graphql(
        ` mutation setCanonicalMetafield($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`,
        { variables: { metafields: [{ ownerId: resourceId, namespace: "seo", key: "canonical_url", value: canonicalUrl, type: "single_line_text_field" }] } }
      );
      await response.json();

      return Response.json({ success: true, message: "Canonical actualizado correctamente." });
    }

    if (intent === "update_single_alt_text") {
      const productId = formData.get("productId") as string;
      const mediaId = formData.get("mediaId") as string;
      const altText = formData.get("altText") as string;

      try {
        const response = await admin.graphql(
          `mutation updateMediaAlt($media: [UpdateMediaInput!]!, $productId: ID!) { productUpdateMedia(media: $media, productId: $productId) { mediaUserErrors { field message } } }`,
          { variables: { productId, media: [{ id: mediaId, alt: altText }] } }
        );
        
        const result = await response.json(); 
        
        if (result.data?.productUpdateMedia?.mediaUserErrors?.length > 0) {
          return Response.json({ error: result.data.productUpdateMedia.mediaUserErrors[0].message });
        }
        
        return Response.json({ success: true, message: "Alt guardado exitosamente." });
      } catch (e: any) {
        return Response.json({ error: "Error de red al guardar el texto alternativo." });
      }
    }

    return Response.json({ error: "Intención no válida." });
  } catch (error: any) {
    console.error("Error en Action:", error);
    return Response.json({ error: error.message || "Error al procesar la acción en Shopify." });
  }
};

// ==========================================
// 3. DICCIONARIOS DE TRADUCCIÓN
// ==========================================
const dict = {
  es: {
    greeting: "Hola,",
    summary: "Aquí tienes un resumen del estado de optimización para buscadores (SEO) de tu tienda. Corrige los problemas marcados en rojo para mejorar tu posicionamiento en Google.",
    globalHealth: "Salud SEO Global",
    permErrorTitle: "⚠️ Error de Permisos en Shopify",
    permErrorDesc: "Shopify ha bloqueado el acceso a la lectura de ciertos datos (por ejemplo, Páginas o Blogs). Para solucionarlo:",
    permError1: "Abre tu archivo shopify.app.toml",
    permError2: "Asegúrate de tener estos scopes:",
    permError3: "Detén la terminal del servidor y vuelve a correr npm run dev",
    permErrorDetails: "Ver detalles técnicos del error",
    tabs: { products: "📦 Productos", collections: "📂 Colecciones", pages: "📄 Páginas", blogs: "📝 Blog", images: "🖼️ Imágenes (ALT)", guide: "📚 Guía SEO" },
    tables: { product: "Producto", collection: "Colección", page: "Página", article: "Artículo", blog: "Blog", imageProduct: "Imagen y Producto", altText: "Texto Alternativo (ALT)", score: "Puntuación", issues: "Problemas Detectados", indexing: "Indexación", canonical: "URL Canonical", actions: "Acciones" },
    empty: { products: "No hay productos disponibles.", collections: "No hay colecciones disponibles.", pages: "No hay páginas disponibles.", articles: "No hay artículos disponibles.", images: "¡Genial! Todas tus imágenes ya tienen textos alternativos." },
    misc: { noImg: "Sin img", by: "Por", viewOriginal: "Ver producto original ↗", altPlaceholder: "Ej: Zapatillas deportivas rojas talla 42...", saving: "Guardando...", saveAlt: "💾 Guardar ALT", active: "● Activo", draft: "○ Borrador", archived: "📦 Archivado", optimized: "✓ Optimizado", hidden: "Oculto (noindex)", inSitemap: "En Sitemap", editSeo: "✏️ Editar SEO", include: "Incluir", exclude: "Excluir", lang: "🌐 Idioma:", na: "N/A", customizeCanonical: "Personalizar canonical", defaultCanonical: "Por defecto", customCanonical: "Personalizada" },
    guide: { 
      goldenTitle: "Regla de Oro del SEO", goldenDesc: "Evita títulos genéricos. Utiliza siempre: [Producto] + [Material] + [Beneficio o Marca].", 
      howTo: "📖 Cómo utilizar esta aplicación", 
      scoreTitle: "🎯 Puntuación SEO (0 a 100)", scoreDesc: "La aplicación analiza automáticamente tus títulos y descripciones SEO. Penaliza títulos que sean muy cortos (<30 caracteres) o demasiado largos (>60 caracteres), así como las descripciones muy breves (<70) o muy largas (>160). Además, reduce la puntuación si detecta imágenes que carecen de un texto alternativo (ALT).", 
      editTitle: "✏️ Edición Rápida con Vista Previa", editDesc: "Al presionar el botón \"Editar SEO\", se abrirá un panel donde puedes modificar el Título y la Meta Descripción de cualquier producto, colección, página o artículo de blog. Mientras escribes, verás una simulación en tiempo real de cómo aparecería tu resultado en las búsquedas de Google, tanto en la versión móvil como en la versión de escritorio.", 
      indexTitle: "👁️ Control de Indexación (Ocultar del Sitemap)", indexDesc: "Si tienes productos o páginas que no quieres que aparezcan en Google (por ejemplo, páginas de agradecimiento o productos exclusivos), puedes utilizar el botón \"Excluir\". Esto agrega una regla (metafield seo.hidden) que le indica a Shopify que elimine ese recurso de tu archivo sitemap.xml y agregue la etiqueta noindex para que los buscadores lo ignoren.", 
      imgTitle: "🖼️ Optimización de Imágenes (ALT)", imgDesc: "En la pestaña \"Imágenes (ALT)\", la app filtra y te muestra únicamente las fotografías de tus productos que actualmente no tienen ningún texto alternativo. Podrás ver una pequeña miniatura de la imagen y escribir rápidamente su descripción. Al guardarlo, la imagen desaparecerá de la lista, ayudándote a mejorar tu posicionamiento en Google Imágenes.", 
      canonicalTitle: "🔗 ¿Cómo activar las URLs Canonical personalizadas?", canonicalDesc: "Shopify no actualiza automáticamente la etiqueta canonical en el código fuente de tu tienda solo por usar la App. Para que funcione y Google lo detecte, debes ir a <b>Tienda Online > Temas > Editar código</b>, abrir el archivo <code>theme.liquid</code> y reemplazar la etiqueta original <code>&lt;link rel=\"canonical\" href=\"{{ canonical_url }}\"&gt;</code> por el siguiente código seguro:",
      canonicalCode: "{% assign custom_canonical = product.metafields.seo.canonical_url | default: collection.metafields.seo.canonical_url | default: page.metafields.seo.canonical_url | default: article.metafields.seo.canonical_url %}\n{% if custom_canonical and custom_canonical != blank %}\n  <link rel=\"canonical\" href=\"{{ custom_canonical }}\">\n{% else %}\n  <link rel=\"canonical\" href=\"{{ canonical_url }}\">\n{% endif %}",
      uninstallTitle: "🗑️ ¿Qué sucede si desinstalo la aplicación?", uninstallDesc: "Esta aplicación no inyecta ningún código fantasma ni scripts en el frontend (Theme) de tu tienda, por lo que no ralentiza tu sitio web en absoluto. Si decides desinstalarla, tu tienda quedará 100% limpia sin residuos. Además, todos los cambios que hayas realizado (títulos SEO, descripciones, textos ALT, canonicals) se mantendrán intactos de forma permanente, ya que se guardan directamente de forma nativa en tu base de datos de Shopify.<br><br><b>¿Cómo revertir el código Canonical personalizado?</b> Si desinstalas la app y deseas volver al comportamiento por defecto de Shopify, ve a <b>Tienda Online > Temas > Editar código</b>, abre el archivo <code>theme.liquid</code>, borra el bloque de código que añadiste y vuelve a colocar la etiqueta original: <code>&lt;link rel=\"canonical\" href=\"{{ canonical_url }}\"&gt;</code>.",
      contactTitle: "✉️ Contacto y Soporte", contact1: "Esta aplicación fue creada por Alejandro Eguía, trabajando en SEO desde 2006. Experto de Producto de Google desde 2013 en foro para Webmasters (", contactLink: "Ver credencial oficial", contact2: ").", contact3: "Si necesitas ayuda con la App o deseas agregar alguna funcionalidad, no dudes en contactarme:" 
    },
    modal: { editSeo: "Editar SEO:", seoTitle: "Título SEO", metaDesc: "Meta Descripción", preview: "Vista Previa en Google:", desktop: "🖥️ Escritorio", mobile: "📱 Móvil", addDesc: "Agrega una meta descripción para ver cómo aparecerá este resultado...", cancel: "Cancelar", save: "💾 Guardar en Shopify" },
    modalCanonical: { title: "Personalizar URL Canonical para:", defaultLabel: "URL Original (Por defecto):", customLabel: "Nueva URL Canonical (opcional):", placeholder: "https://tu-tienda.com/nueva-url", emptyNote: "Si dejas este campo vacío, Shopify usará la URL original por defecto.", cancel: "Cancelar", save: "💾 Guardar Canonical", alreadyInstalledNote: "⚠️ Solo debes hacer esto <b>UNA VEZ</b> por tienda. Si ya lo hiciste, marca la casilla de abajo.", markAsInstalled: "Ya he añadido este código a mi Theme", successMsg: "✅ Has indicado que el código Canonical ya está instalado en tu Theme. ¡Todo está funcionando bien!", showInstructions: "Ver instrucciones de instalación", finalStep: "⚠️ Paso Final: Añade este código a tu Theme", finalStepDesc: "Shopify requiere que reemplaces la etiqueta <code>&lt;link rel=\"canonical\"&gt;</code> original en el archivo <code>theme.liquid</code> (Tienda Online > Temas > Editar código) por este fragmento exacto para que funcione:" },
    feedback: {
      "Metadatos SEO guardados correctamente en Shopify.": "Metadatos SEO guardados correctamente en Shopify.",
      "Recurso excluido del Sitemap e indexación (noindex).": "Recurso excluido del Sitemap e indexación (noindex).",
      "Recurso incluido en el Sitemap.": "Recurso incluido en el Sitemap.",
      "Alt guardado exitosamente.": "Alt guardado exitosamente.",
      "Canonical actualizado correctamente.": "Canonical actualizado correctamente.",
      "Error de red al guardar el texto alternativo.": "Error de red al guardar el texto alternativo.",
      "Intención no válida.": "Intención no válida."
    },
    backendIssues: {
      "Título corto (<30)": "Título corto (<30)",
      "Título largo (>60)": "Título largo (>60)",
      "Sin meta descripción": "Sin meta descripción",
      "Meta descripción fuera de rango": "Meta descripción fuera de rango",
      "Imágenes sin texto ALT": "Imágenes sin texto ALT",
      "Imagen destacada sin texto ALT": "Imagen destacada sin texto ALT"
    }
  },
  en: {
    greeting: "Hello,",
    summary: "Here is a summary of your store's Search Engine Optimization (SEO) status. Fix the issues marked in red to improve your Google ranking.",
    globalHealth: "Global SEO Health",
    permErrorTitle: "⚠️ Shopify Permissions Error",
    permErrorDesc: "Shopify has blocked read access to certain data (e.g., Pages or Blogs). To fix this:",
    permError1: "Open your shopify.app.toml file",
    permError2: "Make sure you have these scopes:",
    permError3: "Stop the server terminal and run npm run dev again",
    permErrorDetails: "View technical error details",
    tabs: { products: "📦 Products", collections: "📂 Collections", pages: "📄 Pages", blogs: "📝 Blog", images: "🖼️ Images (ALT)", guide: "📚 SEO Guide" },
    tables: { product: "Product", collection: "Collection", page: "Page", article: "Article", blog: "Blog", imageProduct: "Image and Product", altText: "Alternative Text (ALT)", score: "Score", issues: "Detected Issues", indexing: "Indexing", canonical: "Canonical URL", actions: "Actions" },
    empty: { products: "No products available.", collections: "No collections available.", pages: "No pages available.", articles: "No articles available.", images: "Great! All your images already have alternative texts." },
    misc: { noImg: "No img", by: "By", viewOriginal: "View original product ↗", altPlaceholder: "E.g: Red sports shoes size 42...", saving: "Saving...", saveAlt: "💾 Save ALT", active: "● Active", draft: "○ Draft", archived: "📦 Archived", optimized: "✓ Optimized", hidden: "Hidden (noindex)", inSitemap: "In Sitemap", editSeo: "✏️ Edit SEO", include: "Include", exclude: "Exclude", lang: "🌐 Language:", na: "N/A", customizeCanonical: "Customize canonical", defaultCanonical: "Default", customCanonical: "Customized" },
    guide: { 
      goldenTitle: "Golden Rule of SEO", goldenDesc: "Avoid generic titles. Always use: [Product] + [Material] + [Benefit or Brand].", 
      howTo: "📖 How to use this application", 
      scoreTitle: "🎯 SEO Score (0 to 100)", scoreDesc: "The application automatically analyzes your SEO titles and descriptions. It penalizes titles that are too short (<30 characters) or too long (>60 characters), as well as descriptions that are very short (<70) or very long (>160). In addition, it reduces the score if it detects images lacking alternative text (ALT).", 
      editTitle: "✏️ Quick Editing with Preview", editDesc: "By pressing the \"Edit SEO\" button, a panel will open where you can modify the Title and Meta Description of any product, collection, page, or blog article. As you type, you will see a real-time simulation of how your result would appear in Google searches, on both mobile and desktop versions.", 
      indexTitle: "👁️ Indexing Control (Hide from Sitemap)", indexDesc: "If you have products or pages that you do not want to appear on Google (e.g., thank you pages or exclusive products), you can use the \"Exclude\" button. This adds a rule (seo.hidden metafield) that tells Shopify to remove that resource from your sitemap.xml file and adds the noindex tag so search engines ignore it.", 
      imgTitle: "🖼️ Image Optimization (ALT)", imgDesc: "In the \"Images (ALT)\" tab, the app filters and shows you only the product photos that currently have no alternative text. You can see a small thumbnail of the image and quickly write its description. Upon saving, the image will disappear from the list, helping you improve your ranking in Google Images.", 
      canonicalTitle: "🔗 How to enable custom Canonical URLs?", canonicalDesc: "Shopify does not automatically update the canonical tag in your store's source code just by using the App. For it to work and for Google to detect it, you must go to <b>Online Store > Themes > Edit code</b>, open the <code>theme.liquid</code> file and replace the original <code>&lt;link rel=\"canonical\" href=\"{{ canonical_url }}\"&gt;</code> tag with the following safe code:",
      canonicalCode: "{% assign custom_canonical = product.metafields.seo.canonical_url | default: collection.metafields.seo.canonical_url | default: page.metafields.seo.canonical_url | default: article.metafields.seo.canonical_url %}\n{% if custom_canonical and custom_canonical != blank %}\n  <link rel=\"canonical\" href=\"{{ custom_canonical }}\">\n{% else %}\n  <link rel=\"canonical\" href=\"{{ canonical_url }}\">\n{% endif %}",
      uninstallTitle: "🗑️ What happens if I uninstall the app?", uninstallDesc: "This app does not inject any ghost code or scripts into your store's frontend (Theme), so it does not slow down your website at all. If you decide to uninstall it, your store will remain 100% clean with no residue. Furthermore, all the changes you have made (SEO titles, descriptions, ALT texts, canonicals) will remain intact permanently, as they are saved natively directly in your Shopify database.<br><br><b>How to revert the custom Canonical code?</b> If you uninstall the app and wish to return to Shopify's default behavior, go to <b>Online Store > Themes > Edit code</b>, open the <code>theme.liquid</code> file, delete the code block you added and put back the original tag: <code>&lt;link rel=\"canonical\" href=\"{{ canonical_url }}\"&gt;</code>.",
      contactTitle: "✉️ Contact and Support", contact1: "This application was created by Alejandro Eguía, working in SEO since 2006. Google Product Expert since 2013 in the Webmaster forum (", contactLink: "View official credential", contact2: ").", contact3: "If you need help with the App or wish to add any functionality, do not hesitate to contact me:" 
    },
    modal: { editSeo: "Edit SEO:", seoTitle: "SEO Title", metaDesc: "Meta Description", preview: "Google Preview:", desktop: "🖥️ Desktop", mobile: "📱 Mobile", addDesc: "Add a meta description to see how this result will appear...", cancel: "Cancel", save: "💾 Save to Shopify" },
    modalCanonical: { title: "Customize Canonical URL for:", defaultLabel: "Original URL (Default):", customLabel: "New Canonical URL (optional):", placeholder: "https://your-store.com/new-url", emptyNote: "If you leave this blank, Shopify will use the original default URL.", cancel: "Cancel", save: "💾 Save Canonical", alreadyInstalledNote: "⚠️ You only need to do this <b>ONCE</b> per store. If you already did it, check the box below.", markAsInstalled: "I have already added this code to my Theme", successMsg: "✅ You have indicated that the Canonical code is already installed in your Theme. Everything is working fine!", showInstructions: "Show installation instructions", finalStep: "⚠️ Final Step: Add this code to your Theme", finalStepDesc: "Shopify requires you to replace the original <code>&lt;link rel=\"canonical\"&gt;</code> tag in the <code>theme.liquid</code> file (Online Store &gt; Themes &gt; Edit code) with this exact snippet for it to work:" },
    feedback: {
      "Metadatos SEO guardados correctamente en Shopify.": "SEO metadata successfully saved in Shopify.",
      "Recurso excluido del Sitemap e indexación (noindex).": "Resource excluded from Sitemap and indexing (noindex).",
      "Recurso incluido en el Sitemap.": "Resource included in the Sitemap.",
      "Alt guardado exitosamente.": "Alt saved successfully.",
      "Canonical actualizado correctamente.": "Canonical updated successfully.",
      "Error de red al guardar el texto alternativo.": "Network error while saving alternative text.",
      "Intención no válida.": "Invalid intent."
    },
    backendIssues: {
      "Título corto (<30)": "Short title (<30)",
      "Título largo (>60)": "Long title (>60)",
      "Sin meta descripción": "Missing meta description",
      "Meta descripción fuera de rango": "Meta description out of range",
      "Imágenes sin texto ALT": "Images missing ALT text",
      "Imagen destacada sin texto ALT": "Featured image missing ALT text"
    }
  },
  pt: {
    greeting: "Olá,",
    summary: "Aqui está um resumo do status de Otimização de Mecanismos de Busca (SEO) da sua loja. Corrija os problemas marcados em vermelho para melhorar sua classificação no Google.",
    globalHealth: "Saúde SEO Global",
    permErrorTitle: "⚠️ Erro de Permissões no Shopify",
    permErrorDesc: "O Shopify bloqueou o acesso de leitura a determinados dados (por exemplo, Páginas ou Blogs). Para corrigir isso:",
    permError1: "Abra o seu arquivo shopify.app.toml",
    permError2: "Certifique-se de ter esses escopos:",
    permError3: "Pare o terminal do servidor e execute npm run dev novamente",
    permErrorDetails: "Ver detalhes técnicos do erro",
    tabs: { products: "📦 Produtos", collections: "📂 Coleções", pages: "📄 Páginas", blogs: "📝 Blog", images: "🖼️ Imagens (ALT)", guide: "📚 Guia SEO" },
    tables: { product: "Produto", collection: "Coleção", page: "Página", article: "Artigo", blog: "Blog", imageProduct: "Imagem e Produto", altText: "Texto Alternativo (ALT)", score: "Pontuação", issues: "Problemas Detectados", indexing: "Indexação", canonical: "URL Canônica", actions: "Ações" },
    empty: { products: "Nenhum produto disponível.", collections: "Nenhuma coleção disponível.", pages: "Nenhuma página disponível.", articles: "Nenhum artigo disponível.", images: "Ótimo! Todas as suas imagens já têm textos alternativos." },
    misc: { noImg: "Sem img", by: "Por", viewOriginal: "Ver produto original ↗", altPlaceholder: "Ex: Tênis esportivo vermelho tamanho 42...", saving: "Salvando...", saveAlt: "💾 Salvar ALT", active: "● Ativo", draft: "○ Rascunho", archived: "📦 Arquivado", optimized: "✓ Otimizado", hidden: "Oculto (noindex)", inSitemap: "No Sitemap", editSeo: "✏️ Editar SEO", include: "Incluir", exclude: "Excluir", lang: "🌐 Idioma:", na: "N/A", customizeCanonical: "Personalizar canonical", defaultCanonical: "Padrão", customCanonical: "Personalizada" },
    guide: { 
      goldenTitle: "Regra de Ouro do SEO", goldenDesc: "Evite títulos genéricos. Use sempre: [Produto] + [Material] + [Benefício ou Marca].", 
      howTo: "📖 Como usar este aplicativo", 
      scoreTitle: "🎯 Pontuação SEO (0 a 100)", scoreDesc: "O aplicativo analisa automaticamente seus títulos e descrições SEO. Ele penaliza títulos muito curtos (<30 caracteres) ou muito longos (>60 caracteres), bem como descrições muito curtas (<70) ou muito longas (>160). Além disso, reduz a pontuação se detectar imagens sem texto alternativo (ALT).", 
      editTitle: "✏️ Edição Rápida com Visualização", editDesc: "Ao pressionar o botão \"Editar SEO\", será aberto um painel onde você poderá modificar o Título e a Meta Descrição de qualquer produto, coleção, página ou artigo de blog. Enquanto digita, você verá uma simulação em tempo real de como o seu resultado apareceria nas pesquisas do Google, nas versões mobile e desktop.", 
      indexTitle: "👁️ Controle de Indexação (Ocultar do Sitemap)", indexDesc: "Se você tem produtos ou páginas que não quer que apareçam no Google (por exemplo, páginas de agradecimento ou produtos exclusivos), você pode usar o botão \"Excluir\". Isso adiciona uma regra (metafield seo.hidden) que diz ao Shopify para remover esse recurso do seu arquivo sitemap.xml e adiciona a tag noindex para que os motores de busca o ignorem.", 
      imgTitle: "🖼️ Otimização de Imagens (ALT)", imgDesc: "Na guia \"Imagens (ALT)\", o aplicativo filtra e mostra apenas as fotos dos produtos que atualmente não têm texto alternativo. Você pode ver uma pequena miniatura da imagem e escrever rapidamente sua descrição. Ao salvar, a imagem desaparecerá da lista, ajudando você a melhorar sua classificação no Google Imagens.", 
      canonicalTitle: "🔗 Como ativar URLs Canônicas personalizadas?", canonicalDesc: "O Shopify não atualiza automaticamente a tag canônica no código-fonte da sua loja apenas por usar o App. Para que funcione e o Google a detecte, você deve ir em <b>Loja Virtual > Temas > Editar código</b>, abrir o arquivo <code>theme.liquid</code> e substituir a tag original <code>&lt;link rel=\"canonical\" href=\"{{ canonical_url }}\"&gt;</code> pelo seguinte código seguro:",
      canonicalCode: "{% assign custom_canonical = product.metafields.seo.canonical_url | default: collection.metafields.seo.canonical_url | default: page.metafields.seo.canonical_url | default: article.metafields.seo.canonical_url %}\n{% if custom_canonical and custom_canonical != blank %}\n  <link rel=\"canonical\" href=\"{{ custom_canonical }}\">\n{% else %}\n  <link rel=\"canonical\" href=\"{{ canonical_url }}\">\n{% endif %}",
      uninstallTitle: "🗑️ O que acontece se eu desinstalar o aplicativo?", uninstallDesc: "Este aplicativo não injeta nenhum código fantasma ou scripts no frontend (Theme) da sua loja, portanto, não torna seu site mais lento de forma alguma. Se você decidir desinstalá-lo, sua loja ficará 100% limpa e sem resíduos. Além disso, todas as alterações que você fez (títulos de SEO, descrições, textos ALT, canônicas) permanecerão intactas permanentemente, pois são salvas nativamente direto no seu banco de dados do Shopify.<br><br><b>Como reverter o código Canônico personalizado?</b> Se você desinstalar o aplicativo e quiser retornar ao comportamento padrão do Shopify, vá em <b>Loja Virtual > Temas > Editar código</b>, abra o arquivo <code>theme.liquid</code>, exclua o bloco de código que você adicionou e coloque a tag original novamente: <code>&lt;link rel=\"canonical\" href=\"{{ canonical_url }}\"&gt;</code>.",
      contactTitle: "✉️ Contato e Suporte", contact1: "Este aplicativo foi criado por Alejandro Eguía, trabalhando com SEO desde 2006. Especialista de Produto do Google desde 2013 no fórum para Webmasters (", contactLink: "Ver credencial oficial", contact2: ").", contact3: "Se precisar de ajuda com o Aplicativo ou quiser adicionar alguma funcionalidade, não hesite em me contatar:" 
    },
    modal: { editSeo: "Editar SEO:", seoTitle: "Título SEO", metaDesc: "Meta Descrição", preview: "Visualização no Google:", desktop: "🖥️ Desktop", mobile: "📱 Celular", addDesc: "Adicione uma meta descrição para ver como este resultado aparecerá...", cancel: "Cancelar", save: "💾 Salvar no Shopify" },
    modalCanonical: { title: "Personalizar URL Canônica para:", defaultLabel: "URL Original (Padrão):", customLabel: "Nova URL Canônica (opcional):", placeholder: "https://sua-loja.com/nova-url", emptyNote: "Se você deixar em branco, o Shopify usará a URL original por padrão.", cancel: "Cancelar", save: "💾 Salvar Canônica", alreadyInstalledNote: "⚠️ Você só precisa fazer isso <b>UMA VEZ</b> por loja. Se você já fez isso, marque a caixa abaixo.", markAsInstalled: "Já adicionei este código ao meu Theme", successMsg: "✅ Você indicou que o código Canônico já está instalado no seu Theme. Tudo está funcionando bem!", showInstructions: "Ver instruções de instalação", finalStep: "⚠️ Passo Final: Adicione este código ao seu Theme", finalStepDesc: "O Shopify exige que você substitua a tag <code>&lt;link rel=\"canonical\"&gt;</code> original no arquivo <code>theme.liquid</code> (Loja Virtual &gt; Temas &gt; Editar código) por este trecho exato para que funcione:" },
    feedback: {
      "Metadatos SEO guardados correctamente en Shopify.": "Metadados SEO salvos com sucesso no Shopify.",
      "Recurso excluido del Sitemap e indexación (noindex).": "Recurso excluído do Sitemap e indexação (noindex).",
      "Recurso incluido en el Sitemap.": "Recurso incluído no Sitemap.",
      "Alt guardado exitosamente.": "Alt salvo com sucesso.",
      "Canonical actualizado correctamente.": "Canônica atualizada com sucesso.",
      "Error de red al guardar el texto alternativo.": "Erro de rede ao salvar texto alternativo.",
      "Intención no válida.": "Intenção inválida."
    },
    backendIssues: {
      "Título corto (<30)": "Título curto (<30)",
      "Título longo (>60)": "Título longo (>60)",
      "Sin meta descripción": "Sem meta descrição",
      "Meta descripción fuera de rango": "Meta descrição fora do limite",
      "Imágenes sin texto ALT": "Imagens sem texto ALT",
      "Imagen destacada sin texto ALT": "Imagem destacada sem texto ALT"
    }
  }
};

// ==========================================
// 4. INTERFAZ DE USUARIO
// ==========================================
export default function CompleteSEOApp() {
  const { shop, products, collections, pages, articles, totalScore, apiErrors, imagesWithoutAlt } = useLoaderData<typeof loader>();
  
  const fetcher = useFetcher<any>();
  const isSubmitting = fetcher.state !== "idle";

  // ESTADO DE IDIOMA
  const [lang, setLang] = useState<"es" | "en" | "pt">("en");

  // EFECTO: Recuperar idioma guardado de localStorage al cargar la app
  useEffect(() => {
    try {
      const storedLang = localStorage.getItem("seo_pro_lang");
      if (storedLang === "es" || storedLang === "en" || storedLang === "pt") {
        setLang(storedLang);
      }
    } catch (e) {
      // Ignorar si localStorage está bloqueado
    }
  }, []);

  const handleLangChange = (newLang: "es" | "en" | "pt") => {
    setLang(newLang);
    try {
      localStorage.setItem("seo_pro_lang", newLang);
    } catch (e) { }
  };

  const t = dict[lang];

  const actionData = fetcher.data;
  const feedback = actionData 
    ? (actionData.error 
        ? { type: "critical" as const, message: t.feedback[actionData.error as keyof typeof t.feedback] || actionData.error } 
        : { type: "success" as const, message: t.feedback[actionData.message as keyof typeof t.feedback] || actionData.message }) 
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

  // NUEVO ESTADO: Editor de Canonical URL
  const [editingCanonical, setEditingCanonical] = useState<{
    id: string;
    title: string;
    defaultUrl: string;
    customUrl: string;
  } | null>(null);

  const [canonicalCodeInstalled, setCanonicalCodeInstalled] = useState(false);

  useEffect(() => {
    try {
      const isInstalled = localStorage.getItem("seo_canonical_installed");
      if (isInstalled === "true") setCanonicalCodeInstalled(true);
    } catch (e) {}
  }, []);

  const handleToggleCanonicalInstalled = (val: boolean) => {
    setCanonicalCodeInstalled(val);
    try {
      localStorage.setItem("seo_canonical_installed", val ? "true" : "false");
    } catch (e) {}
  };

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [imageAlts, setImageAlts] = useState<Record<string, string>>({});

  const executeApiCall = (body: Record<string, string>) => {
    fetcher.submit(body, { method: "POST" });
  };

  const handleOpenEditor = (item: any, type: "product" | "collection" | "page" | "article", parentHandle?: string) => {
    setEditingItem({ id: item.id, type, title: item.title, handle: item.handle, parentHandle: parentHandle || "", seoTitle: item.seoTitle, seoDesc: item.seoDesc });
  };

  const handleOpenCanonical = (item: any) => {
    setEditingCanonical({ id: item.id, title: item.title, defaultUrl: item.defaultCanonical, customUrl: item.customCanonical });
  };

  const handleSaveMetadata = () => {
    if (!editingItem) return;
    executeApiCall({ intent: "save_seo_metadata", resourceType: editingItem.type, resourceId: editingItem.id, seoTitle: editingItem.seoTitle, seoDesc: editingItem.seoDesc });
    setEditingItem(null);
  };

  const handleSaveCanonical = () => {
    if (!editingCanonical) return;
    executeApiCall({ intent: "save_canonical_url", resourceId: editingCanonical.id, canonicalUrl: editingCanonical.customUrl });
    setEditingCanonical(null);
  };

  const handleToggleSitemap = (resourceId: string, currentlyHidden: boolean) => {
    executeApiCall({ intent: "toggle_sitemap", resourceId, hideAction: currentlyHidden ? "show" : "hide" });
  };

  const handleSaveSingleAlt = (e: React.MouseEvent, productId: string, mediaId: string) => {
    e.preventDefault(); 
    const altText = imageAlts[mediaId] || "";
    if (!altText.trim()) return;
    executeApiCall({ intent: "update_single_alt_text", productId, mediaId, altText });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#108043";
    if (score >= 50) return "#b98900";
    return "#d82c0d";
  };

  const renderScore = (score: number, isHidden: boolean) => {
    if (isHidden) {
      return <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", color: "#6d7175", backgroundColor: "#f1f2f4" }}>{t.misc.na}</span>;
    }
    return <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", color: getScoreColor(score), backgroundColor: "#f6f6f7" }}>{score} / 100</span>;
  };

  const renderProductStatus = (status: string) => {
    switch (status) {
      case "ACTIVE": return <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", backgroundColor: "#e3f1df", color: "#108043" }}>{t.misc.active}</span>;
      case "DRAFT": return <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", backgroundColor: "#f6f6f7", color: "#5c5f62" }}>{t.misc.draft}</span>;
      case "ARCHIVED": return <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", backgroundColor: "#fef3d6", color: "#8a6100" }}>{t.misc.archived}</span>;
      default: return <span>{status}</span>;
    }
  };

  const getGoogleSnippetUrl = () => {
    if (!editingItem) return "";
    let path = "";
    if (editingItem.type === "product") path = `/products/${editingItem.handle}`;
    else if (editingItem.type === "collection") path = `/collections/${editingItem.handle}`;
    else if (editingItem.type === "page") path = `/pages/${editingItem.handle}`;
    else if (editingItem.type === "article") path = `/blogs/${editingItem.parentHandle}/${editingItem.handle}`;
    return `https://${shop.myshopifyDomain}${path}`;
  };

  const renderCanonicalCell = (item: any) => {
    return (
      <td style={{ padding: "12px 16px" }}>
        {item.customCanonical ? (
          <div style={{ fontSize: "12px", color: "#108043", fontWeight: "600", marginBottom: "6px" }}>
            {t.misc.customCanonical}
          </div>
        ) : (
          <div style={{ fontSize: "12px", color: "#6d7175", marginBottom: "6px" }}>
            {t.misc.defaultCanonical}
          </div>
        )}
        <button 
          type="button" 
          onClick={() => handleOpenCanonical(item)}
          style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #c9cccf", backgroundColor: "#f6f6f7", color: "#202223", fontSize: "11px", cursor: "pointer", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}
        >
           {t.misc.customizeCanonical}
        </button>
      </td>
    );
  };

  return (
    <s-page title="SEO Pro All-in-One">
      
      {/* Banner de bienvenida y Score */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
        <s-card style={{ flex: "2", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <h1 style={{ fontSize: "20px", fontWeight: "600", margin: 0 }}>{t.greeting} {shop.name} 👋</h1>
            
            {/* SELECTOR DE IDIOMA */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "#6d7175", fontWeight: "600" }}>{t.misc.lang}</span>
              <select 
                value={lang} 
                onChange={(e) => handleLangChange(e.target.value as "es" | "en" | "pt")}
                style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #c9cccf", fontSize: "13px", backgroundColor: "#fff", cursor: "pointer" }}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="pt">Português</option>
              </select>
            </div>
          </div>
          <p style={{ margin: 0, color: "#6d7175" }}>{t.summary}</p>
        </s-card>
        <s-card style={{ flex: "1", padding: "20px", textAlign: "center", backgroundColor: getScoreColor(totalScore) + "10", border: `1px solid ${getScoreColor(totalScore)}40` }}>
          <h2 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 10px 0", color: "#303030" }}>{t.globalHealth}</h2>
          <div style={{ fontSize: "42px", fontWeight: "700", color: getScoreColor(totalScore), lineHeight: "1" }}>{totalScore}<span style={{ fontSize: "20px" }}>/100</span></div>
        </s-card>
      </div>

      {apiErrors && apiErrors.length > 0 && (
        <div style={{ padding: "16px", backgroundColor: "#ffe4e5", borderLeft: "4px solid #d82c0d", borderRadius: "4px", marginBottom: "20px" }}>
          <h3 style={{ margin: "0 0 8px 0", color: "#d82c0d", fontSize: "14px" }}>{t.permErrorTitle}</h3>
          <p style={{ margin: "0 0 8px 0", color: "#d82c0d", fontSize: "13px" }}>{t.permErrorDesc}</p>
          <ol style={{ margin: "0 0 12px 0", color: "#d82c0d", fontSize: "13px", paddingLeft: "24px" }}>
            <li>{t.permError1}</li>
            <li>{t.permError2} <br/><code>scopes = "write_products,read_online_store_pages,write_online_store_pages,read_content,write_content,write_metaobjects,write_metaobject_definitions"</code></li>
            <li>{t.permError3}</li>
          </ol>
          <details>
            <summary style={{ cursor: "pointer", color: "#d82c0d", fontSize: "12px", fontWeight: "600" }}>{t.permErrorDetails}</summary>
            <ul style={{ margin: "8px 0 0 0", color: "#d82c0d", fontSize: "12px", paddingLeft: "20px" }}>
              {apiErrors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </details>
        </div>
      )}

      {feedback && (
        <div style={{ padding: "12px 16px", backgroundColor: feedback.type === "success" ? "#e3f1df" : "#ffe4e5", borderLeft: `4px solid ${feedback.type === "success" ? "#108043" : "#d82c0d"}`, borderRadius: "4px", marginBottom: "20px" }}>
          <span style={{ color: feedback.type === "success" ? "#108043" : "#d82c0d", fontWeight: "600", fontSize: "14px" }}>{feedback.message}</span>
        </div>
      )}

      {/* Navegación por Pestañas */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", borderBottom: "1px solid #e1e3e5", paddingBottom: "10px", overflowX: "auto" }}>
        {["products", "collections", "pages", "blogs", "images", "guide"].map((tab) => {
          const labels: Record<string, string> = { 
            products: `${t.tabs.products} (${products.length})`, 
            collections: `${t.tabs.collections} (${collections.length})`, 
            pages: `${t.tabs.pages} (${pages.length})`, 
            blogs: `${t.tabs.blogs} (${articles.length})`, 
            images: `${t.tabs.images} (${imagesWithoutAlt.length})`, 
            guide: t.tabs.guide 
          };
          return (
            <button key={tab} onClick={() => setActiveTab(tab as any)} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: activeTab === tab ? "#e1e3e5" : "transparent", fontWeight: activeTab === tab ? "600" : "400", cursor: "pointer", fontSize: "14px", color: "#202223", whiteSpace: "nowrap" }}>
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Contenido de Pestañas */}
      {activeTab === "products" && (
        <s-card style={{ padding: "0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ backgroundColor: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
              <tr>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.product}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.score}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.issues}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.indexing}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.canonical}</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "13px", fontWeight: "600" }}>{t.tables.actions}</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#6d7175" }}>{t.empty.products}</td></tr>
              ) : (
                products.map((prod) => (
                  <tr key={prod.id} style={{ borderBottom: "1px solid #f1f2f4" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: "40px", height: "40px", backgroundColor: "#f6f6f7", borderRadius: "4px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {prod.imageUrl ? <img src={prod.imageUrl} alt={prod.imageAlt || t.tables.product} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "#8c9196", fontSize: "12px" }}>{t.misc.noImg}</span>}
                        </div>
                        <div>
                          <div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "4px" }}>{prod.title}</div>
                          <div style={{ fontSize: "12px", marginBottom: "2px" }}><a href={`https://${shop.myshopifyDomain}/products/${prod.handle}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2c6ecb", textDecoration: "none" }}>/products/{prod.handle}</a></div>
                          <div style={{ fontSize: "11px", color: "#8c9196", marginBottom: "6px" }}>ID: {prod.numericId}</div>
                          {renderProductStatus(prod.status)}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>{renderScore(prod.score, prod.isHidden)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {prod.issues.length === 0 ? <span style={{ color: "#108043", fontSize: "13px" }}>{t.misc.optimized}</span> : prod.issues.map((issue: string, idx: number) => <div key={idx} style={{ color: "#d82c0d", fontSize: "12px" }}>• {t.backendIssues[issue as keyof typeof t.backendIssues] || issue}</div>)}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", backgroundColor: prod.isHidden ? "#fef3d6" : "#e3f1df", color: prod.isHidden ? "#8a6100" : "#108043" }}>
                        {prod.isHidden ? t.misc.hidden : t.misc.inSitemap}
                      </span>
                    </td>
                    {renderCanonicalCell(prod)}
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <button 
                          type="button" 
                          onClick={() => handleOpenEditor(prod, "product")} 
                          style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #c9cccf", backgroundColor: "#ffffff", color: "#202223", fontWeight: "600", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}
                        >
                          {t.misc.editSeo}
                        </button>
                        <button 
                          type="button" 
                          disabled={isSubmitting} 
                          onClick={() => handleToggleSitemap(prod.id, prod.isHidden)} 
                          style={{ padding: "6px 12px", borderRadius: "6px", border: prod.isHidden ? "none" : "1px solid #c9cccf", backgroundColor: prod.isHidden ? "#108043" : "#ffffff", color: prod.isHidden ? "#ffffff" : "#d82c0d", fontWeight: "600", cursor: isSubmitting ? "not-allowed" : "pointer", fontSize: "13px", fontFamily: "inherit" }}
                        >
                          {prod.isHidden ? t.misc.include : t.misc.exclude}
                        </button>
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
        <s-card style={{ padding: "0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ backgroundColor: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
              <tr>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.collection}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.score}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.issues}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.indexing}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.canonical}</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "13px", fontWeight: "600" }}>{t.tables.actions}</th>
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#6d7175" }}>{t.empty.collections}</td></tr>
              ) : (
                collections.map((col) => (
                  <tr key={col.id} style={{ borderBottom: "1px solid #f1f2f4" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "4px" }}>{col.title}</div>
                      <div style={{ fontSize: "12px", marginBottom: "2px" }}><a href={`https://${shop.myshopifyDomain}/collections/${col.handle}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2c6ecb", textDecoration: "none" }}>/collections/{col.handle}</a></div>
                      <div style={{ fontSize: "11px", color: "#8c9196" }}>ID: {col.numericId}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>{renderScore(col.score, col.isHidden)}</td>
                    <td style={{ padding: "12px 16px" }}>{col.issues.length === 0 ? <span style={{ color: "#108043", fontSize: "13px" }}>{t.misc.optimized}</span> : col.issues.map((issue: string, idx: number) => <div key={idx} style={{ color: "#d82c0d", fontSize: "12px" }}>• {t.backendIssues[issue as keyof typeof t.backendIssues] || issue}</div>)}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", backgroundColor: col.isHidden ? "#fef3d6" : "#e3f1df", color: col.isHidden ? "#8a6100" : "#108043" }}>{col.isHidden ? t.misc.hidden : t.misc.inSitemap}</span></td>
                    {renderCanonicalCell(col)}
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <button 
                          type="button" 
                          onClick={() => handleOpenEditor(col, "collection")} 
                          style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #c9cccf", backgroundColor: "#ffffff", color: "#202223", fontWeight: "600", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}
                        >
                          {t.misc.editSeo}
                        </button>
                        <button 
                          type="button" 
                          disabled={isSubmitting} 
                          onClick={() => handleToggleSitemap(col.id, col.isHidden)} 
                          style={{ padding: "6px 12px", borderRadius: "6px", border: col.isHidden ? "none" : "1px solid #c9cccf", backgroundColor: col.isHidden ? "#108043" : "#ffffff", color: col.isHidden ? "#ffffff" : "#d82c0d", fontWeight: "600", cursor: isSubmitting ? "not-allowed" : "pointer", fontSize: "13px", fontFamily: "inherit" }}
                        >
                          {col.isHidden ? t.misc.include : t.misc.exclude}
                        </button>
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
        <s-card style={{ padding: "0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ backgroundColor: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
              <tr>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.page}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.score}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.issues}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.indexing}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.canonical}</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "13px", fontWeight: "600" }}>{t.tables.actions}</th>
              </tr>
            </thead>
            <tbody>
              {pages.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#6d7175" }}>{t.empty.pages}</td></tr>
              ) : (
                pages.map((pg) => (
                  <tr key={pg.id} style={{ borderBottom: "1px solid #f1f2f4" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "4px" }}>{pg.title}</div>
                      <div style={{ fontSize: "12px", marginBottom: "2px" }}><a href={`https://${shop.myshopifyDomain}/pages/${pg.handle}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2c6ecb", textDecoration: "none" }}>/pages/{pg.handle}</a></div>
                      <div style={{ fontSize: "11px", color: "#8c9196" }}>ID: {pg.numericId}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>{renderScore(pg.score, pg.isHidden)}</td>
                    <td style={{ padding: "12px 16px" }}>{pg.issues.length === 0 ? <span style={{ color: "#108043", fontSize: "13px" }}>{t.misc.optimized}</span> : pg.issues.map((issue: string, idx: number) => <div key={idx} style={{ color: "#d82c0d", fontSize: "12px" }}>• {t.backendIssues[issue as keyof typeof t.backendIssues] || issue}</div>)}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", backgroundColor: pg.isHidden ? "#fef3d6" : "#e3f1df", color: pg.isHidden ? "#8a6100" : "#108043" }}>{pg.isHidden ? t.misc.hidden : t.misc.inSitemap}</span></td>
                    {renderCanonicalCell(pg)}
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <button 
                          type="button" 
                          onClick={() => handleOpenEditor(pg, "page")} 
                          style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #c9cccf", backgroundColor: "#ffffff", color: "#202223", fontWeight: "600", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}
                        >
                          {t.misc.editSeo}
                        </button>
                        <button 
                          type="button" 
                          disabled={isSubmitting} 
                          onClick={() => handleToggleSitemap(pg.id, pg.isHidden)} 
                          style={{ padding: "6px 12px", borderRadius: "6px", border: pg.isHidden ? "none" : "1px solid #c9cccf", backgroundColor: pg.isHidden ? "#108043" : "#ffffff", color: pg.isHidden ? "#ffffff" : "#d82c0d", fontWeight: "600", cursor: isSubmitting ? "not-allowed" : "pointer", fontSize: "13px", fontFamily: "inherit" }}
                        >
                          {pg.isHidden ? t.misc.include : t.misc.exclude}
                        </button>
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
        <s-card style={{ padding: "0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ backgroundColor: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
              <tr>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.article}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.blog}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.score}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.issues}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.indexing}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.canonical}</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "13px", fontWeight: "600" }}>{t.tables.actions}</th>
              </tr>
            </thead>
            <tbody>
              {articles.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "#6d7175" }}>{t.empty.articles}</td></tr>
              ) : (
                articles.map((art) => (
                  <tr key={art.id} style={{ borderBottom: "1px solid #f1f2f4" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "4px" }}>{art.title}</div>
                      <div style={{ fontSize: "12px", color: "#6d7175", marginBottom: "2px" }}>{t.misc.by} {art.authorName}</div>
                      <div style={{ fontSize: "12px", marginBottom: "2px" }}><a href={`https://${shop.myshopifyDomain}/blogs/${art.blogHandle}/${art.handle}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2c6ecb", textDecoration: "none" }}>/blogs/{art.blogHandle}/{art.handle}</a></div>
                      <div style={{ fontSize: "11px", color: "#8c9196" }}>ID: {art.numericId}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", backgroundColor: "#f1f2f4", borderRadius: "10px", fontSize: "12px", fontWeight: "600" }}>{art.blogTitle}</span></td>
                    <td style={{ padding: "12px 16px" }}>{renderScore(art.score, art.isHidden)}</td>
                    <td style={{ padding: "12px 16px" }}>{art.issues.length === 0 ? <span style={{ color: "#108043", fontSize: "13px" }}>{t.misc.optimized}</span> : art.issues.map((issue: string, idx: number) => <div key={idx} style={{ color: "#d82c0d", fontSize: "12px" }}>• {t.backendIssues[issue as keyof typeof t.backendIssues] || issue}</div>)}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "12px", backgroundColor: art.isHidden ? "#fef3d6" : "#e3f1df", color: art.isHidden ? "#8a6100" : "#108043" }}>{art.isHidden ? t.misc.hidden : t.misc.inSitemap}</span></td>
                    {renderCanonicalCell(art)}
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <button 
                          type="button" 
                          onClick={() => handleOpenEditor(art, "article", art.blogHandle)} 
                          style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #c9cccf", backgroundColor: "#ffffff", color: "#202223", fontWeight: "600", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}
                        >
                          {t.misc.editSeo}
                        </button>
                        <button 
                          type="button" 
                          disabled={isSubmitting} 
                          onClick={() => handleToggleSitemap(art.id, art.isHidden)} 
                          style={{ padding: "6px 12px", borderRadius: "6px", border: art.isHidden ? "none" : "1px solid #c9cccf", backgroundColor: art.isHidden ? "#108043" : "#ffffff", color: art.isHidden ? "#ffffff" : "#d82c0d", fontWeight: "600", cursor: isSubmitting ? "not-allowed" : "pointer", fontSize: "13px", fontFamily: "inherit" }}
                        >
                          {art.isHidden ? t.misc.include : t.misc.exclude}
                        </button>
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
        <s-card style={{ padding: "0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ backgroundColor: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
              <tr>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.imageProduct}</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "13px", fontWeight: "600" }}>{t.tables.altText}</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "13px", fontWeight: "600" }}>{t.tables.actions}</th>
              </tr>
            </thead>
            <tbody>
              {imagesWithoutAlt.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "#6d7175" }}>{t.empty.images}</td></tr>
              ) : (
                imagesWithoutAlt.map((img) => (
                  <tr key={img.mediaId} style={{ borderBottom: "1px solid #f1f2f4" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: "60px", height: "60px", backgroundColor: "#f6f6f7", borderRadius: "6px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid #e1e3e5" }}>
                          <img src={img.url} alt="Sin ALT" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                        <div>
                          <div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "4px" }}>{img.productTitle}</div>
                          <div style={{ fontSize: "12px" }}>
                            <a href={`https://${shop.myshopifyDomain}/products/${img.productHandle}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2c6ecb", textDecoration: "none" }}>{t.misc.viewOriginal}</a>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <input 
                        type="text" 
                        placeholder={t.misc.altPlaceholder}
                        value={imageAlts[img.mediaId] || ""}
                        onChange={(e) => setImageAlts({ ...imageAlts, [img.mediaId]: e.target.value })}
                        style={{ width: "100%", maxWidth: "350px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "13px" }} 
                      />
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button 
                        type="button"
                        disabled={isSubmitting || !imageAlts[img.mediaId]?.trim()} 
                        onClick={(e) => handleSaveSingleAlt(e, img.productId, img.mediaId)}
                        style={{ 
                          padding: "6px 12px", 
                          borderRadius: "6px", 
                          border: "none", 
                          backgroundColor: (isSubmitting || !imageAlts[img.mediaId]?.trim()) ? "#e1e3e5" : "#2c6ecb", 
                          color: (isSubmitting || !imageAlts[img.mediaId]?.trim()) ? "#8c9196" : "#ffffff", 
                          fontWeight: "600", 
                          cursor: (isSubmitting || !imageAlts[img.mediaId]?.trim()) ? "not-allowed" : "pointer",
                          fontSize: "13px",
                          fontFamily: "inherit"
                        }}
                      >
                        {isSubmitting ? t.misc.saving : t.misc.saveAlt}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </s-card>
      )}

      {/* GUÍA SEO MULTILINGÜE */}
      {activeTab === "guide" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          <div style={{ backgroundColor: "#f0f7f5", border: "1px solid #b7ece0", borderRadius: "12px", padding: "20px", display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <span style={{ fontSize: "28px", lineHeight: "1" }}>💡</span>
            <div>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: "600", color: "#005e46" }}>{t.guide.goldenTitle}</h3>
              <p style={{ margin: 0, color: "#2c5448", fontSize: "13px", lineHeight: "1.5" }}>{t.guide.goldenDesc}</p>
            </div>
          </div>

          <s-card style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 20px 0" }}>{t.guide.howTo}</h3>
            
            <div style={{ marginBottom: "20px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 6px 0", color: "#202223" }}>{t.guide.scoreTitle}</h4>
              <p style={{ margin: 0, color: "#6d7175", fontSize: "14px", lineHeight: "1.5" }}>{t.guide.scoreDesc}</p>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 6px 0", color: "#202223" }}>{t.guide.editTitle}</h4>
              <p style={{ margin: 0, color: "#6d7175", fontSize: "14px", lineHeight: "1.5" }}>{t.guide.editDesc}</p>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 6px 0", color: "#202223" }}>{t.guide.indexTitle}</h4>
              <p style={{ margin: 0, color: "#6d7175", fontSize: "14px", lineHeight: "1.5" }}>{t.guide.indexDesc}</p>
            </div>

            <div>
              <h4 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 6px 0", color: "#202223" }}>{t.guide.imgTitle}</h4>
              <p style={{ margin: 0, color: "#6d7175", fontSize: "14px", lineHeight: "1.5" }}>{t.guide.imgDesc}</p>
            </div>
          </s-card>

          {/* NUEVA SECCIÓN DE ACTIVACIÓN DE CANONICALS */}
          <s-card style={{ padding: "24px", backgroundColor: "#f4f6f8", border: "1px solid #dfe3e8" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 10px 0", color: "#202223" }}>{t.guide.canonicalTitle}</h3>
            <p style={{ margin: "0 0 16px 0", color: "#4d5156", fontSize: "14px", lineHeight: "1.6" }} dangerouslySetInnerHTML={{ __html: t.guide.canonicalDesc }}></p>
            <div style={{ position: "relative", backgroundColor: "#202223", borderRadius: "8px", padding: "16px", overflowX: "auto" }}>
              <pre style={{ margin: 0, color: "#e3e5e7", fontSize: "13px", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                {t.guide.canonicalCode}
              </pre>
            </div>
          </s-card>

          <s-card style={{ padding: "24px", backgroundColor: "#fff9eb", border: "1px solid #fbdc8e" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 10px 0", color: "#202223" }}>{t.guide.uninstallTitle}</h3>
            <p style={{ margin: 0, color: "#4d5156", fontSize: "14px", lineHeight: "1.6" }} dangerouslySetInnerHTML={{ __html: t.guide.uninstallDesc }}></p>
          </s-card>

          <s-card style={{ padding: "24px", backgroundColor: "#f6f6f7", border: "1px solid #e1e3e5" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 12px 0", color: "#202223" }}>{t.guide.contactTitle}</h3>
            <p style={{ margin: "0 0 16px 0", color: "#4d5156", fontSize: "14px", lineHeight: "1.6" }}>
              {t.guide.contact1} <a href="https://productexperts.withgoogle.com/directory/84251b18-9ee4-4567-8f66-60de6ab352ab" target="_blank" rel="noopener noreferrer" style={{ color: "#2c6ecb", textDecoration: "none" }}>{t.guide.contactLink}</a>{t.guide.contact2}
            </p>
            <p style={{ margin: 0, color: "#4d5156", fontSize: "14px", lineHeight: "1.6" }}>
              {t.guide.contact3} <br/>
              <a href="https://www.linkedin.com/in/alejandroeguia/" target="_blank" rel="noopener noreferrer" style={{ color: "#2c6ecb", textDecoration: "none", fontWeight: "600" }}>https://www.linkedin.com/in/alejandroeguia/</a>
            </p>
          </s-card>

        </div>
      )}
      
      {/* MODAL DE EDICIÓN SEO (TITLE Y DESC) */}
      {editingItem && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", width: "100%", maxWidth: "720px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "600" }}>{t.modal.editSeo} {editingItem.title}</h2>
              <button onClick={() => setEditingItem(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}>✕</button>
            </div>
            
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontWeight: "600", fontSize: "13px" }}>{t.modal.seoTitle}</label>
                <span style={{ fontSize: "12px", color: editingItem.seoTitle.length >= 50 && editingItem.seoTitle.length <= 60 ? "#108043" : "#8a6100" }}>{editingItem.seoTitle.length} / 60</span>
              </div>
              <input type="text" value={editingItem.seoTitle} onChange={(e) => setEditingItem({ ...editingItem, seoTitle: e.target.value })} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #c9cccf" }} />
            </div>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontWeight: "600", fontSize: "13px" }}>{t.modal.metaDesc}</label>
                <span style={{ fontSize: "12px", color: editingItem.seoDesc.length >= 120 && editingItem.seoDesc.length <= 155 ? "#108043" : "#8a6100" }}>{editingItem.seoDesc.length} / 155</span>
              </div>
              <textarea rows={3} value={editingItem.seoDesc} onChange={(e) => setEditingItem({ ...editingItem, seoDesc: e.target.value })} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #c9cccf" }} />
            </div>
            <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px", backgroundColor: "#ffffff", marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontWeight: "600", fontSize: "13px", color: "#303030" }}>{t.modal.preview}</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button type="button" onClick={() => setPreviewDevice("desktop")} style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #e1e3e5", backgroundColor: previewDevice === "desktop" ? "#202223" : "#ffffff", color: previewDevice === "desktop" ? "#ffffff" : "#202223", fontSize: "12px", cursor: "pointer" }}>{t.modal.desktop}</button>
                  <button type="button" onClick={() => setPreviewDevice("mobile")} style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #e1e3e5", backgroundColor: previewDevice === "mobile" ? "#202223" : "#ffffff", color: previewDevice === "mobile" ? "#ffffff" : "#202223", fontSize: "12px", cursor: "pointer" }}>{t.modal.mobile}</button>
                </div>
              </div>
              <div style={{ maxWidth: previewDevice === "mobile" ? "360px" : "600px", fontFamily: "Arial, sans-serif" }}>
                <div style={{ fontSize: "12px", color: "#202124" }}>{getGoogleSnippetUrl()}</div>
                <div style={{ color: "#1a0dab", fontSize: "18px", lineHeight: "1.3", cursor: "pointer", marginTop: "4px", textDecoration: "underline" }}>{editingItem.seoTitle || editingItem.title}</div>
                <div style={{ color: "#4d5156", fontSize: "14px", lineHeight: "1.4", marginTop: "4px" }}>{editingItem.seoDesc || t.modal.addDesc}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button 
                type="button" 
                onClick={() => setEditingItem(null)}
                style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #c9cccf", backgroundColor: "#ffffff", color: "#202223", fontWeight: "600", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}
              >
                {t.modal.cancel}
              </button>
              <button 
                type="button" 
                disabled={isSubmitting} 
                onClick={handleSaveMetadata}
                style={{ padding: "8px 16px", borderRadius: "6px", border: "none", backgroundColor: isSubmitting ? "#e1e3e5" : "#2c6ecb", color: isSubmitting ? "#8c9196" : "#ffffff", fontWeight: "600", cursor: isSubmitting ? "not-allowed" : "pointer", fontSize: "13px", fontFamily: "inherit" }}
              >
                {isSubmitting ? t.misc.saving : t.modal.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDICIÓN DE URL CANONICAL */}
      {editingCanonical && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", width: "100%", maxWidth: "550px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>{t.modalCanonical.title} <span style={{color: "#2c6ecb"}}>{editingCanonical.title}</span></h2>
              <button onClick={() => setEditingCanonical(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "#f6f6f7", borderRadius: "6px", border: "1px solid #e1e3e5" }}>
              <label style={{ fontWeight: "600", fontSize: "12px", color: "#6d7175", display: "block", marginBottom: "4px" }}>{t.modalCanonical.defaultLabel}</label>
              <div style={{ fontSize: "13px", wordBreak: "break-all", color: "#202223" }}>{editingCanonical.defaultUrl}</div>
            </div>
            
            <div style={{ marginBottom: "24px" }}>
              <label style={{ fontWeight: "600", fontSize: "13px", display: "block", marginBottom: "8px" }}>{t.modalCanonical.customLabel}</label>
              <input 
                type="text" 
                placeholder={t.modalCanonical.placeholder}
                value={editingCanonical.customUrl} 
                onChange={(e) => setEditingCanonical({ ...editingCanonical, customUrl: e.target.value })} 
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "14px" }} 
              />
              <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#6d7175" }}>{t.modalCanonical.emptyNote}</p>
            </div>

            {canonicalCodeInstalled ? (
              <div style={{ padding: "16px", backgroundColor: "#e3f1df", border: "1px solid #108043", borderRadius: "8px", marginBottom: "24px" }}>
                <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#108043", fontWeight: "600" }}>
                  {t.modalCanonical.successMsg}
                </p>
                <button type="button" onClick={() => handleToggleCanonicalInstalled(false)} style={{ background: "none", border: "none", color: "#2c6ecb", fontSize: "12px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                  {t.modalCanonical.showInstructions}
                </button>
              </div>
            ) : (
              <div style={{ padding: "16px", backgroundColor: "#f4f6f8", border: "1px solid #dfe3e8", borderRadius: "8px", marginBottom: "24px" }}>
                <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#202223", fontWeight: "600" }}>
                  {t.modalCanonical.finalStep}
                </p>
                <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "#4d5156" }} dangerouslySetInnerHTML={{ __html: t.modalCanonical.finalStepDesc }}></p>
                <div style={{ backgroundColor: "#202223", borderRadius: "6px", padding: "12px", overflowX: "auto", marginBottom: "12px" }}>
                  <pre style={{ margin: 0, color: "#e3e5e7", fontSize: "11px", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                    {t.guide.canonicalCode}
                  </pre>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <p style={{ margin: 0, fontSize: "12px", color: "#8a6100" }} dangerouslySetInnerHTML={{ __html: t.modalCanonical.alreadyInstalledNote }}></p>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", color: "#202223", fontWeight: "500" }}>
                    <input type="checkbox" checked={canonicalCodeInstalled} onChange={(e) => handleToggleCanonicalInstalled(e.target.checked)} style={{ cursor: "pointer", margin: 0 }} />
                    {t.modalCanonical.markAsInstalled}
                  </label>
                </div>
              </div>
            )}
            
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button 
                type="button" 
                onClick={() => setEditingCanonical(null)}
                style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #c9cccf", backgroundColor: "#ffffff", color: "#202223", fontWeight: "600", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}
              >
                {t.modalCanonical.cancel}
              </button>
              <button 
                type="button" 
                disabled={isSubmitting} 
                onClick={handleSaveCanonical}
                style={{ padding: "8px 16px", borderRadius: "6px", border: "none", backgroundColor: isSubmitting ? "#e1e3e5" : "#2c6ecb", color: isSubmitting ? "#8c9196" : "#ffffff", fontWeight: "600", cursor: isSubmitting ? "not-allowed" : "pointer", fontSize: "13px", fontFamily: "inherit" }}
              >
                {isSubmitting ? t.misc.saving : t.modalCanonical.save}
              </button>
            </div>
          </div>
        </div>
      )}

    </s-page>
  );
}