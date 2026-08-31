import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config/runtimeEnv';

const config = getSupabaseConfig();

export const isSupabaseEnabled = () => Boolean(config.url && config.anonKey);

export type OAuthProviderAvailability = {
  google: boolean;
  facebook: boolean;
};

export const getOAuthProviderAvailability = async (): Promise<OAuthProviderAvailability> => {
  if (!config.url || !config.anonKey) {
    return { google: false, facebook: false };
  }

  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.anonKey }
    });
    if (!response.ok) return { google: false, facebook: false };

    const settings = await response.json();
    return {
      google: settings?.external?.google === true,
      facebook: settings?.external?.facebook === true
    };
  } catch {
    return { google: false, facebook: false };
  }
};

const getBrowserStorage = () => {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
};

export const supabase = isSupabaseEnabled()
  ? createClient(config.url!, config.anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: getBrowserStorage()
      }
    })
  : null;

if (isSupabaseEnabled() && (import.meta as any).env?.DEV) {
  console.log('%c DATA MODE: SUPABASE REALTIME ', 'background: #3e9e3e; color: white; font-weight: bold; padding: 2px 5px; border-radius: 3px;');
} else if (!isSupabaseEnabled()) {
  console.warn('MVP Trainer Pro requires Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
}
