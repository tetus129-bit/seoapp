import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const reloadUrl = url.searchParams.get("shopify-reload");

  if (reloadUrl) {
    return redirect(reloadUrl);
  }

  return redirect("/app");
};

// Necesario en React Router v7 para que no renderice el status HTTP como texto plano
export default function AuthBoundary() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};