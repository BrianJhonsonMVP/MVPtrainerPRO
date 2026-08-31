import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

type BillingInterval = "monthly" | "semiannual" | "yearly";

const jsonHeaders = { "Content-Type": "application/json" };
const allowedIntervals = new Set<BillingInterval>(["monthly", "semiannual", "yearly"]);

const allowedOrigins = () => (Deno.env.get("APP_ALLOWED_ORIGINS") || Deno.env.get("APP_PUBLIC_URL") || "")
  .split(",")
  .map(value => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

const corsHeaders = (origin: string | null) => {
  const origins = allowedOrigins();
  const allowedOrigin = origin && origins.includes(origin.replace(/\/$/, "")) ? origin : origins[0] || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
};

const intervalConfig = (interval: BillingInterval) => {
  const suffix = interval === "monthly" ? "MONTHLY" : interval === "semiannual" ? "SEMIANNUAL" : "YEARLY";
  const frequency = interval === "monthly" ? 1 : interval === "semiannual" ? 6 : 12;
  const baseUsd = Number(Deno.env.get(`MVP_PRICE_${suffix}_USD`));
  const currency = (Deno.env.get("MERCADOPAGO_CHARGE_CURRENCY") || "PEN").toUpperCase();
  const configuredCharge = Number(Deno.env.get(`MERCADOPAGO_CHARGE_${suffix}`));
  const amount = currency === "USD" && !Number.isFinite(configuredCharge) ? baseUsd : configuredCharge;
  const planId = Deno.env.get(`MERCADOPAGO_PLAN_${suffix}_ID`) || "";
  if (!Number.isFinite(baseUsd) || baseUsd <= 0) {
    throw new Error(`Missing USD list price for ${interval}.`);
  }
  if (!planId && (!Number.isFinite(amount) || amount <= 0)) {
    throw new Error(`Missing Mercado Pago ${currency} charge amount or plan for ${interval}.`);
  }
  return { frequency, amount, planId, baseUsd, currency };
};

Deno.serve(async (request: Request) => {
  const cors = corsHeaders(request.headers.get("origin"));
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, ...jsonHeaders } });

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: authorization } } }
    );
    const token = authorization.slice("Bearer ".length);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.email) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, ...jsonHeaders } });

    const body = await request.json().catch(() => ({}));
    const interval = body.interval as BillingInterval;
    if (!allowedIntervals.has(interval)) return new Response(JSON.stringify({ error: "Invalid billing interval" }), { status: 400, headers: { ...cors, ...jsonHeaders } });

    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    const appUrl = (Deno.env.get("APP_PUBLIC_URL") || "").replace(/\/$/, "");
    if (!accessToken || !appUrl) throw new Error("Mercado Pago is not configured.");

    const { frequency, amount, planId, baseUsd, currency } = intervalConfig(interval);
    const payload: Record<string, unknown> = {
      reason: `MVP Trainer Pro - ${interval} (USD ${baseUsd.toFixed(2)})`,
      external_reference: user.id,
      payer_email: user.email,
      back_url: `${appUrl}/?billing=return`,
      status: "pending"
    };

    if (planId) {
      payload.preapproval_plan_id = planId;
    } else {
      payload.auto_recurring = {
        frequency,
        frequency_type: "months",
        transaction_amount: amount,
        currency_id: currency
      };
    }

    const response = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      console.error("Mercado Pago checkout error", response.status, result?.message || result?.error);
      return new Response(JSON.stringify({ error: "Could not start subscription checkout." }), { status: 502, headers: { ...cors, ...jsonHeaders } });
    }

    const checkoutUrl = result.init_point || result.sandbox_init_point;
    if (!checkoutUrl) throw new Error("Mercado Pago did not return a checkout URL.");
    return new Response(JSON.stringify({
      url: checkoutUrl,
      subscriptionId: result.id,
      listPrice: { amount: baseUsd, currency: "USD" },
      checkoutPrice: planId ? null : { amount, currency }
    }), { status: 200, headers: { ...cors, ...jsonHeaders } });
  } catch (error) {
    console.error("create-mercadopago-subscription", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: "Subscription checkout is temporarily unavailable." }), { status: 500, headers: { ...cors, ...jsonHeaders } });
  }
});
