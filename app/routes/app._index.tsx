import React, { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useRevalidator, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// ==========================================
// 1. CARGA DE DATOS (LOADER) - Leer de Shopify
// ==========================================
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  let shop = { id: "", name: "Mi Tienda", myshopifyDomain: "", tagsHidden: false, appId: "" };
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
          shop { id name myshopifyDomain }
          currentAppInstallation { id tagsHidden: metafield(namespace: "seo", key: "tags_hidden") { value } }
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
    
    if (mainJson.data?.shop) { shop = { ...mainJson.data.shop, tagsHidden: mainJson.data.currentAppInstallation?.tagsHidden?.value === "1", appId: mainJson.data.currentAppInstallation?.id }; }
    
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

        return { id: node.id, numericId: String(node.id.split("/").pop()), title: node.title, handle: node.handle, status: node.status, imageUrl: node.featuredImage?.url || null, imageAlt: node.featuredImage?.altText || "", hasAlt, seoTitle, seoDesc, isHidden, score, issues, defaultCanonical, customCanonical };
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

        return { id: node.id, numericId: String(node.id.split("/").pop()), title: node.title, handle: node.handle, seoTitle, seoDesc, isHidden, score, issues, defaultCanonical, customCanonical };
      });
    }
  } catch (err: any) { 
    let msg = err.message || String(err);
    if (err instanceof Response) {
      const errorBody = await err.text().catch(() => "");
      console.log("❌ ERROR 403 BODY (Productos):", errorBody);
      console.log("🔍 MIS SCOPES EN RENDER SON:", process.env.SCOPES);
      msg = `HTTP ${err.status} - ${errorBody}`;
    }
    apiErrors.push("Conexión Productos: " + msg); 
  }

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

        return { id: node.id, numericId: String(node.id.split("/").pop()), title: node.title, handle: node.handle, seoTitle, seoDesc, isHidden, score, issues, defaultCanonical, customCanonical };
      });
    }
  } catch (err: any) { 
    let msg = err.message || String(err);
    if (err instanceof Response) {
      const errorBody = await err.text().catch(() => "");
      console.log("❌ ERROR 403 BODY (Páginas):", errorBody);
      msg = `HTTP ${err.status} - ${errorBody}`;
    }
    apiErrors.push("Conexión Páginas: " + msg); 
  }

  try {
    const blogsResponse = await admin.graphql(
      ` query getBlogsSEO { blogs(first: 10) { edges { node { id title handle articles(first: 50) { edges { node { id title handle summary image { url altText } seoTitleTag: metafield(namespace: "global", key: "title_tag") { value } seoDescTag: metafield(namespace: "global", key: "description_tag") { value } metafield(namespace: "seo", key: "hidden") { id value } canonicalUrl: metafield(namespace: "seo", key: "canonical_url") { id value } } } } } } } }`
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

          articles.push({ id: artNode.id, numericId: String(artNode.id.split("/").pop()), title: artNode.title, handle: artNode.handle, blogTitle: blogNode.title, blogHandle: blogNode.handle, authorName: "Autor", imageUrl: artNode.image?.url || null, imageAlt: artNode.image?.altText || "", seoTitle, seoDesc, isHidden, score, issues, defaultCanonical, customCanonical });
        });
      });
    }
  } catch (err: any) { 
    let msg = err.message || String(err);
    if (err instanceof Response) {
      const errorBody = await err.text().catch(() => "");
      console.log("❌ ERROR 403 BODY (Blog):", errorBody);
      msg = `HTTP ${err.status} - ${errorBody}`;
    }
    apiErrors.push("Conexión Blog: " + msg); 
  }

  const allScores = [
    ...products.filter((p) => !p.isHidden).map((p) => p.score),
    ...collections.filter((c) => !c.isHidden).map((c) => c.score),
    ...pages.filter((pg) => !pg.isHidden).map((pg) => pg.score),
    ...articles.filter((a) => !a.isHidden).map((a) => a.score)
  ];
  const totalScore = allScores.length > 0 ? Math.round(allScores.reduce((acc, curr) => acc + curr, 0) / allScores.length) : 100;
  
  return { shop, products, collections, pages, articles, totalScore, apiErrors, imagesWithoutAlt };
};