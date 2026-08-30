import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const allowedOrigins = () => (Deno.env.get("APP_ALLOWED_ORIGINS") || Deno.env.get("APP_PUBLIC_URL") || "")
  .split(",").map(value => value.trim().replace(/\/$/, "")).filter(Boolean);
const responseHeaders = (request: Request) => {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") || "";
  const origins = allowedOrigins();
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : origins[0] || "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
};

Deno.serve(async (request: Request) => {
  const headers = responseHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.confirmation !== "ELIMINAR") {
      return new Response(JSON.stringify({ error: "Confirmation is required" }), { status: 400, headers });
    }
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const { data: { user }, error: userError } = await admin.auth.getUser(authorization.slice("Bearer ".length));
    if (userError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

    const { data: subscriptions } = await admin.from("subscriptions").select("provider,external_subscription_id,status").eq("user_id", user.id);
    const mercadoPagoToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "";
    for (const subscription of subscriptions || []) {
      if (subscription.provider === "mercadopago" && subscription.external_subscription_id && mercadoPagoToken && ["active", "past_due"].includes(subscription.status)) {
        const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscription.external_subscription_id)}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${mercadoPagoToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" })
        });
        if (!response.ok) throw new Error("Could not cancel the active Mercado Pago subscription.");
      }
    }

    const { data: objects } = await admin.storage.from("trainer-assets").list(user.id, { limit: 100 });
    if (objects?.length) await admin.storage.from("trainer-assets").remove(objects.map(object => `${user.id}/${object.name}`));

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
    return new Response(JSON.stringify({ deleted: true }), { status: 200, headers });
  } catch (error) {
    console.error("delete-account", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: "The account could not be deleted. Verify active store subscriptions and try again." }), { status: 409, headers });
  }
});
