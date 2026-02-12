
import { supabase } from './supabaseClient';

export const stripeService = {
  /**
   * Crea una sesión de Stripe Checkout y redirecciona al usuario
   */
  async createCheckoutSession(userId: string, interval: 'monthly' | 'semiannual' | 'yearly') {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', {
      body: { 
        userId, 
        interval,
        // En producción, usa URLs reales de tu dominio
        successUrl: window.location.origin + '?payment=success',
        cancelUrl: window.location.origin + '?payment=cancel'
      }
    });

    if (error) throw error;
    if (data?.url) {
      window.location.href = data.url;
    }
  },

  /**
   * Abre el portal de gestión de suscripciones de Stripe (para cancelar o cambiar tarjeta)
   */
  async openCustomerPortal(userId: string) {
    const { data, error } = await supabase.functions.invoke('stripe-portal', {
      body: { userId }
    });

    if (error) throw error;
    if (data?.url) {
      window.location.href = data.url;
    }
  }
};
