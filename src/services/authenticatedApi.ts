import { supabase } from './supabaseClient';

export const authenticatedApiFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  if (!supabase) throw new Error('Supabase no está configurado.');

  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) throw new Error('Tu sesión venció. Inicia sesión nuevamente.');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return fetch(input, { ...init, headers });
};
