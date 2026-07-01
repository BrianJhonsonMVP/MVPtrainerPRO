
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.1.0?target=deno'

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2022-11-15' })
  const signature = req.headers.get('stripe-signature')

  try {
    const body = await req.text()
    const event = stripe.webhooks.constructEvent(body, signature!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata.user_id

      await supabaseAdmin.from('profiles').update({
        subscription_type: 'pro',
        is_active: true,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Simplificado
      }).eq('id', userId)
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      await supabaseAdmin.from('profiles').update({
        subscription_type: 'free',
        is_active: false
      }).eq('stripe_subscription_id', subscription.id)
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
