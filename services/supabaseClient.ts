
import { createClient } from 'https://jspm.dev/@supabase/supabase-js';

// Intentar obtener variables de entorno con fallback seguro
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

let supabaseInstance: any = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Supabase credentials missing. App will run in degraded mode.");
} else {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.error("❌ Failed to initialize Supabase client:", e);
  }
}

export const isSupabaseConfigured = () => !!supabaseUrl && !!supabaseAnonKey;

/**
 * Proxy para el cliente de Supabase que evita errores de 'undefined' 
 * si la inicialización falló.
 */
export const supabase = supabaseInstance || {
  auth: {
    getUser: async () => ({ data: { user: null }, error: new Error("Supabase not initialized") }),
    signInWithPassword: async () => ({ data: {}, error: new Error("Supabase not initialized") }),
    signUp: async () => ({ data: {}, error: new Error("Supabase not initialized") }),
    signOut: async () => ({ error: null }),
  },
  from: () => ({
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }), order: () => Promise.resolve({ data: [], error: null }) }) }),
    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }),
  functions: {
    invoke: async () => ({ data: null, error: new Error("Supabase not initialized") })
  }
};
