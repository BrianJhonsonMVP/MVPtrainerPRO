import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const jsonHeaders = { "Content-Type": "application/json" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const providerForStore = (store: string) => store === "APP_STORE" || store === "MAC_APP_STORE" ? "apple" : store === "PLAY_STORE" ? "google" : null;
const statusForEvent = (type: string) => {
  if (["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "TEMPORARY_ENTITLEMENT_GRANT"].includes(type)) return "active";
  if (type === "BILLING_ISSUE") return "past_due";
  if (type === "EXPIRATION") return "expired";
  if (type === "CANCELLATION") return "active";
  return null;
};
const intervalForProduct = (productId: string) => /annual|year|12month/i.test(productId) ? "yearly" : /semi|6month/i.test(productId) ? "semiannual" : "monthly";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  const expectedAuthorization = Deno.env.get("REVENUECAT_WEBHOOK_AUTHORIZATION") || "";
  if (!expectedAuthorization || request.headers.get("Authorization") !== expectedAuthorization) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  let eventRowId: string | null = null;
  try {
    const body = await request.json();
    const event = body?.event || {};
    const eventId = String(event.id || "");
    const eventType = String(event.type || "");
    const userId = String(event.app_user_id || "");
    const provider = providerForStore(String(event.store || ""));
    if (!eventId || !eventType || !provider || !uuidPattern.test(userId)) throw new Error("Invalid RevenueCat event.");

    const { data: eventRow, error: eventError } = await admin.from("billing_provider_events").insert({
      provider,
      provider_event_id: eventId,
      event_type: eventType,
      user_id: userId,
      payload: body
    }).select("id").single();
    if (eventError?.code === "23505") return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: jsonHeaders });
    if (eventError) throw eventError;
    eventRowId = eventRow.id;

    const status = statusForEvent(eventType);
    if (status) {
      const externalSubscriptionId = String(event.original_transaction_id || event.transaction_id || `${userId}:${event.product_id}`);
      const expiration = Number(event.expiration_at_ms);
      const purchased = Number(event.purchased_at_ms);
      const currentPeriodStart = Number.isFinite(purchased) ? new Date(purchased).toISOString() : new Date().toISOString();
      const currentPeriodEnd = Number.isFinite(expiration) ? new Date(expiration).toISOString() : new Date(Date.now() + 31 * 86400000).toISOString();
      const { data: existing } = await admin.from("subscriptions").select("id").eq("provider", provider).eq("external_subscription_id", externalSubscriptionId).maybeSingle();
      const values = {
        user_id: userId,
        provider,
        plan_type: "pro",
        billing_interval: intervalForProduct(String(event.product_id || "")),
        status,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: eventType === "CANCELLATION",
        canceled_at: eventType === "CANCELLATION" ? new Date().toISOString() : null,
        external_customer_id: userId,
        external_subscription_id: externalSubscriptionId,
        external_product_id: event.product_id || null,
        external_price_id: event.offer_code || null,
        metadata: { store: event.store, environment: event.environment, entitlementIds: event.entitlement_ids || [], periodType: event.period_type || null }
      };
      const write = existing ? admin.from("subscriptions").update(values).eq("id", existing.id) : admin.from("subscriptions").insert(values);
      const { error: writeError } = await write;
      if (writeError) throw writeError;
      await admin.from("billing_provider_events").update({ external_subscription_id: externalSubscriptionId, processed_at: new Date().toISOString() }).eq("id", eventRowId);
    } else {
      await admin.from("billing_provider_events").update({ processed_at: new Date().toISOString() }).eq("id", eventRowId);
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error";
    console.error("revenuecat-webhook", message);
    if (eventRowId) await admin.from("billing_provider_events").update({ processing_error: message }).eq("id", eventRowId);
    return new Response(JSON.stringify({ error: "Webhook could not be processed" }), { status: 400, headers: jsonHeaders });
  }
});
