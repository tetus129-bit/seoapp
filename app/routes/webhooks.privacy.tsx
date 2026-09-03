import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Webhook Recibido] Tema: ${topic} para la tienda: ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // Un cliente solicitó una copia de sus datos.
      // Si tu app no almacena datos personales de clientes (Pll), no hay nada que exportar.
      break;

    case "CUSTOMERS_REDACT":
      // Un cliente solicitó borrar sus datos.
      // Borra datos de ese cliente en tu base de datos si guardaras alguno.
      break;

    case "SHOP_REDACT":
      // 48 horas después de desinstalar la app, Shopify pide borrar los datos de la tienda.
      // Aquí puedes limpiar registros en Supabase para esa tienda si lo deseas.
      break;

    default:
      return new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response("OK", { status: 200 });
};