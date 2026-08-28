import { User } from '../types';

export const LIMITS = {
  FREE_CLIENTS: 2,
  FREE_AI_ROUTINES_HISTORICAL: 2,
  FREE_AI_DIETS_HISTORICAL: 2,
  FREE_ROUTINES_WEEKLY: 2,
  FREE_DIETS_WEEKLY: 2,
  TRIAL_DAYS: 21
};

export interface PlanStatus {
  label: string;
  color: string;
  detail: string;
  bg: string;
}

export const getPlanStatusLabel = (user: User | null): PlanStatus => {
  if (!user) return { label: 'Sin sesión', color: 'text-zinc-500', detail: 'Inicia sesión para ver tu plan', bg: 'bg-zinc-900' };

  const type = user?.subscription?.type;
  const isActive = user?.subscription?.isActive;
  const isSyncing = user?.subscription?.isSyncing;

  if (isSyncing) {
    return {
      label: type === 'pro' && isActive ? 'Plan PRO' : 'Sincronizando tu plan…',
      color: type === 'pro' && isActive ? 'text-mvp-gold' : 'text-zinc-300',
      detail: 'Sincronizando tu cuenta…',
      bg: type === 'pro' && isActive ? 'bg-mvp-gold/10' : 'bg-zinc-900'
    };
  }

  if (!type) {
    return {
      label: 'Sincronizando tu plan…',
      color: 'text-zinc-300',
      detail: 'Sincronizando tu cuenta…',
      bg: 'bg-zinc-900'
    };
  }

  if (type === 'pro') {
    return {
      label: isActive ? 'Plan PRO' : 'Plan PRO (Expirado)',
      color: isActive ? 'text-mvp-gold' : 'text-zinc-500',
      detail: isActive ? 'Acceso total ilimitado' : 'Tu suscripción ha vencido',
      bg: isActive ? 'bg-mvp-gold/10' : 'bg-zinc-900'
    };
  }

  if (type === 'trial') {
    return {
      label: isActive ? 'Prueba Gratuita' : 'Acceso vencido',
      color: isActive ? 'text-violet-300' : 'text-zinc-500',
      detail: isActive ? 'Acceso completo durante 21 días' : 'Tus datos están protegidos hasta activar tu plan',
      bg: isActive ? 'bg-violet-500/10' : 'bg-zinc-900'
    };
  }

  return {
    label: 'Acceso vencido',
    color: 'text-zinc-400',
    detail: 'Tus datos están protegidos hasta activar tu plan',
    bg: 'bg-zinc-900'
  };
};

export const checkLimit = () => true;
export const checkAndResetUsage = () => {};

export const clearStaleUserCache = (trainerId?: string) => {
  localStorage.removeItem('mvptrainer_cached_user');
  if (trainerId) {
    localStorage.removeItem(`mvptrainer_usage_fallback_${trainerId}`);
  } else {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('mvptrainer_usage_fallback_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
};
