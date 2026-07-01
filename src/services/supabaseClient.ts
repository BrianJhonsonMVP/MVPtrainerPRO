
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config/runtimeEnv';

const config = getSupabaseConfig();

export const isSupabaseEnabled = () => config.url !== null && config.anonKey !== null;

// Creamos la instancia solo si hay config, de lo contrario un mock nulo controlado
export const supabase = isSupabaseEnabled() 
  ? createClient(config.url!, config.anonKey!) 
  : null;

if (isSupabaseEnabled()) {
  console.log("%c DATA MODE: SUPABASE REALTIME ", "background: #3e9e3e; color: white; font-weight: bold; padding: 2px 5px; border-radius: 3px;");
} else {
  console.log("%c DATA MODE: LOCAL DEMO ", "background: #f59e0b; color: black; font-weight: bold; padding: 2px 5px; border-radius: 3px;");
}
