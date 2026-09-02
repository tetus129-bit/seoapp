import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    // 1. Guardar Metadatos SEO (Productos, Colecciones, Páginas o Artículos de Blog)
    if (intent === "save_seo_metadata") {
      const resourceType = formData.get("resourceType") as "product" | "collection" | "page" | "article";
      const resourceId = formData.get("resourceId") as string;
      const seoTitle = (formData.get("seoTitle") as string) || "";
      const seoDesc = (formData.get("seoDesc") as string) || "";

      if (resourceType === "product") {
        await admin.graphql(
          `#graphql
            mutation updateProductSEO($input: ProductInput!) {
              productUpdate(input: $input) {
                userErrors { field message }
              }
            }
          `,
          { variables: { input: { id: resourceId, seo: { title: seoTitle, description: seoDesc } } } }
        );
      } else if (resourceType === "collection") {
        await admin.graphql(
          `#graphql
            mutation updateCollectionSEO($input: CollectionInput!) {
              collectionUpdate(input: $input) {
                userErrors { field message }
              }
            }
          `,
          { variables: { input: { id: resourceId, seo: { title: seoTitle, description: seoDesc } } } }
        );
      } else if (resourceType === "page" || resourceType === "article") {
        // Se corrigió el tipo a "single_line_text_field" y se quitó el $id innecesario
        await admin.graphql(
          `#graphql
            mutation updateContentSEO($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                userErrors { field message }
              }
            }
          `,
          {
            variables: {
              metafields: [
                { ownerId: resourceId, namespace: "global", key: "title_tag", value: seoTitle, type: "single_line_text_field" },
                { ownerId: resourceId, namespace: "global", key: "description_tag", value: seoDesc, type: "single_line_text_field" },
              ],
            },
          }
        );
      }

      return Response.json({ success: true, message: "Metadatos SEO actualizados correctamente en Shopify." });
    }

    // 2. Control de Indexación / Sitemap (Metafield seo.hidden)
    if (intent === "toggle_sitemap") {
      const resourceId = formData.get("resourceId") as string;
      const hideAction = formData.get("hideAction") as "hide" | "show";
      const value = hideAction === "hide" ? "1" : "0";

      await admin.graphql(
        `#graphql
          mutation setSEOHiddenMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors { field message }
            }
          }
        `,
        {
          variables: {
            metafields: [{ ownerId: resourceId, namespace: "seo", key: "hidden", value: value, type: "number_integer" }],
          },
        }
      );

      return Response.json({
        success: true,
        message: hideAction === "hide" ? "Recurso excluido del Sitemap e indexación (noindex)." : "Recurso incluido en el Sitemap.",
      });
    }

    // 3. Optimización masiva de ALT (Tu lógica original intacta)
    if (intent === "bulk_update_alt_texts") {
      const altTemplate = (formData.get("altTemplate") as string) || "{{title}}";
      const shopName = (formData.get("shopName") as string) || "Tienda";

      const productsQuery = await admin.graphql(
        `#graphql
          query getMissingAltImages {
            products(first: 25) {
              edges {
                node {
                  id
                  title
                  media(first: 10) {
                    nodes {
                      ... on MediaImage {
                        id
                        image { altText }
                      }
                    }
                  }
                }
              }
            }
          }
        `
      );

      const productsData = await productsQuery.json();
      const products = productsData.data?.products?.edges || [];

      for (const edge of products) {
        const prod = edge.node;
        const mediaNodes = prod.media?.nodes || [];
        const missingAltNodes = mediaNodes.filter((m: any) => !m.image?.altText || m.image.altText.trim() === "");

        if (missingAltNodes.length > 0) {
          const generatedAlt = altTemplate.replace(/\{\{title\}\}/g, prod.title).replace(/\{\{shop\}\}/g, shopName);
          const mediaUpdates = missingAltNodes.map((m: any) => ({
            id: m.id,
            alt: generatedAlt,
          }));

          await admin.graphql(
            `#graphql
              mutation updateMediaAlt($media: [UpdateMediaInput!]!, $productId: ID!) {
                productUpdateMedia(media: $media, productId: $productId) {
                  mediaUserErrors { field message }
                }
              }
            `,
            { variables: { productId: prod.id, media: mediaUpdates } }
          );
        }
      }

      return Response.json({ success: true, message: "Textos alternativos (ALT) actualizados con éxito." });
    }

    return Response.json({ error: "Intención no válida." }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message || "Error al procesar la acción." }, { status: 500 });
  }
};