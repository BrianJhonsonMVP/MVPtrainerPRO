import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { WebhookSignatureValidator } from "npm:mercadopago@3.6.0";

const jsonHeaders = { "Content-Type": "application/json" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const addMonths = (iso: string | null | undefined, months: number) => {
  const value = iso ? new Date(iso) : new Date();
  if (!Number.isFinite(value.getTime())) return new Date(Date.now() + 31 * 86400000).toISOString();
  value.setUTCMonth(value.getUTCMonth() + Math.max(1, months));
  return value.toISOString();
};

const fetchMercadoPago = async (path: string, token: string) => {
  const response = await fetch(`https://api.mercadopago.com${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Mercado Pago resource returned ${response.status}.`);
  return response.json();
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  let eventRowId: string | null = null;

  try {
    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const dataId = String(url.searchParams.get("data.id") || url.searchParams.get("data_id") || body?.data?.id || "");
    const signature = request.headers.get("x-signature") || "";
    const requestId = request.headers.get("x-request-id") || "";
    const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") || "";
    if (!dataId || !signature || !requestId || !secret) return new Response(JSON.stringify({ error: "Invalid notification" }), { status: 401, headers: jsonHeaders });

    WebhookSignatureValidator.validate({ xSignature: signature, xRequestId: requestId, dataId, secret });

    const type = String(body.type || url.searchParams.get("type") || "unknown");
    const action = String(body.action || "updated");
    const providerEventId = `${requestId}:${type}:${action}:${dataId}`;
    const { data: eventRow, error: eventError } = await admin.from("billing_provider_events").insert({
      provider: "mercadopago",
      provider_event_id: providerEventId,
      event_type: `${type}.${action}`,
      payload: body
    }).select("id").single();
    if (eventError?.code === "23505") return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: jsonHeaders });
    if (eventError) throw eventError;
    eventRowId = eventRow.id;

    const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "";
    if (!token) throw new Error("Mercado Pago access token is missing.");

    let preapprovalId = dataId;
    if (type === "payment") {
      const payment = await fetchMercadoPago(`/v1/payments/${encodeURIComponent(dataId)}`, token);
      preapprovalId = String(payment.metadata?.preapproval_id || payment.subscription_id || payment.external_reference || "");
    } else if (type === "subscription_authorized_payment") {
      const authorizedPayment = await fetchMercadoPago(`/authorized_payments/${encodeURIComponent(dataId)}`, token);
      preapprovalId = String(authorizedPayment.preapproval_id || "");
    }
    if (!preapprovalId) throw new Error("Notification is not linked to a subscription.");

    const subscription = await fetchMercadoPago(`/preapproval/${encodeURIComponent(preapprovalId)}`, token);
    const userId = String(subscription.external_reference || "");
    if (!uuidPattern.test(userId)) throw new Error("Subscription external_reference is not a valid user id.");

    const providerStatus = String(subscription.status || "pending");
    const status = providerStatus === "authorized" ? "active"
      : providerStatus === "cancelled" || providerStatus === "canceled" ? "canceled"
        : providerStatus === "paused" ? "past_due" : "past_due";
    const intervalMonths = Number(subscription.auto_recurring?.frequency) || 1;
    const periodStart = subscription.date_created || new Date().toISOString();
    const periodEnd = subscription.next_payment_date || addMonths(periodStart, intervalMonths);
    const billingInterval = intervalMonths >= 12 ? "yearly" : intervalMonths >= 6 ? "semiannual" : "monthly";

    const { data: existing } = await admin.from("subscriptions")
      .select("id")
      .eq("provider", "mercadopago")
      .eq("external_subscription_id", String(subscription.id))
      .maybeSingle();
    const values = {
      user_id: userId,
      provider: "mercadopago",
      plan_type: "pro",
      billing_interval: billingInterval,
      status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: status === "canceled",
      canceled_at: status === "canceled" ? new Date().toISOString() : null,
      external_customer_id: subscription.payer_id ? String(subscription.payer_id) : null,
      external_subscription_id: String(subscription.id),
      external_product_id: subscription.preapproval_plan_id || null,
      metadata: { providerStatus, reason: subscription.reason || null, liveMode: Boolean(body.live_mode) }
    };
    const write = existing
      ? admin.from("subscriptions").update(values).eq("id", existing.id)
      : admin.from("subscriptions").insert(values);
    const { error: writeError } = await write;
    if (writeError) throw writeError;

    await admin.from("billing_provider_events").update({ user_id: userId, external_subscription_id: String(subscription.id), processed_at: new Date().toISOString() }).eq("id", eventRowId);
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error";
    console.error("mercadopago-webhook", message);
    if (eventRowId) await admin.from("billing_provider_events").update({ processing_error: message }).eq("id", eventRowId);
    return new Response(JSON.stringify({ error: "Webhook could not be processed" }), { status: 400, headers: jsonHeaders });
  }
});
