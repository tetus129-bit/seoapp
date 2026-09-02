// react-router.config.ts
import type { Config } from "@react-router/dev/config";

export default {
  // Permitir peticiones (POST) provenientes de los túneles de desarrollo de Shopify
  allowedActionOrigins: [
    "localhost:*",
    "*.trycloudflare.com", // Para el túnel por defecto de Shopify CLI
    "*.ngrok.io",          // Si usas ngrok
    "*.ngrok.free.app",
    "*.ngrok-free.app",
    "*.myshopify.com",
    // Agregamos dinámicamente el dominio del túnel actual inyectado por Shopify CLI:
    ...(process.env.SHOPIFY_APP_URL 
        ? [new URL(process.env.SHOPIFY_APP_URL).hostname] 
        : [])
  ],
} satisfies Config;