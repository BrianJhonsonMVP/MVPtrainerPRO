
export const getSupabaseConfig = () => {
  const url = localStorage.getItem('SUPABASE_URL') || (import.meta as any).env.VITE_SUPABASE_URL || null;
  const anonKey = localStorage.getItem('SUPABASE_ANON_KEY') || (import.meta as any).env.VITE_SUPABASE_ANON_KEY || null;
  const source = localStorage.getItem('SUPABASE_URL') ? 'localStorage' : 'env';
  
  return { url, anonKey, source };
};

export const saveSupabaseConfig = (url: string, anonKey: string) => {
  localStorage.setItem('SUPABASE_URL', url);
  localStorage.setItem('SUPABASE_ANON_KEY', anonKey);
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('SUPABASE_URL');
  localStorage.removeItem('SUPABASE_ANON_KEY');
};

export const getGeminiConfig = () => {
  return {
    apiKey: null, // IA segura: La llave ahora vive en Supabase Edge Functions
  };
};
